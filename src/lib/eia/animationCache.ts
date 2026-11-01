import type { RawImageObjV1, RawImageObjV1Cropped } from "@/_types/text-zip/v1";

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;
const textEncoder = new TextEncoder();

export function createAnimationCacheKey(frames: RawImageObjV1[]): string {
  let hashA = FNV_OFFSET_BASIS_32;
  let hashB = (FNV_OFFSET_BASIS_32 ^ 0x9e3779b9) >>> 0;
  const updateBoth = (data: Uint8Array) => {
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      hashA = Math.imul(hashA ^ byte, FNV_PRIME_32) >>> 0;
      hashB = Math.imul(hashB ^ byte, FNV_PRIME_32) >>> 0;
    }
  };
  updateBoth(textEncoder.encode(`${frames.length}|`));
  for (const frame of frames) {
    updateBoth(
      textEncoder.encode(
        `${frame.rect.width}x${frame.rect.height}:${frame.format}:${frame.buffer.length}|`,
      ),
    );
    // Mix each pair of words into two independent accumulators. The key is
    // only a prefilter: every byte is verified on a hit. DataView supports
    // unaligned subarrays.
    const bytes = frame.buffer;
    const words = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    let i = 0;
    for (; i + 8 <= bytes.length; i += 8) {
      const a = words.getUint32(i, true);
      const b = words.getUint32(i + 4, true);
      hashA =
        Math.imul(hashA ^ a ^ Math.imul(b, 0x85ebca6b), FNV_PRIME_32) >>> 0;
      hashB =
        Math.imul(hashB ^ b ^ Math.imul(a, 0xc2b2ae35), FNV_PRIME_32) >>> 0;
    }
    if (i + 4 <= bytes.length) {
      const word = words.getUint32(i, true);
      hashA = Math.imul(hashA ^ word, FNV_PRIME_32) >>> 0;
      hashB = Math.imul(hashB ^ word, FNV_PRIME_32) >>> 0;
      i += 4;
    }
    for (; i < bytes.length; i++) {
      hashA = Math.imul(hashA ^ bytes[i], FNV_PRIME_32) >>> 0;
      hashB = Math.imul(hashB ^ bytes[i], FNV_PRIME_32) >>> 0;
    }
  }
  return `${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
}

/** The hash is only a filter: avoid reusing unrelated frames on a collision. */
export function sameAnimationFrames(
  frames: RawImageObjV1[],
  cached: RawImageObjV1Cropped[],
): boolean {
  if (frames.length !== cached.length) return false;
  return frames.every((frame, index) => {
    const other = cached[index];
    return (
      frame.rect.width === other.rect.width &&
      frame.rect.height === other.rect.height &&
      frame.format === other.format &&
      frame.buffer.equals(other.buffer)
    );
  });
}

export function findCachedAnimation(
  frames: RawImageObjV1[],
  bucket: RawImageObjV1Cropped[][] | undefined,
): RawImageObjV1Cropped[] | undefined {
  return bucket?.find((cached) => sameAnimationFrames(frames, cached));
}
