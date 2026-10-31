import { Buffer } from "buffer";
import type { RawImageObjV1, RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { applyDiff } from "@/lib/crop/applyDiff";
import { diff2boundingBox } from "@/lib/crop/diff2boundingBox";
import { mergeOverlapBoundingBox } from "@/lib/crop/mergeOverlapBoundingBox";
import { optimizeBoundingBox } from "@/lib/crop/optimizeBoundingBox";
import { shrinkOverlapBoundingBox } from "@/lib/crop/shrinkOverlapBoundingBox";
import type { EiaCompressionCache } from "@/lib/eia/compressionCache";
import { compressLz4Best } from "@/lib/eia/lz4Search";
import { lz4FrameSizeLowerBound } from "@/lib/eia/lz4SizeBound";
import { computeThumbnail } from "./computeThumbnail";
import { type ParentCandidate, selectBestParent } from "./selectBestParent";

export interface CropOptions {
  onProgress?: (completed: number, total: number) => void;
  keyframeInterval?: number;
  parentSearchWindow?: number;
  parentSearchTopK?: number;
  thumbnailGridSize?: number;
  maxNestingDepth?: number;
  optimizeEia?: boolean;
  compressionCache?: EiaCompressionCache;
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
  const parentSearchTopK = Math.max(1, options?.parentSearchTopK ?? 3);
  const thumbnailGridSize = options?.thumbnailGridSize ?? 32;
  const maxNestingDepth = Math.max(1, options?.maxNestingDepth ?? 3);

  // Track thumbnails for coarse similarity comparison (all slides, cheap to retain)
  const candidates: ParentCandidate[] = [];
  // Track full-resolution buffers for parent lookup (windowed + keyframes)
  const parentBuffers = new Map<number, Buffer>();
  // Track which indices are keyframes (never evicted from parentBuffers)
  const keyframeIndices = new Set<number>();
  // Track parent chain depth per slide (master=0, child of master=1, etc.)
  const depths = new Map<number, number>();
  // Map image.index -> loop position i so eviction threshold is always
  // compared against loop positions, not image.index values (which may
  // be non-sequential or non-zero-based).
  const loopPositions = new Map<number, number>();

  const croppedImages: RawImageObjV1Cropped[] = [];

  // Register a slide as a master frame (no parent reference)
  const addAsMaster = (
    image: RawImageObjV1,
    thumbnail: Uint8Array,
    loopPos: number,
    isKeyframe = false,
  ) => {
    loopPositions.set(image.index, loopPos);
    candidates.push({ index: image.index, thumbnail, rect: image.rect });
    parentBuffers.set(image.index, image.buffer);
    depths.set(image.index, 0);
    if (isKeyframe) keyframeIndices.add(image.index);
    croppedImages.push(image);
  };

  // Evict entries outside the search window. Eviction threshold is compared
  // against loop positions (not image.index) via loopPositions.
  // Must run after every iteration to enforce the memory bound on all paths.
  const evictOldEntries = (i: number) => {
    const threshold = i - parentSearchWindow;
    const toEvict = Array.from(parentBuffers.keys()).filter((idx) => {
      const loopPos = loopPositions.get(idx);
      if (loopPos === undefined) return false; // invariant: should never be absent
      return loopPos < threshold && !keyframeIndices.has(idx);
    });
    for (const idx of toEvict) {
      parentBuffers.delete(idx);
      depths.delete(idx);
      loopPositions.delete(idx);
    }
    for (let j = candidates.length - 1; j >= 0; j--) {
      if (
        (loopPositions.get(candidates[j].index) ?? 0) < threshold &&
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
    0,
    true,
  );
  options?.onProgress?.(1, rawImages.length);

  for (let i = 1; i < rawImages.length; i++) {
    if (i > 1) options?.onProgress?.(i, rawImages.length);
    const currentImage = rawImages[i];

    const currentThumbnail = computeThumbnail(
      currentImage.buffer,
      currentImage.rect.width,
      currentImage.rect.height,
      thumbnailGridSize,
    );

    // Keyframe: store as master file
    if (keyframeInterval > 0 && i % keyframeInterval === 0) {
      addAsMaster(currentImage, currentThumbnail, i, true);
      evictOldEntries(i);
      continue;
    }

    // Filter candidates whose nesting depth would not exceed the limit
    const eligibleCandidates = candidates.filter(
      (c) =>
        (depths.get(c.index) ?? 0) < maxNestingDepth &&
        c.rect.width === currentImage.rect.width &&
        c.rect.height === currentImage.rect.height,
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
      addAsMaster(currentImage, currentThumbnail, i);
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

    const parentBuffer = parentBuffers.get(bestParent.parent.index) as Buffer;
    // An identical slide can reference its parent using a one-pixel no-op.
    // Keep threshold-suppressed differences as masters, preserving image quality.
    let identicalParent = false;
    if (
      options?.optimizeEia &&
      mergedBoundingBoxes.length === 0 &&
      parentBuffer.equals(currentImage.buffer) &&
      currentImage.rect.width > 0 &&
      currentImage.rect.height > 0
    ) {
      identicalParent = true;
      mergedBoundingBoxes.push({
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        width: 1,
        height: 1,
        area: 1,
      });
    }

    if (
      mergedBoundingBoxes.length === 0 ||
      (mergedBoundingBoxes[0].area ===
        currentImage.rect.width * currentImage.rect.height &&
        !(options?.optimizeEia && parentBuffer.equals(currentImage.buffer)))
    ) {
      addAsMaster(currentImage, currentThumbnail, i);
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
    // Compare the actual LZ4 frame sizes and the extra JSON fields. Choosing a
    // smaller master also eliminates the parent dependency and rect copies.
    if (options?.optimizeEia) {
      const payload = Buffer.concat(rects.map((rect) => rect.buffer));
      let offset = 0;
      const parts = rects.map((rect) => {
        const part = {
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
          s: offset,
          l: rect.buffer.length,
        };
        offset += rect.buffer.length;
        return part;
      });
      const deltaLength = (
        options.compressionCache?.compressRects(rects, payload) ??
        compressLz4Best(payload)
      ).length;
      // The braces in this JSON have the same size as the two field separators
      // introduced into the item; l and u may also change decimal width.
      const deltaFixedCost =
        deltaLength +
        Buffer.byteLength(
          JSON.stringify({ b: `${bestParent.parent.index}`, r: parts }),
        ) +
        String(deltaLength).length -
        String(payload.length).length -
        String(currentImage.buffer.length).length;
      // Every standard LZ4 input byte accounts for at most 255 decoded bytes:
      // length extensions contribute at most 255 each, while a token's
      // implicit literal and match lengths total at most 34. Thus this is a
      // conservative lower bound even for an optimally compressed master.
      // Adding its decimal digit count is monotonic, so a delta below this
      // bound wins without compressing the full image merely to compare it.
      const minimumMasterLength = Math.ceil(currentImage.buffer.length / 255);
      let certainlyDelta =
        minimumMasterLength + String(minimumMasterLength).length >
        deltaFixedCost;
      // A sequence with no matching four-byte prefix in the prior LZ4 window
      // also contributes to a conservative size bound. Avoid even scanning
      // when that bound could not possibly prove the delta smaller.
      const maximumUnique = Math.max(0, currentImage.buffer.length - 3);
      if (
        !certainlyDelta &&
        maximumUnique + String(maximumUnique).length > deltaFixedCost
      ) {
        // Find the first lower bound whose value plus decimal digit count
        // exceeds the delta cost; this also lets the scan stop when that
        // target is provably unreachable.
        let stopAt = Math.max(
          1,
          deltaFixedCost - String(deltaFixedCost).length + 1,
        );
        while (stopAt + String(stopAt).length <= deltaFixedCost) stopAt++;
        while (
          stopAt > 1 &&
          stopAt - 1 + String(stopAt - 1).length > deltaFixedCost
        )
          stopAt--;
        const strongerBound =
          options.compressionCache?.frameSizeLowerBound(
            currentImage.buffer,
            stopAt,
          ) ?? lz4FrameSizeLowerBound(currentImage.buffer, stopAt);
        certainlyDelta =
          strongerBound + String(strongerBound).length > deltaFixedCost;
      }
      const masterLength = certainlyDelta
        ? undefined
        : (
            options.compressionCache?.compressImage(currentImage.buffer) ??
            compressLz4Best(currentImage.buffer)
          ).length;
      if (
        masterLength !== undefined &&
        masterLength + String(masterLength).length <= deltaFixedCost
      ) {
        addAsMaster(currentImage, currentThumbnail, i);
        evictOldEntries(i);
        continue;
      }
    }
    const parentProxy: RawImageObjV1Cropped = {
      index: bestParent.parent.index,
      rect: bestParent.parent.rect,
      format: currentImage.format,
      buffer: parentBuffer,
    };

    // The no-op rectangle reconstructs the parent's existing bytes exactly.
    // Buffers are immutable during conversion, so no full image copy is needed.
    const merged = identicalParent
      ? parentBuffer
      : applyDiff(parentProxy, currentImage, rects);
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
    loopPositions.set(currentImage.index, i);
    depths.set(currentImage.index, parentDepth + 1);
    candidates.push({
      index: currentImage.index,
      thumbnail: currentThumbnail,
      rect: currentImage.rect,
    });
    parentBuffers.set(currentImage.index, merged);

    evictOldEntries(i);
  }

  if (rawImages.length > 1)
    options?.onProgress?.(rawImages.length, rawImages.length);

  return croppedImages;
};
