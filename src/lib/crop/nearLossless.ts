import { Buffer } from "buffer";

/**
 * Near-lossless preprocessing for LZ4: a pixel within `tolerance` (per
 * channel) of its left, then upper, neighbour's *output* value takes that
 * value, turning anti-aliasing noise and compression artefacts into runs the
 * LZ4 matcher can use. Every output channel differs from the source by at
 * most `tolerance`; tolerance 0 returns the input unchanged.
 */
export const nearLossless = (
  buffer: Buffer,
  width: number,
  height: number,
  tolerance: number,
): Buffer => {
  if (tolerance <= 0 || width <= 0 || height <= 0) return buffer;
  const out = Buffer.from(buffer);
  const stride = width * 3;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const i = row + x * 3;
      const r = buffer[i];
      const g = buffer[i + 1];
      const b = buffer[i + 2];
      if (x > 0) {
        const l = i - 3;
        if (
          Math.abs(r - out[l]) <= tolerance &&
          Math.abs(g - out[l + 1]) <= tolerance &&
          Math.abs(b - out[l + 2]) <= tolerance
        ) {
          out[i] = out[l];
          out[i + 1] = out[l + 1];
          out[i + 2] = out[l + 2];
          continue;
        }
      }
      if (y > 0) {
        const u = i - stride;
        if (
          Math.abs(r - out[u]) <= tolerance &&
          Math.abs(g - out[u + 1]) <= tolerance &&
          Math.abs(b - out[u + 2]) <= tolerance
        ) {
          out[i] = out[u];
          out[i + 1] = out[u + 1];
          out[i + 2] = out[u + 2];
        }
      }
    }
  }
  return out;
};
