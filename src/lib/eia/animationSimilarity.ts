import { IMAGE_DIFF_THRESHOLD } from "@/const/config";

/** Inputs are same-length, complete RGB or RGBA frames. */
export function hasSimilarPixels(
  a: Uint8Array,
  b: Uint8Array,
  bytesPerPixel: number,
  maxDifferentPixels: number,
): boolean {
  const channelThreshold = IMAGE_DIFF_THRESHOLD * bytesPerPixel;
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
