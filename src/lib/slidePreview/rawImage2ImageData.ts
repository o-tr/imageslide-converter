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
  for (let row = 0; row < height; row++) {
    const srcRow = height - 1 - row;
    for (let col = 0; col < width; col++) {
      const srcIdx = (srcRow * width + col) * 3;
      const dstIdx = (row * width + col) * 4;
      imageData.data[dstIdx] = data[srcIdx];
      imageData.data[dstIdx + 1] = data[srcIdx + 1];
      imageData.data[dstIdx + 2] = data[srcIdx + 2];
      imageData.data[dstIdx + 3] = 255;
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
