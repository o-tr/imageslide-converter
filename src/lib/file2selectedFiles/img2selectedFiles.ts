import type { SelectedFile } from "@/_types/file-picker";
import { createId } from "@/lib/createId";

export const img2selectedFiles = async (
  file: File,
): Promise<[SelectedFile]> => {
  const canvas = await imgFile2offscreenCanvas(file);
  return [
    {
      id: createId(),
      fileName: file.name,
      canvas,
      metadata: {
        fileType: "image",
      },
    },
  ];
};

const imgFile2offscreenCanvas = async (
  file: File,
): Promise<OffscreenCanvas> => {
  return new Promise<OffscreenCanvas>((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const { width, height } = { width: img.width, height: img.height };
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas not found");
      canvas.width = width;
      canvas.height = height;
      context.drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
  });
};
