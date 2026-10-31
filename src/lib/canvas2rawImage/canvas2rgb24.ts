export const canvas2rgb24 = (canvas: OffscreenCanvas): Uint8Array => {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas not found");
  const { width, height } = context.canvas;
  const rgba = context.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  let destination = 0;
  for (let y = height - 1; y >= 0; y--) {
    let source = y * width * 4;
    for (let x = 0; x < width; x++) {
      rgb[destination++] = rgba[source++];
      rgb[destination++] = rgba[source++];
      rgb[destination++] = rgba[source++];
      source++; // Alpha is not stored in RGB24.
    }
  }
  return rgb;
};
