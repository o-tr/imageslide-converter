import type { EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { canvas2rgb24 } from "@/lib/canvas2rawImage/canvas2rgb24";
import { cropImages } from "../crop/cropImages";
import { compressEIAv1Base64 } from "../eia/compressEIAv1Base64";

const keyframeInterval = 10;

export const selectedFiles2EIAv1RGB24CroppedBase64 = async (
  selectedFiles: SelectedFile[],
  signage?: EIASignageManifest,
): Promise<Buffer[]> => {
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

  const croppedImages = cropImages(rawImages, { keyframeInterval });
  console.log(
    `after compress size: ${croppedImages.reduce((acc, cur) => acc + (cur.cropped ? cur.cropped.rects.reduce((acc, cur) => acc + cur.buffer.length, 0) : cur.buffer.length), 0)}`,
  );

  return await compressEIAv1Base64(croppedImages, signage, 1, keyframeInterval);
};
