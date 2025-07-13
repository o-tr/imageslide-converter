import type { SelectedFile } from "@/_types/file-picker";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { canvas2rgb24 } from "@/lib/canvas2rawImage/canvas2rgb24";
import { cropImages } from "@/lib/crop/cropImages";
import { compressFileV1 } from "@/lib/text-zip/v1/compress";

export const selectedFiles2v1RGB24Cropped = async (
  selectedFiles: SelectedFile[],
): Promise<string[]> => {
  const rawImages = selectedFiles.map<RawImageObjV1>((file, index) => ({
    index,
    rect: {
      width: file.canvas.width,
      height: file.canvas.height,
    },
    format: "RGB24",
    note: file.note,
    buffer: Buffer.from(canvas2rgb24(file.canvas)),
  }));
  console.log(
    `before compress size: ${rawImages.reduce((acc, cur) => acc + cur.buffer.length, 0)}`,
  );

  const croppedImages = cropImages(rawImages);
  console.log(
    `after compress size: ${croppedImages.reduce((acc, cur) => acc + (cur.cropped ? cur.cropped.rects.reduce((acc, cur) => acc + cur.buffer.length, 0) : cur.buffer.length), 0)}`,
  );

  return await compressFileV1(croppedImages);
};
