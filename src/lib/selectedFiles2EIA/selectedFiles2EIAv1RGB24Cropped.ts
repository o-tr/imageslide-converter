import { Buffer } from "buffer";
import type { RawAnimationData } from "@/_types/eia/rawAnimationData";
import type { EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import type { RawImageObjV1, RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import {
  IMAGE_NEAR_LOSSLESS_TOLERANCE,
  SLIDE_PARENT_DEPTH_PENALTY,
  SLIDE_PARENT_MAX_DEPTH,
} from "@/const/config";
import { IMAGE_FORMAT_RGB24 } from "@/const/imageFormat";
import { canvas2rgb24 } from "@/lib/canvas2rawImage/canvas2rgb24";
import {
  createAnimationCacheKey,
  findCachedAnimation,
} from "@/lib/eia/animationCache";
import { compressEIAv1 } from "@/lib/eia/compressEIAv1";
import { EiaCompressionCache } from "@/lib/eia/compressionCache";
import lz4 from "lz4js";
import { cropImages } from "../crop/cropImages";
import { nearLossless } from "../crop/nearLossless";
import { planParents } from "../crop/planParents";

const keyframeInterval = 10;
const canvasToBuffer = (canvas: OffscreenCanvas) => {
  const pixels = canvas2rgb24(canvas);
  return Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
};
export const selectedFiles2EIAv1RGB24Cropped = async (
  selectedFiles: SelectedFile[],
  signage?: EIASignageManifest,
  onProgress?: (completed: number, total: number) => void,
): Promise<Buffer> => {
  const rawImages = selectedFiles.map<RawImageObjV1>((file, index) => ({
    index,
    rect: {
      width: file.canvas.width,
      height: file.canvas.height,
    },
    format: IMAGE_FORMAT_RGB24,
    note: file.note,
    buffer: nearLossless(
      canvasToBuffer(file.canvas),
      file.canvas.width,
      file.canvas.height,
      IMAGE_NEAR_LOSSLESS_TOLERANCE,
    ),
  }));
  console.log(
    `before compress size: ${rawImages.reduce((acc, cur) => acc + cur.buffer.length, 0)}`,
  );

  const compressionCache = new EiaCompressionCache();
  // Parents and keyframes come from a similarity graph over the whole deck
  // instead of a fixed keyframe interval and a sliding window.
  const parentPlan = planParents(rawImages, {
    estimateSize: (payload) => lz4.compress(payload).length,
    maxDepth: SLIDE_PARENT_MAX_DEPTH,
    depthPenalty: SLIDE_PARENT_DEPTH_PENALTY,
  });
  const croppedImages = cropImages(rawImages, {
    parentPlan,
    onProgress,
    optimizeEia: true,
    compressionCache,
  });
  console.log(
    `after compress size: ${croppedImages.reduce((acc, cur) => acc + (cur.cropped ? cur.cropped.rects.reduce((acc, cur) => acc + cur.buffer.length, 0) : cur.buffer.length), 0)}`,
  );

  let animationMap: Map<number, RawAnimationData[]> | undefined;
  if (!signage) {
    // Extract animation data per slide (signage exports intentionally omit animations)
    const extractedAnimationMap = new Map<number, RawAnimationData[]>();
    // Cache crop results keyed by pre-crop frame buffers so identical GIFs
    // across slides share the same cropped frames (and pool dedup works).
    const animationCache = new Map<string, RawImageObjV1Cropped[][]>();
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (!file.animations || file.animations.length === 0) continue;
      const anims: RawAnimationData[] = file.animations.map((anim) => {
        // Convert animation frames to RawImageObjV1 for cropImages
        const animRawImages = anim.frames.map<RawImageObjV1>((frame, fi) => ({
          index: fi,
          rect: { width: frame.width, height: frame.height },
          format: IMAGE_FORMAT_RGB24,
          buffer: canvasToBuffer(frame),
        }));
        const animHash = createAnimationCacheKey(animRawImages);
        const bucket = animationCache.get(animHash);
        const cachedFrames = findCachedAnimation(animRawImages, bucket);
        const croppedAnimFrames =
          cachedFrames ??
          cropImages(animRawImages, {
            keyframeInterval,
            parentSearchWindow: 5,
            parentSearchTopK: 1,
            optimizeEia: true,
            compressionCache,
          });
        if (!cachedFrames) {
          if (bucket) bucket.push(croppedAnimFrames);
          else animationCache.set(animHash, [croppedAnimFrames]);
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
    animationMap,
    compressionCache,
  );
};
