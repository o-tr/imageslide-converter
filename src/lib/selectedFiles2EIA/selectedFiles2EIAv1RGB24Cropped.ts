import type { EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { canvas2rgb24 } from "@/lib/canvas2rawImage/canvas2rgb24";
import { compressEIAv1 } from "@/lib/eia/compressEIAv1";
import type { RawAnimationData } from "@/lib/eia/compressEIAv1";
import { cropImages } from "../crop/cropImages";

const keyframeInterval = 10;

export const selectedFiles2EIAv1RGB24Cropped = async (
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

  // Extract animation data per slide
  const animationMap = new Map<number, RawAnimationData[]>();
  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    if (!file.animations || file.animations.length === 0) continue;
    const anims: RawAnimationData[] = file.animations.map((anim) => ({
      x: anim.x,
      y: anim.y,
      w: anim.w,
      h: anim.h,
      fps: anim.fps,
      frames: anim.frames.map((frame) => ({
        width: frame.width,
        height: frame.height,
        buffer: Buffer.from(canvas2rgb24(frame)),
      })),
    }));
    animationMap.set(i, anims);
  }

  return await compressEIAv1(
    croppedImages,
    signage,
    1,
    keyframeInterval,
    animationMap.size > 0 ? animationMap : undefined,
  );
};
