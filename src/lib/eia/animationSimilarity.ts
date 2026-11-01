import { IMAGE_DIFF_THRESHOLD } from "@/const/config";

/** Inputs are same-length, complete RGB or RGBA frames. */
export function hasSimilarPixels(
  a: Uint8Array,
  b: Uint8Array,
  bytesPerPixel: number,
  maxDifferentPixels: number,
): boolean {
  // The same byte range has no differing pixels, even when views differ.
  if (
    a.buffer === b.buffer &&
    a.byteOffset === b.byteOffset &&
    a.length === b.length
  )
    return true;
  const channelThreshold = IMAGE_DIFF_THRESHOLD * bytesPerPixel;
  // RGB and RGBA are the only formats used by animation frames. Unroll the
  // channel loop and avoid absolute-value work for exactly matching pixels.
  if (bytesPerPixel === 3) {
    const aw = new DataView(a.buffer, a.byteOffset, a.length);
    const bw = new DataView(b.buffer, b.byteOffset, b.length);
    let count = 0;
    let i = 0;
    for (; i + 12 <= a.length; i += 12) {
      if (
        aw.getUint32(i, true) === bw.getUint32(i, true) &&
        aw.getUint32(i + 4, true) === bw.getUint32(i + 4, true) &&
        aw.getUint32(i + 8, true) === bw.getUint32(i + 8, true)
      )
        continue;
      for (let j = i; j < i + 12; j += 3) {
        const d =
          Math.abs(a[j] - b[j]) +
          Math.abs(a[j + 1] - b[j + 1]) +
          Math.abs(a[j + 2] - b[j + 2]);
        if (d > channelThreshold && ++count > maxDifferentPixels) return false;
      }
    }
    for (; i < a.length; i += 3) {
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
  if (bytesPerPixel === 4 && ((a.byteOffset | b.byteOffset) & 3) === 0) {
    const aWords = new Uint32Array(a.buffer, a.byteOffset, a.length / 4);
    const bWords = new Uint32Array(b.buffer, b.byteOffset, b.length / 4);
    let count = 0;
    for (let pixel = 0; pixel < aWords.length; pixel++) {
      if (aWords[pixel] === bWords[pixel]) continue;
      const i = pixel * 4;
      const difference =
        Math.abs(a[i] - b[i]) +
        Math.abs(a[i + 1] - b[i + 1]) +
        Math.abs(a[i + 2] - b[i + 2]) +
        Math.abs(a[i + 3] - b[i + 3]);
      if (difference > channelThreshold && ++count > maxDifferentPixels)
        return false;
    }
    return true;
  }
  if (bytesPerPixel === 4) {
    const aWords = new DataView(a.buffer, a.byteOffset, a.length);
    const bWords = new DataView(b.buffer, b.byteOffset, b.length);
    let count = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (aWords.getUint32(i, true) === bWords.getUint32(i, true)) continue;
      const r = a[i] - b[i];
      const g = a[i + 1] - b[i + 1];
      const blue = a[i + 2] - b[i + 2];
      const alpha = a[i + 3] - b[i + 3];
      if (
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
