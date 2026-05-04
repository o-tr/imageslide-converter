import type {
  EIAAnimFramePoolItem,
  EIAAnimationRef,
  EIAFileV1,
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
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const isRgb24 = (format: string): boolean => format === "RGB24";

const MAX_UNCOMPRESSED_SIZE = 512 * 1024 * 1024; // 512 MB

const lz4Decompress = (
  compressed: Uint8Array,
  uncompressedSize: number,
  frameName: string,
): Uint8Array => {
  if (
    !Number.isInteger(uncompressedSize) ||
    uncompressedSize < 0 ||
    uncompressedSize > MAX_UNCOMPRESSED_SIZE
  ) {
    throw new Error(
      `Invalid uncompressedSize for frame "${frameName}": ${uncompressedSize}`,
    );
  }
  const raw = lz4.decompress(compressed, uncompressedSize);
  if (!raw || !(raw as ArrayLike<number>).length)
    throw new Error(`lz4 decompression failed for frame "${frameName}"`);
  const result = new Uint8Array(raw as ArrayLike<number>);
  if (result.length !== uncompressedSize) {
    throw new Error(
      `lz4 decompression size mismatch for frame "${frameName}": expected ${uncompressedSize}, got ${result.length}`,
    );
  }
  return result;
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
  if (baseBuffer.length % (baseWidth * bpp) !== 0) {
    throw new Error(
      `Base buffer length ${baseBuffer.length} is not a multiple of baseWidth * bpp (${baseWidth} * ${bpp})`,
    );
  }
  const baseHeight = baseBuffer.length / (baseWidth * bpp);

  // Validate decompressed buffer size against total parts length (spec §8.3).
  // This aggregate check is complementary to the per-rect bounds checks below:
  // an overlapping rect layout could make the sum match while a specific rect
  // still overflows, so both guards are necessary.
  const totalPartLength = rects.reduce((sum, r) => sum + r.l, 0);
  if (totalPartLength !== decompressed.length) {
    throw new Error(
      `Decompressed buffer size mismatch: expected ${totalPartLength} (sum of part.l), got ${decompressed.length}`,
    );
  }

  for (const rect of rects) {
    if (
      !Number.isFinite(rect.x) ||
      !Number.isFinite(rect.y) ||
      !Number.isFinite(rect.w) ||
      !Number.isFinite(rect.h) ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.w <= 0 ||
      rect.h <= 0
    ) {
      throw new Error(
        `Rect has invalid geometry at (${rect.x},${rect.y}) size ${rect.w}×${rect.h}; expected x≥0, y≥0, w>0, h>0`,
      );
    }
    if (rect.x + rect.w > baseWidth || rect.y + rect.h > baseHeight)
      throw new Error(
        `Rect at (${rect.x},${rect.y}) size ${rect.w}×${rect.h} exceeds frame bounds ${baseWidth}×${baseHeight}`,
      );
    if (
      !Number.isFinite(rect.s) ||
      !Number.isFinite(rect.l) ||
      rect.s < 0 ||
      rect.l < 0
    ) {
      throw new Error(
        `Rect has invalid offset/length: s=${rect.s}, l=${rect.l}; both must be non-negative finite numbers`,
      );
    }
    if (rect.s + rect.l > decompressed.length) {
      throw new Error(
        `Rect offset out of bounds: part.s (${rect.s}) + part.l (${rect.l}) > decompressed length (${decompressed.length})`,
      );
    }
    const rectData = decompressed.subarray(rect.s, rect.s + rect.l);
    const expectedBytes = rect.h * rect.w * bpp;
    if (rectData.length !== expectedBytes)
      throw new Error(
        `Rect data size mismatch: got ${rectData.length}, expected ${expectedBytes} for rect at (${rect.x},${rect.y})`,
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
  visited: Set<number>,
): Uint8Array => {
  // Depth 65 (next recursive call passes depth === 65) exceeds the documented
  // 64-level recursion budget; deepest allowed entry is depth 64.
  if (depth > 64) {
    throw new Error(`Pool reference depth exceeded at index ${index}`);
  }
  const cached = memo.get(index);
  if (cached !== undefined) return cached;

  if (visited.has(index)) {
    throw new Error(`Circular pool reference detected at index ${index}`);
  }
  visited.add(index);

  const item = pool[index];
  if (!item) throw new Error(`Pool index ${index} out of bounds`);

  if (
    !Number.isFinite(item.s) ||
    !Number.isFinite(item.l) ||
    item.s < 0 ||
    item.l < 0 ||
    item.s + item.l > binarySection.length
  ) {
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
    if (!Number.isFinite(item.b)) {
      throw new Error(`Pool frame ${index} has invalid base index: ${item.b}`);
    }
    const baseItem = pool[item.b];
    if (!baseItem) {
      throw new Error(`Pool base index ${item.b} not found for frame ${index}`);
    }
    if (
      baseItem.f !== item.f ||
      baseItem.w !== item.w ||
      baseItem.h !== item.h
    ) {
      throw new Error(
        `Pool frame ${index} self-describing fields (f=${item.f}, w=${item.w}, h=${item.h}) ` +
          `mismatch base ${item.b} (f=${baseItem.f}, w=${baseItem.w}, h=${baseItem.h})`,
      );
    }
    if (!item.r || item.r.length === 0) {
      throw new Error(`Pool frame ${index} has empty or missing rects`);
    }
    const base = decodePoolFrame(
      pool,
      binarySection,
      item.b,
      depth + 1,
      memo,
      visited,
    );
    result = applyRects(base, decompressed, item.r, item.w, item.f);
  }

  memo.set(index, result);
  visited.delete(index);
  return result;
};

export const decodeEIAv1 = (buffer: ArrayBuffer): DecodeResult => {
  const uint8 = new Uint8Array(buffer);
  const textDecoder = new TextDecoder();

  // Validate magic bytes "EIA^" (0x45 0x49 0x41 0x5e)
  if (
    uint8.length < 4 ||
    uint8[0] !== 0x45 ||
    uint8[1] !== 0x49 ||
    uint8[2] !== 0x41 ||
    uint8[3] !== 0x5e
  ) {
    throw new Error("Invalid EIA header: magic bytes 'EIA^' not found");
  }

  // Find '$' (byte 36) that ends the manifest header.
  // The manifest JSON may legally contain '$' inside strings (e.g. notes),
  // so we scan forward and attempt JSON.parse at each candidate until one
  // succeeds. The first valid JSON object is the manifest.
  const MAX_HEADER_BYTES = 64 * 1024;
  const headerLimit = Math.min(uint8.length, 4 + MAX_HEADER_BYTES);
  let dollarPos = 4; // skip "EIA^"
  let manifest: EIAManifestV1 | undefined;
  while (dollarPos < headerLimit) {
    while (dollarPos < headerLimit && uint8[dollarPos] !== 36) dollarPos++;
    if (dollarPos >= headerLimit) break;
    try {
      const candidate = JSON.parse(
        textDecoder.decode(uint8.subarray(4, dollarPos)),
      ) as EIAManifestV1;
      if (candidate && candidate.t === "eia" && candidate.v === 1) {
        manifest = candidate;
        break;
      }
    } catch {
      /* invalid JSON — '$' was inside a string value */
    }
    dollarPos++;
  }
  if (!manifest) {
    throw new Error("EIA file is malformed: manifest delimiter '$' not found");
  }
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
  if (manifest.ac) {
    if (!Array.isArray(manifest.ac.pool) || !Array.isArray(manifest.ac.anims)) {
      throw new Error(
        "Invalid animation container: pool and anims must be arrays",
      );
    }
    if (manifest.ac.pool.length === 0 || manifest.ac.anims.length === 0) {
      throw new Error("Animation container pool and anims must not be empty");
    }
    if (binarySection) {
      for (let i = 0; i < manifest.ac.pool.length; i++) {
        if (!poolDecoded.has(i)) {
          decodePoolFrame(
            manifest.ac.pool,
            binarySection,
            i,
            0,
            poolDecoded,
            new Set<number>(),
          );
        }
      }
    } else {
      throw new Error(
        "Animation pool decoding requires binarySection; lz4-base64 mode does not support animation pools",
      );
    }
  }

  // Validate slide names are unique (spec §2.4.3)
  const seenNames = new Set<string>();
  for (const item of manifest.i) {
    if (seenNames.has(item.n)) {
      throw new Error(`Duplicate slide name "${item.n}" in manifest.i`);
    }
    seenNames.add(item.n);
  }

  // Validate animation ids are unique (spec §7.3)
  if (manifest.ac) {
    const seenAnimIds = new Set<string>();
    for (const anim of manifest.ac.anims) {
      if (seenAnimIds.has(anim.id)) {
        throw new Error(
          `Duplicate animation id "${anim.id}" in manifest.ac.anims`,
        );
      }
      seenAnimIds.add(anim.id);
    }
  }

  // Pre-pass: validate slide-level crop reference chains (depth + cycle checks)
  for (const item of manifest.i) {
    if (item.t !== "c") continue;
    const visited = new Set<string>();
    let current: EIAFileV1Cropped | undefined = item;
    let depth = 0;
    while (true) {
      if (!current) break;
      const c: EIAFileV1Cropped = current;
      if (depth > 64) {
        throw new Error(`Slide crop reference depth exceeded at "${item.n}"`);
      }
      if (visited.has(c.n)) {
        throw new Error(
          `Circular slide crop reference detected at "${item.n}"`,
        );
      }
      visited.add(c.n);
      const baseItem: EIAFileV1 | undefined = manifest.i.find(
        (f) => f.n === c.b,
      );
      if (!baseItem) {
        throw new Error(
          `Base frame "${c.b}" for slide "${c.n}" not found in manifest`,
        );
      }
      if (baseItem.w !== c.w || baseItem.h !== c.h) {
        throw new Error(
          `Cropped slide "${c.n}" dimensions (${c.w}×${c.h}) ` +
            `differ from base "${c.b}" (${baseItem.w}×${baseItem.h})`,
        );
      }
      if (baseItem.f !== c.f) {
        throw new Error(
          `Cropped slide "${c.n}" format "${c.f}" ` +
            `differs from base "${c.b}" format "${baseItem.f}"`,
        );
      }
      current = baseItem.t === "c" ? baseItem : undefined;
      depth++;
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
      if (
        !Number.isFinite(item.s) ||
        !Number.isFinite(item.l) ||
        item.s < 0 ||
        item.l < 0 ||
        item.s + item.l > binarySection.length
      ) {
        throw new Error(
          `Frame "${item.n}" data out of bounds: offset ${item.s} + length ${item.l} ` +
            `exceeds binary section size ${binarySection.length}`,
        );
      }
      const compressed = binarySection.subarray(item.s, item.s + item.l);
      decompressed = lz4Decompress(compressed, item.u, item.n);
    } else if (textSection !== null) {
      if (
        !Number.isFinite(item.s) ||
        !Number.isFinite(item.l) ||
        item.s < 0 ||
        item.l < 0 ||
        item.s + item.l > textSection.length
      ) {
        throw new Error(
          `Frame "${item.n}" data out of bounds: offset ${item.s} + length ${item.l} ` +
            `exceeds text section size ${textSection.length}`,
        );
      }
      const b64 = textSection.substring(item.s, item.s + item.l);
      const compressed = base64ToUint8Array(b64);
      decompressed = lz4Decompress(compressed, item.u, item.n);
    } else {
      // This path is unreachable because manifest.c is validated earlier
      // to be either "lz4" or "lz4-base64", which sets exactly one of
      // binarySection or textSection. Kept for TypeScript exhaustiveness.
      throw new Error("Internal error: decompression path not selected");
    }

    const bpp =
      item.f === "RGBA32"
        ? 4
        : item.f === "RGB24"
          ? 3
          : (() => {
              throw new Error(`Unsupported image format: "${item.f}"`);
            })();

    // Master: decompressed must equal full image size.
    // Cropped: decompressed is the concatenation of diff parts; size equals
    // the sum of all part.l values (manifest guarantees u matches this sum).
    if (item.t === "m" && decompressed.length !== item.w * item.h * bpp) {
      throw new Error(
        `Decompressed size mismatch for frame "${item.n}": expected ${item.w * item.h * bpp}, got ${decompressed.length}`,
      );
    }

    let rawBuffer: Uint8Array;
    if (item.t === "m") {
      rawBuffer = decompressed;
    } else {
      if (!item.r || item.r.length === 0) {
        throw new Error(`Cropped frame "${item.n}" has no rects`);
      }
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
    if (item.n === "" || !Number.isFinite(index) || !Number.isInteger(index))
      throw new Error(`Non-integer frame name: "${item.n}"`);

    // Decode animation data from e.a extension
    let animations: SlideAnimation[] | undefined;
    if (item.e?.a) {
      if (!manifest.ac) {
        throw new Error(
          `Slide "${item.n}" has animation refs but manifest.ac is missing`,
        );
      }
      if (binarySection === null) {
        console.warn(
          `Animation data for frame "${item.n}" cannot be decoded under lz4-base64 compression`,
        );
      } else {
        const refsField = item.e.a;
        let animRefs: EIAAnimationRef[];
        if (Array.isArray(refsField)) {
          animRefs = refsField as EIAAnimationRef[];
        } else if (typeof refsField === "string") {
          console.warn(
            `Slide "${item.n}" has legacy JSON-string animation refs in e.a; decode skipped (expected EIAAnimationRef[]).`,
          );
          animRefs = [];
        } else {
          animRefs = [];
        }
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

              if (!(anim.fps > 0) || !Number.isFinite(anim.fps)) {
                throw new Error(
                  `Animation "${anim.id}" has invalid fps: ${anim.fps}`,
                );
              }

              if (anim.seq.length === 0) {
                throw new Error(`Animation "${anim.id}" has empty seq`);
              }

              if (
                !Number.isFinite(ref.x) ||
                !Number.isFinite(ref.y) ||
                !Number.isFinite(ref.w) ||
                !Number.isFinite(ref.h) ||
                ref.x < 0 ||
                ref.y < 0 ||
                ref.w <= 0 ||
                ref.h <= 0 ||
                ref.x >= item.w ||
                ref.y >= item.h
              ) {
                throw new Error(
                  `Animation ref ${refIndex} has invalid bounds: (${ref.x},${ref.y}) size ${ref.w}×${ref.h} for slide ${item.w}×${item.h}`,
                );
              }

              // Clip to slide bounds as required by spec §7.4
              const clipW = Math.min(ref.w, item.w - ref.x);
              const clipH = Math.min(ref.h, item.h - ref.y);

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
                w: clipW,
                h: clipH,
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
