import type {
  EIAAnimFramePoolItem,
  EIAAnimationRef,
  EIAFileV1Cropped,
  EIAFileV1CroppedPart,
  EIAManifestV1,
} from "@/_types/eia/v1";
import type {
  DecodeResult,
  RawSignageItem,
  SlideAnimation,
  SlideFrame,
} from "@/_types/slide-preview";
import lz4 from "lz4js";
import { rgb24ToImageData, rgba32ToImageData } from "./rawImage2ImageData";

const base64ToUint8Array = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const isRgb24 = (format: string): boolean => format.startsWith("RGB24");

const lz4Decompress = (
  compressed: Uint8Array,
  uncompressedSize: number,
  frameName: string,
): Uint8Array => {
  const raw = lz4.decompress(compressed, uncompressedSize);
  if (!raw || !(raw as ArrayLike<number>).length)
    throw new Error(`lz4 decompression failed for frame "${frameName}"`);
  return new Uint8Array(raw as ArrayLike<number>);
};

const rawToImageData = (
  data: Uint8Array,
  width: number,
  height: number,
  format: string,
): ImageData => {
  if (format === "RGBA32") return rgba32ToImageData(data, width, height);
  if (isRgb24(format)) return rgb24ToImageData(data, width, height);
  throw new Error(`Unsupported image format: "${format}"`);
};

const applyRects = (
  baseBuffer: Uint8Array,
  decompressed: Uint8Array,
  rects: EIAFileV1CroppedPart[],
  baseWidth: number,
  format: string,
): Uint8Array => {
  const bpp =
    format === "RGBA32"
      ? 4
      : isRgb24(format)
        ? 3
        : (() => {
            throw new Error(`Unsupported format in applyRects: "${format}"`);
          })();
  const result = new Uint8Array(baseBuffer);
  const baseHeight = baseBuffer.length / (baseWidth * bpp);
  for (const rect of rects) {
    if (rect.x + rect.w > baseWidth || rect.y + rect.h > baseHeight)
      throw new Error(
        `Rect at (${rect.x},${rect.y}) size ${rect.w}×${rect.h} exceeds frame bounds ${baseWidth}×${baseHeight}`,
      );
    const rectData = decompressed.subarray(rect.s, rect.s + rect.l);
    const expectedBytes = rect.h * rect.w * bpp;
    if (rectData.length < expectedBytes)
      throw new Error(
        `Rect data too small: got ${rectData.length}, expected ${expectedBytes} for rect at (${rect.x},${rect.y})`,
      );
    for (let j = 0; j < rect.h; j++) {
      const srcOffset = j * rect.w * bpp;
      const dstOffset = ((rect.y + j) * baseWidth + rect.x) * bpp;
      result.set(
        rectData.subarray(srcOffset, srcOffset + rect.w * bpp),
        dstOffset,
      );
    }
  }
  return result;
};

const decodePoolFrame = (
  pool: EIAAnimFramePoolItem[],
  binarySection: Uint8Array,
  index: number,
  depth: number,
  memo: Map<number, Uint8Array>,
): Uint8Array => {
  if (depth > 64) {
    throw new Error(`Pool reference depth exceeded at index ${index}`);
  }
  const cached = memo.get(index);
  if (cached) return cached;

  const item = pool[index];
  if (!item) throw new Error(`Pool index ${index} out of bounds`);

  if (item.s < 0 || item.l < 0 || item.s + item.l > binarySection.length) {
    throw new Error(
      `Pool frame ${index} data out of bounds: offset ${item.s} + length ${item.l} ` +
        `exceeds binary section size ${binarySection.length}`,
    );
  }
  const compressed = binarySection.subarray(item.s, item.s + item.l);
  const decompressed = lz4Decompress(compressed, item.u, `pool_${index}`);

  let result: Uint8Array;
  if (item.t === "m") {
    // Keep memoized master frames isolated from accidental in-place mutation
    // by future callers.
    result = new Uint8Array(decompressed);
  } else {
    const base = decodePoolFrame(pool, binarySection, item.b, depth + 1, memo);
    result = applyRects(base, decompressed, item.r, item.w, item.f);
  }

  memo.set(index, result);
  return result;
};

