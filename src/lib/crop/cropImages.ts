import type { RawImageObjV1, RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { applyDiff } from "@/lib/crop/applyDiff";
import { diff2boundingBox } from "@/lib/crop/diff2boundingBox";
import { mergeOverlapBoundingBox } from "@/lib/crop/mergeOverlapBoundingBox";
import { optimizeBoundingBox } from "@/lib/crop/optimizeBoundingBox";
import { shrinkOverlapBoundingBox } from "@/lib/crop/shrinkOverlapBoundingBox";
import { computeThumbnail } from "./computeThumbnail";
import { type ParentCandidate, selectBestParent } from "./selectBestParent";

export interface CropOptions {
  keyframeInterval?: number;
  parentSearchWindow?: number;
  parentSearchTopK?: number;
  thumbnailGridSize?: number;
  maxNestingDepth?: number;
}

export const cropImages = (
  rawImages: RawImageObjV1[],
  options?: CropOptions,
): RawImageObjV1Cropped[] => {
  if (rawImages.length === 0) {
    return [];
  }

  const keyframeInterval = options?.keyframeInterval ?? 0;
  const parentSearchWindow =
    options?.parentSearchWindow ??
    (keyframeInterval > 0 ? keyframeInterval : 10);
  const parentSearchTopK = options?.parentSearchTopK ?? 3;
  const thumbnailGridSize = options?.thumbnailGridSize ?? 32;
  const maxNestingDepth = options?.maxNestingDepth ?? 3;

  // Track thumbnails for coarse similarity comparison (all slides, cheap to retain)
  const candidates: ParentCandidate[] = [];
  // Track full-resolution buffers for parent lookup (windowed + keyframes)
  const parentBuffers = new Map<number, Buffer>();
  // Track which indices are keyframes (never evicted from parentBuffers)
  const keyframeIndices = new Set<number>();
  // Track parent chain depth per slide (master=0, child of master=1, etc.)
  const depths = new Map<number, number>();

  const firstImage = rawImages[0];
  candidates.push({
    index: firstImage.index,
    thumbnail: computeThumbnail(
      firstImage.buffer,
      firstImage.rect.width,
      firstImage.rect.height,
      thumbnailGridSize,
    ),
    rect: firstImage.rect,
  });
  parentBuffers.set(firstImage.index, firstImage.buffer);
  keyframeIndices.add(firstImage.index);
  depths.set(firstImage.index, 0);

  const croppedImages: RawImageObjV1Cropped[] = [firstImage];

  for (let i = 1; i < rawImages.length; i++) {
    const currentImage = rawImages[i];

    const currentThumbnail = computeThumbnail(
      currentImage.buffer,
      currentImage.rect.width,
      currentImage.rect.height,
      thumbnailGridSize,
    );

    // Keyframe: store as master file
    if (keyframeInterval > 0 && i % keyframeInterval === 0) {
      candidates.push({
        index: currentImage.index,
        thumbnail: currentThumbnail,
        rect: currentImage.rect,
      });
      parentBuffers.set(currentImage.index, currentImage.buffer);
      keyframeIndices.add(currentImage.index);
      depths.set(currentImage.index, 0);
      croppedImages.push(currentImage);
      continue;
    }

    // Filter candidates whose nesting depth would not exceed the limit
    const eligibleCandidates = candidates.filter(
      (c) => (depths.get(c.index) ?? 0) < maxNestingDepth,
    );

    // Find the best parent among eligible candidates
    const bestParent = selectBestParent(
      currentImage,
      currentThumbnail,
      eligibleCandidates,
      parentBuffers,
      parentSearchTopK,
    );

    // If no suitable parent found or depth limit leaves no candidates, store as master
    if (!bestParent) {
      candidates.push({
        index: currentImage.index,
        thumbnail: currentThumbnail,
        rect: currentImage.rect,
      });
      parentBuffers.set(currentImage.index, currentImage.buffer);
      depths.set(currentImage.index, 0);
      croppedImages.push(currentImage);
      continue;
    }

    const diff = bestParent.diff;
    const diffBox = diff2boundingBox(
      diff,
      currentImage.rect.width,
      currentImage.rect.height,
    );
    const boundingBoxes = mergeOverlapBoundingBox(
      shrinkOverlapBoundingBox(diffBox),
    );
    const mergedBoundingBoxes = optimizeBoundingBox(
      boundingBoxes,
      currentImage.rect,
    );

    // If diff covers entire image or no meaningful diff, store as master
    if (
      mergedBoundingBoxes.length === 0 ||
      mergedBoundingBoxes[0].area ===
        currentImage.rect.width * currentImage.rect.height
    ) {
      candidates.push({
        index: currentImage.index,
        thumbnail: currentThumbnail,
        rect: currentImage.rect,
      });
      parentBuffers.set(currentImage.index, currentImage.buffer);
      depths.set(currentImage.index, 0);
      croppedImages.push(currentImage);
      continue;
    }

    const rects = mergedBoundingBoxes.map((box, index) => {
      const { x1: x, y1: y, width, height } = box;
      const buffer = Buffer.alloc(width * height * 3);
      for (let j = 0; j < height; j++) {
        const srcStart = ((y + j) * currentImage.rect.width + x) * 3;
        const destStart = j * width * 3;
        currentImage.buffer.copy(
          buffer,
          destStart,
          srcStart,
          srcStart + width * 3,
        );
      }
      return {
        index,
        x,
        y,
        width,
        height,
        buffer,
      };
    });

    // Build a proxy for applyDiff that uses the parent's buffer from our map
    // selectBestParent guarantees the buffer exists (it checks parentBuffers.get())
    const parentBuffer = parentBuffers.get(bestParent.parentIndex) as Buffer;
    const parentCandidate = candidates.find(
      (c) => c.index === bestParent.parentIndex,
    ) as ParentCandidate;
    const parentProxy: RawImageObjV1Cropped = {
      index: bestParent.parentIndex,
      rect: parentCandidate.rect,
      format: currentImage.format,
      buffer: parentBuffer,
    };

    const merged = applyDiff(parentProxy, currentImage, rects);
    const croppedImage: RawImageObjV1Cropped = {
      ...currentImage,
      cropped: {
        baseIndex: bestParent.parentIndex,
        rects,
        merged,
      },
    };
    croppedImages.push(croppedImage);

    // Register this slide as a candidate for future slides
    const parentDepth = depths.get(bestParent.parentIndex) ?? 0;
    depths.set(currentImage.index, parentDepth + 1);
    candidates.push({
      index: currentImage.index,
      thumbnail: currentThumbnail,
      rect: currentImage.rect,
    });
    parentBuffers.set(currentImage.index, merged);

    // Evict old non-keyframe buffers outside the search window
    for (const [idx] of parentBuffers) {
      if (
        idx < currentImage.index - parentSearchWindow &&
        !keyframeIndices.has(idx)
      ) {
        parentBuffers.delete(idx);
      }
    }
  }

  return croppedImages;
};
