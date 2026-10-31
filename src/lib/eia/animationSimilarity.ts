import { IMAGE_DIFF_THRESHOLD } from "@/const/config";

/** Inputs are same-length, complete RGB or RGBA frames. */
export function hasSimilarPixels(
  a: Uint8Array,
  b: Uint8Array,
  bytesPerPixel: number,
  maxDifferentPixels: number,
): boolean {
  const channelThreshold = IMAGE_DIFF_THRESHOLD * bytesPerPixel;
  // RGB and RGBA are the only formats used by animation frames. Unroll the
  // channel loop and avoid absolute-value work for exactly matching pixels.
  if (bytesPerPixel === 3) {
    let count = 0;
    for (let i = 0; i < a.length; i += 3) {
      const r = a[i] - b[i];
      const g = a[i + 1] - b[i + 1];
      const blue = a[i + 2] - b[i + 2];
      if (
        (r !== 0 || g !== 0 || blue !== 0) &&
        Math.abs(r) + Math.abs(g) + Math.abs(blue) > channelThreshold &&
        ++count > maxDifferentPixels
      )
        return false;
    }
    return true;
  }
  if (bytesPerPixel === 4) {
    let count = 0;
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i] - b[i];
      const g = a[i + 1] - b[i + 1];
      const blue = a[i + 2] - b[i + 2];
      const alpha = a[i + 3] - b[i + 3];
      if (
        (r !== 0 || g !== 0 || blue !== 0 || alpha !== 0) &&
        Math.abs(r) + Math.abs(g) + Math.abs(blue) + Math.abs(alpha) >
          channelThreshold &&
        ++count > maxDifferentPixels
      )
        return false;
    }
    return true;
  }
  let differentPixels = 0;
  for (let offset = 0; offset < a.length; offset += bytesPerPixel) {
    let difference = 0;
    for (let channel = 0; channel < bytesPerPixel; channel++) {
      difference += Math.abs(a[offset + channel] - b[offset + channel]);
    }
    if (difference > channelThreshold && ++differentPixels > maxDifferentPixels)
      return false;
  }
  return true;
}
