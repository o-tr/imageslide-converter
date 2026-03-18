import type { Rect } from "@/_types/text-zip";
import type { RawImageObjV1, RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { rgb242diff } from "@/lib/rawImage2Diff/rgb242diff";
import { computeThumbnailSimilarity } from "./computeThumbnailSimilarity";
import { countDiffPixels } from "./countDiffPixels";

export type ParentCandidate = {
  index: number;
  thumbnail: Uint8Array;
  rect: Rect;
};

export type BestParentResult = {
  parentIndex: number;
  diff: Uint8Array;
};

/**
 * Select the best parent slide for delta encoding.
 *
 * Phase 1: Rank all candidates by thumbnail SAD (coarse filtering).
 * Phase 2: Run full-resolution rgb242diff on the top-K candidates
 *          whose buffers are available, and pick the one with the fewest changed pixels.
 */
export const selectBestParent = (
  currentImage: RawImageObjV1,
  currentThumbnail: Uint8Array,
  candidates: ParentCandidate[],
  parentBuffers: Map<number, Buffer>,
  topK: number,
): BestParentResult | null => {
  if (candidates.length === 0) return null;

  // Phase 1: coarse ranking by thumbnail similarity
  const scored = candidates.map((candidate) => ({
    candidate,
    similarity: computeThumbnailSimilarity(
      candidate.thumbnail,
      currentThumbnail,
    ),
  }));
  scored.sort((a, b) => a.similarity - b.similarity);

  // Phase 2: full-resolution diff on top-K candidates with available buffers
  let bestResult: BestParentResult | null = null;
  let bestDiffCount = Number.POSITIVE_INFINITY;
  let evaluated = 0;

  for (const { candidate } of scored) {
    if (evaluated >= topK) break;

    const buffer = parentBuffers.get(candidate.index);
    if (!buffer) continue;

    // Create a lightweight proxy for rgb242diff
    const parentProxy: RawImageObjV1Cropped = {
      index: candidate.index,
      rect: candidate.rect,
      format: currentImage.format,
      buffer: buffer,
    };

    const diff = rgb242diff(parentProxy, currentImage);
    const diffCount = countDiffPixels(diff);
    evaluated++;

    if (diffCount < bestDiffCount) {
      bestDiffCount = diffCount;
      bestResult = { parentIndex: candidate.index, diff };
    }
  }

  return bestResult;
};
