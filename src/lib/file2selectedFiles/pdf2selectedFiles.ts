import type { SelectedFile } from "@/_types/file-picker";
import { createId } from "@/lib/createId";
import { pdf2canvases } from "./pdf2canvases";

export const pdf2selectedFiles = async (
  file: File,
): Promise<SelectedFile[]> => {
  const images = await pdf2canvases(file);
  return images.map((canvas, i) => ({
    id: createId(),
    fileName: `${file.name} (${i + 1})`,
    canvas,
    metadata: {
      fileType: "pdf",
      file,
      index: i,
      scale: 1,
    },
  }));
};
