// Images are stored bottom-up (vertically flipped from canvas2rgba32).
// Flip back when converting to browser ImageData (top-down).

export const rgb24ToImageData = (
  data: Uint8Array,
  width: number,
  height: number,
): ImageData => {
  const needed = width * height * 3;
  if (data.length < needed)
    throw new Error(
      `rgb24ToImageData: buffer too small (got ${data.length}, need ${needed})`,
    );
  const imageData = new ImageData(width, height);
  // Use Uint32Array view: 1 write per pixel instead of 4
  // Layout is 0xAABBGGRR on little-endian (all modern browsers)
  const dst32 = new Uint32Array(imageData.data.buffer);
  for (let row = 0; row < height; row++) {
    const srcRow = height - 1 - row;
    const srcBase = srcRow * width * 3;
    const dstBase = row * width;
    for (let col = 0; col < width; col++) {
      const s = srcBase + col * 3;
      dst32[dstBase + col] =
        data[s] | (data[s + 1] << 8) | (data[s + 2] << 16) | 0xff000000;
    }
  }
  return imageData;
};

export const rgba32ToImageData = (
  data: Uint8Array,
  width: number,
  height: number,
): ImageData => {
  const needed = width * height * 4;
  if (data.length < needed)
    throw new Error(
      `rgba32ToImageData: buffer too small (got ${data.length}, need ${needed})`,
    );
  const imageData = new ImageData(width, height);
  for (let row = 0; row < height; row++) {
    const srcRow = height - 1 - row;
    const srcOffset = srcRow * width * 4;
    const dstOffset = row * width * 4;
    imageData.data.set(
      data.subarray(srcOffset, srcOffset + width * 4),
      dstOffset,
    );
  }
  return imageData;
};
