import { Buffer } from "buffer";
import type { SelectedFile } from "@/_types/file-picker";
import type { RawImageObj } from "@/_types/text-zip/v0";
import { canvas2rgba32 } from "@/lib/canvas2rawImage/canvas2rgba32";
import { compressFileV0 } from "@/lib/text-zip/v0/compress";

export const selectedFiles2v0RGBA32 = async (
  files: SelectedFile[],
): Promise<string[]> => {
  const rawImages = files.map<RawImageObj>((file, index) => {
    return {
      index,
      rect: {
        width: file.canvas.width,
        height: file.canvas.height,
      },
      buffer: Buffer.from(canvas2rgba32(file.canvas)),
    };
  });
  return await compressFileV0(rawImages);
};
