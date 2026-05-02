import type { RawAnimationData } from "@/_types/eia/rawAnimationData";
import type { EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import type { RawImageObjV1, RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { IMAGE_FORMAT_RGB24 } from "@/const/imageFormat";
import { canvas2rgb24 } from "@/lib/canvas2rawImage/canvas2rgb24";
import { compressEIAv1 } from "@/lib/eia/compressEIAv1";
import { cropImages } from "../crop/cropImages";

const keyframeInterval = 10;
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const FNV_MASK_64 = 0xffffffffffffffffn;
const textEncoder = new TextEncoder();

const updateFNV1a64 = (hash: bigint, data: Uint8Array): bigint => {
  let result = hash;
  for (let i = 0; i < data.length; i++) {
    result ^= BigInt(data[i]);
    result = (result * FNV_PRIME_64) & FNV_MASK_64;
  }
  return result;
};

const createAnimationCacheKey = (frames: RawImageObjV1[]): string => {
  let hash = FNV_OFFSET_BASIS_64;
  hash = updateFNV1a64(hash, textEncoder.encode(`${frames.length}|`));
  for (const frame of frames) {
    hash = updateFNV1a64(
      hash,
      textEncoder.encode(
        `${frame.rect.width}x${frame.rect.height}:${frame.format}:${frame.buffer.length}|`,
      ),
    );
    hash = updateFNV1a64(hash, frame.buffer);
  }
  return hash.toString(16).padStart(16, "0");
};

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
    format: IMAGE_FORMAT_RGB24,
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

  let animationMap: Map<number, RawAnimationData[]> | undefined;
  if (!signage) {
    // Extract animation data per slide (signage exports intentionally omit animations)
    const extractedAnimationMap = new Map<number, RawAnimationData[]>();
    // Cache crop results keyed by pre-crop frame buffers so identical GIFs
    // across slides share the same cropped frames (and pool dedup works).
    const animationCache = new Map<string, RawImageObjV1Cropped[]>();
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (!file.animations || file.animations.length === 0) continue;
      const anims: RawAnimationData[] = file.animations.map((anim) => {
        // Convert animation frames to RawImageObjV1 for cropImages
        const animRawImages = anim.frames.map<RawImageObjV1>((frame, fi) => ({
          index: fi,
          rect: { width: frame.width, height: frame.height },
          format: IMAGE_FORMAT_RGB24,
          buffer: Buffer.from(canvas2rgb24(frame)),
        }));
        const animHash = createAnimationCacheKey(animRawImages);
        const cachedFrames = animationCache.get(animHash);
        const croppedAnimFrames =
          cachedFrames ??
          cropImages(animRawImages, {
            keyframeInterval,
            parentSearchWindow: 5,
            parentSearchTopK: 1,
          });
        if (!cachedFrames) {
          animationCache.set(animHash, croppedAnimFrames);
        }
        return {
          x: anim.x,
          y: anim.y,
          w: anim.w,
          h: anim.h,
          fps: anim.fps,
          format: IMAGE_FORMAT_RGB24,
          frames: croppedAnimFrames,
        };
      });
      extractedAnimationMap.set(i, anims);
    }
    if (extractedAnimationMap.size > 0) {
      animationMap = extractedAnimationMap;
    }
  }

  return await compressEIAv1(
    croppedImages,
    signage,
    1,
    keyframeInterval,
    animationMap,
  );
};