export const decodeEIAv1 = (buffer: ArrayBuffer): DecodeResult => {
  const uint8 = new Uint8Array(buffer);
  const textDecoder = new TextDecoder();

  // Find '$' (byte 36) that ends the manifest header
  let dollarPos = 4; // skip "EIA^"
  while (dollarPos < uint8.length && uint8[dollarPos] !== 36) dollarPos++;
  if (dollarPos >= uint8.length) {
    throw new Error("EIA file is malformed: manifest delimiter '$' not found");
  }

  const manifest: EIAManifestV1 = JSON.parse(
    textDecoder.decode(uint8.subarray(4, dollarPos)),
  );
  if (manifest.v !== 1)
    throw new Error(`Unsupported EIA version: ${manifest.v}`);
  if (manifest.c !== "lz4" && manifest.c !== "lz4-base64")
    throw new Error(`Unsupported compression: ${manifest.c}`);
  const dataOffset = dollarPos + 1;

  // Decode the data section once, typed by compression method
  const binarySection =
    manifest.c === "lz4" ? uint8.subarray(dataOffset) : null;
  const textSection =
    manifest.c === "lz4-base64"
      ? textDecoder.decode(uint8.subarray(dataOffset))
      : null;

  // Pre-decode animation pool if present
  const poolDecoded = new Map<number, Uint8Array>();
  if (manifest.ac && binarySection) {
    for (let i = 0; i < manifest.ac.pool.length; i++) {
      if (!poolDecoded.has(i)) {
        decodePoolFrame(manifest.ac.pool, binarySection, i, 0, poolDecoded);
      }
    }
  }

  const baseNames = new Set(
    manifest.i
      .filter((f): f is EIAFileV1Cropped => f.t === "c")
      .map((f) => f.b),
  );
  const frameBuffers = new Map<string, Uint8Array>();
  const frames: SlideFrame[] = [];

  for (const item of manifest.i) {
    let decompressed: Uint8Array;

    if (binarySection !== null) {
      if (item.s < 0 || item.l < 0 || item.s + item.l > binarySection.length) {
        throw new Error(
          `Frame "${item.n}" data out of bounds: offset ${item.s} + length ${item.l} ` +
            `exceeds binary section size ${binarySection.length}`,
        );
      }
      const compressed = binarySection.subarray(item.s, item.s + item.l);
      decompressed = lz4Decompress(compressed, item.u, item.n);
    } else if (textSection !== null) {
      if (item.s < 0 || item.l < 0 || item.s + item.l > textSection.length) {
        throw new Error(
          `Frame "${item.n}" data out of bounds: offset ${item.s} + length ${item.l} ` +
            `exceeds text section size ${textSection.length}`,
        );
      }
      const b64 = textSection.substring(item.s, item.s + item.l);
      const compressed = base64ToUint8Array(b64);
      decompressed = lz4Decompress(compressed, item.u, item.n);
    } else {
      throw new Error(`Unsupported compression: ${manifest.c}`);
    }

    let rawBuffer: Uint8Array;
    if (item.t === "m") {
      rawBuffer = decompressed;
    } else {
      const baseBuffer = frameBuffers.get(item.b);
      if (!baseBuffer) throw new Error(`Base frame "${item.b}" not found`);
      const baseItem = manifest.i.find((f) => f.n === item.b);
      if (!baseItem)
        throw new Error(`Base frame "${item.b}" not found in manifest`);
      if (baseItem.w !== item.w || baseItem.h !== item.h)
        throw new Error(
          `Cropped frame "${item.n}" dimensions (${item.w}×${item.h}) ` +
            `differ from base "${item.b}" (${baseItem.w}×${baseItem.h})`,
        );
      if (baseItem.f !== item.f)
        throw new Error(
          `Cropped frame "${item.n}" format "${item.f}" ` +
            `differs from base "${item.b}" format "${baseItem.f}"`,
        );
      rawBuffer = applyRects(
        baseBuffer,
        decompressed,
        item.r,
        baseItem.w,
        item.f,
      );
    }

    frameBuffers.set(item.n, rawBuffer);

    const index = Number(item.n);
    if (!Number.isFinite(index))
      throw new Error(`Non-numeric frame name: "${item.n}"`);

    // Decode animation data from e.a extension
    let animations: SlideAnimation[] | undefined;
    if (item.e?.a) {
      if (!manifest.ac) {
        console.warn(
          `Slide "${item.n}" has animation refs but manifest.ac is missing`,
        );
      } else if (binarySection === null) {
        console.warn(
          `Animation data for frame "${item.n}" cannot be decoded under lz4-base64 compression`,
        );
      } else {
        const animRefs = Array.isArray(item.e.a)
          ? (item.e.a as EIAAnimationRef[])
          : [];
        const animationContainer = manifest.ac;
        const decodedAnimations = animRefs
          .map((ref, refIndex): SlideAnimation | null => {
            try {
              const anim = animationContainer.anims.find(
                (a) => a.id === ref.id,
              );
              if (!anim) {
                throw new Error(
                  `Animation id "${ref.id}" not found in manifest.ac.anims`,
                );
              }

              // Validate that all frames in seq share the same dimensions/format
              const firstPoolItem = animationContainer.pool[anim.seq[0]];
              if (!firstPoolItem) {
                throw new Error(`Invalid pool index ${anim.seq[0]} in seq`);
              }
              for (let si = 1; si < anim.seq.length; si++) {
                const poolItem = animationContainer.pool[anim.seq[si]];
                if (!poolItem) {
                  throw new Error(`Invalid pool index ${anim.seq[si]} in seq`);
                }
                if (
                  poolItem.w !== firstPoolItem.w ||
                  poolItem.h !== firstPoolItem.h ||
                  poolItem.f !== firstPoolItem.f
                ) {
                  throw new Error(
                    `Frame dimension/format mismatch in seq at index ${si}`,
                  );
                }
              }

              const animFrames: ImageData[] = [];
              for (const poolIdx of anim.seq) {
                const frameData = poolDecoded.get(poolIdx);
                if (!frameData) {
                  throw new Error(`Pool frame ${poolIdx} not decoded`);
                }
                const poolItem = animationContainer.pool[poolIdx];
                animFrames.push(
                  rawToImageData(frameData, poolItem.w, poolItem.h, poolItem.f),
                );
              }

              return {
                x: ref.x,
                y: ref.y,
                w: ref.w,
                h: ref.h,
                fps: anim.fps,
                frames: animFrames,
              };
            } catch (e) {
              console.warn(
                `Failed to decode animation ref index ${refIndex} for frame "${item.n}":`,
                ref,
                e,
              );
              return null;
            }
          })
          .filter((anim): anim is SlideAnimation => anim !== null);

        if (decodedAnimations.length > 0) {
          animations = decodedAnimations;
        }
      }
    }

    frames.push({
      index,
      width: item.w,
      height: item.h,
      imageData: rawToImageData(rawBuffer, item.w, item.h, item.f),
      animations,
    });

    // Release raw buffer if no later frame references it as a base
    if (!baseNames.has(item.n)) {
      frameBuffers.delete(item.n);
    }
  }

  const sortedFrames = frames.sort((a, b) => a.index - b.index);

  let rawSignageItems: RawSignageItem[] | undefined;
  if (manifest.m) {
    const deviceKeys = Object.keys(manifest.m);
    // Preview uses only the first device key. Multi-device EIA files carry separate
    // sequences per display profile; selecting one is intentional here.
    if (deviceKeys.length > 1) {
      console.warn(
        `EIA manifest has ${deviceKeys.length} device keys; preview uses only "${deviceKeys[0]}"`,
      );
    }
    const firstDeviceKey = deviceKeys[0];
    if (firstDeviceKey !== undefined) {
      const items = manifest.m[firstDeviceKey];
      // Preserve raw frame names so decodeSlides can do cross-part global resolution
      rawSignageItems = items.map((item) => ({
        frameName: item.f,
        duration: item.d,
      }));
    }
  }

  return { frames: sortedFrames, animation: null, rawSignageItems };
};
