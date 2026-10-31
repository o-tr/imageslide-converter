import type { RawImageObjV1, RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { IMAGE_DIFF_THRESHOLD } from "@/const/config";

const ACTUAL_DIFF_THRESHOLD = IMAGE_DIFF_THRESHOLD * 3;

export const rgb242diff = (
  imageA: RawImageObjV1Cropped,
  imageB: RawImageObjV1,
  stats?: { count: number; stopAt?: number },
  workspace?: Uint8Array,
): Uint8Array => {
  const imageABuffer = imageA.cropped?.merged ?? imageA.buffer;

  const width = imageB.rect.width;
  const height = imageB.rect.height;
  // The optional workspace must not alias either image buffer. Clearing it
  // preserves the zero-filled tail when the scan stops early.
  const result =
    workspace?.length === width * height
      ? workspace.fill(0)
      : new Uint8Array(width * height);
  let count = 0;
  // A caller comparing scores may stop once the candidate cannot improve.
  // When stopped early, the unvisited part of the returned mask stays zero.
  const stopAt = stats?.stopAt ?? Number.POSITIVE_INFINITY;
  if (stopAt <= 0) {
    if (stats) stats.count = 0;
    return result;
  }

  // Parent candidates normally have the same dimensions. Scan tightly
  // packed RGB directly and skip absolute values for identical pixels.
  if (
    width === imageA.rect.width &&
    height === imageA.rect.height &&
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width >= 0 &&
    height >= 0 &&
    imageABuffer.length >= result.length * 3 &&
    imageB.buffer.length >= result.length * 3
  ) {
    // Equal views into the same storage represent the exact same image.
    if (
      imageABuffer.buffer === imageB.buffer.buffer &&
      imageABuffer.byteOffset === imageB.buffer.byteOffset &&
      imageABuffer.byteLength === imageB.buffer.byteLength
    ) {
      if (stats) stats.count = 0;
      return result;
    }
    for (let pixel = 0, i = 0; pixel < result.length; pixel++, i += 3) {
      const r = imageABuffer[i] - imageB.buffer[i];
      const g = imageABuffer[i + 1] - imageB.buffer[i + 1];
      const b = imageABuffer[i + 2] - imageB.buffer[i + 2];
      if (
        (r !== 0 || g !== 0 || b !== 0) &&
        Math.abs(r) + Math.abs(g) + Math.abs(b) > ACTUAL_DIFF_THRESHOLD
      ) {
        result[pixel] = 1;
        if (++count >= stopAt) {
          if (stats) stats.count = count;
          return result;
        }
      }
    }
    if (stats) stats.count = count;
    return result;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const indexResult = y * width + x;
      if (x >= imageA.rect.width || y >= imageA.rect.height) {
        result[indexResult] = 1;
        count++;
        if (count >= stopAt) {
          if (stats) stats.count = count;
          return result;
        }
        continue;
      }
      const indexB = indexResult * 3;
      const indexA = (y * imageA.rect.width + x) * 3;
      const diff =
        Math.abs(imageABuffer[indexA] - imageB.buffer[indexB]) +
        Math.abs(imageABuffer[indexA + 1] - imageB.buffer[indexB + 1]) +
        Math.abs(imageABuffer[indexA + 2] - imageB.buffer[indexB + 2]);
      const changed = diff > ACTUAL_DIFF_THRESHOLD ? 1 : 0;
      result[indexResult] = changed;
      count += changed;
      if (changed && count >= stopAt) {
        if (stats) stats.count = count;
        return result;
      }
    }
  }
  if (stats) stats.count = count;
  return result;
};
