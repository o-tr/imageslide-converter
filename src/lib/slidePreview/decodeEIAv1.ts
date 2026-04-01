import type {
  EIAAnimationMeta,
  EIAFileV1Cropped,
  EIAManifestV1,
} from "@/_types/eia/v1";
import type { SlideAnimation, SlideFrame } from "@/_types/slide-preview";
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
  item: EIAFileV1Cropped,
  baseWidth: number,
): Uint8Array => {
  const bpp =
    item.f === "RGBA32"
      ? 4
      : isRgb24(item.f)
        ? 3
        : (() => {
            throw new Error(`Unsupported format in applyRects: "${item.f}"`);
          })();
  const result = new Uint8Array(baseBuffer);
  const baseHeight = baseBuffer.length / (baseWidth * bpp);
  for (const rect of item.r) {
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

export const decodeEIAv1 = (buffer: ArrayBuffer): SlideFrame[] => {
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
      const compressed = binarySection.subarray(item.s, item.s + item.l);
      decompressed = lz4Decompress(compressed, item.u, item.n);
    } else if (textSection !== null) {
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
      rawBuffer = applyRects(baseBuffer, decompressed, item, baseItem.w);
    }

    frameBuffers.set(item.n, rawBuffer);

    const index = Number(item.n);
    if (!Number.isFinite(index))
      throw new Error(`Non-numeric frame name: "${item.n}"`);

    // Decode animation data from e.a extension (binary lz4 only)
    let animations: SlideAnimation[] | undefined;
    if (item.e?.a && binarySection !== null) {
      try {
        const animMetas: EIAAnimationMeta[] = JSON.parse(item.e.a);
        animations = animMetas.map((meta) => {
          const animFrames: ImageData[] = [];
          for (const frameRef of meta.frames) {
            if (frameRef.s + frameRef.l > binarySection.length) {
              throw new Error(
                `Animation frame ref out of bounds: offset ${frameRef.s} + length ${frameRef.l} ` +
                  `exceeds binary section size ${binarySection.length}`,
              );
            }
            const compressedFrame = binarySection.subarray(
              frameRef.s,
              frameRef.s + frameRef.l,
            );
            const decompressedFrame = lz4Decompress(
              compressedFrame,
              frameRef.u,
              `anim_${item.n}`,
            );
            animFrames.push(
              rawToImageData(decompressedFrame, meta.w, meta.h, meta.f),
            );
          }
          return {
            x: meta.x,
            y: meta.y,
            w: meta.w,
            h: meta.h,
            fps: meta.fps,
            frames: animFrames,
          };
        });
      } catch (e) {
        console.warn(`Failed to decode animation for frame "${item.n}":`, e);
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

  return frames.sort((a, b) => a.index - b.index);
};
