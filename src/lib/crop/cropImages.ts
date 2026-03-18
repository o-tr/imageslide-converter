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
  const parentSearchWindow = options?.parentSearchWindow ?? 10;
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

  const croppedImages: RawImageObjV1Cropped[] = [];

  // Register a slide as a master frame (no parent reference)
  const addAsMaster = (
    image: RawImageObjV1,
    thumbnail: Uint8Array,
    isKeyframe = false,
  ) => {
    candidates.push({ index: image.index, thumbnail, rect: image.rect });
    parentBuffers.set(image.index, image.buffer);
    depths.set(image.index, 0);
    if (isKeyframe) keyframeIndices.add(image.index);
    croppedImages.push(image);
  };

  // Evict parentBuffers and candidates entries outside the search window.
  // Uses loop index i (not image.index) so the window is position-stable
  // regardless of the actual .index values on each slide.
  // Must run after every iteration to enforce the memory bound on all paths.
  const evictOldEntries = (i: number) => {
    const threshold = i - parentSearchWindow;
    const toEvict = Array.from(parentBuffers.keys()).filter(
      (idx) => idx < threshold && !keyframeIndices.has(idx),
    );
    for (const idx of toEvict) {
      parentBuffers.delete(idx);
      depths.delete(idx);
    }
    for (let j = candidates.length - 1; j >= 0; j--) {
      if (
        candidates[j].index < threshold &&
        !keyframeIndices.has(candidates[j].index)
      ) {
        candidates.splice(j, 1);
      }
    }
  };

  const firstImage = rawImages[0];
  addAsMaster(
    firstImage,
    computeThumbnail(
      firstImage.buffer,
      firstImage.rect.width,
      firstImage.rect.height,
      thumbnailGridSize,
    ),
    true,
  );

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
      addAsMaster(currentImage, currentThumbnail, true);
      evictOldEntries(i);
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
      addAsMaster(currentImage, currentThumbnail);
      evictOldEntries(i);
      continue;
    }

    const diffBox = diff2boundingBox(
      bestParent.diff,
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
      addAsMaster(currentImage, currentThumbnail);
      evictOldEntries(i);
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
      return { index, x, y, width, height, buffer };
    });

    // Build a proxy for applyDiff using the parent's resolved buffer
    // selectBestParent guarantees the buffer exists (it checks parentBuffers.get())
    const parentBuffer = parentBuffers.get(bestParent.parent.index) as Buffer;
    const parentProxy: RawImageObjV1Cropped = {
      index: bestParent.parent.index,
      rect: bestParent.parent.rect,
      format: currentImage.format,
      buffer: parentBuffer,
    };

    const merged = applyDiff(parentProxy, currentImage, rects);
    croppedImages.push({
      ...currentImage,
      cropped: {
        baseIndex: bestParent.parent.index,
        rects,
        merged,
      },
    });

    // Register this slide as a candidate for future slides
    const parentDepth = depths.get(bestParent.parent.index) ?? 0;
    depths.set(currentImage.index, parentDepth + 1);
    candidates.push({
      index: currentImage.index,
      thumbnail: currentThumbnail,
      rect: currentImage.rect,
    });
    parentBuffers.set(currentImage.index, merged);

    evictOldEntries(i);
  }

  return croppedImages;
};
