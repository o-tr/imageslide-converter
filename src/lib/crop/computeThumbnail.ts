/**
 * Compute a low-resolution thumbnail (average color grid) from an RGB24 image buffer.
 * Used for fast coarse similarity comparison between slides.
 */
export const computeThumbnail = (
  buffer: Buffer | Uint8Array,
  width: number,
  height: number,
  gridSize = 32,
): Uint8Array => {
  const thumbnail = new Uint8Array(gridSize * gridSize * 3);

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const x0 = Math.floor((gx * width) / gridSize);
      const x1 = Math.floor(((gx + 1) * width) / gridSize);
      const y0 = Math.floor((gy * height) / gridSize);
      const y1 = Math.floor(((gy + 1) * height) / gridSize);

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 3;
          sumR += buffer[idx];
          sumG += buffer[idx + 1];
          sumB += buffer[idx + 2];
          count++;
        }
      }

      const thumbIdx = (gy * gridSize + gx) * 3;
      if (count > 0) {
        thumbnail[thumbIdx] = (sumR / count) | 0;
        thumbnail[thumbIdx + 1] = (sumG / count) | 0;
        thumbnail[thumbIdx + 2] = (sumB / count) | 0;
      }
    }
  }

  return thumbnail;
};
