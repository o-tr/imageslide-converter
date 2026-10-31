export const canvas2rgba32 = (canvas: OffscreenCanvas): Uint8Array => {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas not found");
  const data = context.getImageData(
    0,
    0,
    context.canvas.width,
    context.canvas.height,
  );
  const output = new Uint8Array(data.data.length);
  for (let i = 0; i * context.canvas.width * 4 < data.data.length; i++) {
    output.set(
      data.data.subarray(
        i * context.canvas.width * 4,
        (i + 1) * context.canvas.width * 4,
      ),
      (context.canvas.height - i - 1) * context.canvas.width * 4,
    );
  }
  return output;
};
