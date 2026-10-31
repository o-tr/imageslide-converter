import type { RawImageObjV1, RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { IMAGE_DIFF_THRESHOLD } from "@/const/config";

const ACTUAL_DIFF_THRESHOLD = IMAGE_DIFF_THRESHOLD * 3;

export const rgb242diff = (
  imageA: RawImageObjV1Cropped,
  imageB: RawImageObjV1,
  stats?: { count: number; stopAt?: number },
): Uint8Array => {
  const imageABuffer = imageA.cropped?.merged ?? imageA.buffer;

  const width = imageB.rect.width;
  const height = imageB.rect.height;
  const result: Uint8Array = new Uint8Array(width * height);
  let count = 0;
  // A caller comparing scores may stop once the candidate cannot improve.
  // When stopped early, the unvisited part of the returned mask stays zero.
  const stopAt = stats?.stopAt ?? Number.POSITIVE_INFINITY;
  if (stopAt <= 0) {
    if (stats) stats.count = 0;
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
