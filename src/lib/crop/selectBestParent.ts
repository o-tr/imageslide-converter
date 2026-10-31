import type { Rect } from "@/_types/text-zip";
import type { RawImageObjV1, RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { rgb242diff } from "@/lib/rawImage2Diff/rgb242diff";
import { computeThumbnailSimilarity } from "./computeThumbnailSimilarity";

export type ParentCandidate = {
  index: number;
  thumbnail: Uint8Array;
  rect: Rect;
};

export type BestParentResult = {
  parent: ParentCandidate;
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

  // Phase 1: preserve validation even for candidates without a parent buffer.
  for (const candidate of candidates) {
    if (candidate.thumbnail.length !== currentThumbnail.length)
      throw new Error(
        `Thumbnail length mismatch: ${candidate.thumbnail.length} vs ${currentThumbnail.length}`,
      );
  }
  const limit = Math.ceil(topK);
  let scored: { candidate: ParentCandidate; similarity: number }[];
  if (
    Number.isFinite(limit) &&
    limit > 0 &&
    candidates.length > Math.max(16, limit)
  ) {
    scored = [];
    for (const candidate of candidates) {
      if (!parentBuffers.get(candidate.index)) continue;
      const cutoff =
        scored.length === limit
          ? scored[limit - 1].similarity
          : Number.POSITIVE_INFINITY;
      let similarity = 0;
      const thumbnail = candidate.thumbnail;
      // Non-negative differences let us discard a later tied candidate too.
      // Check in batches to keep the ordinary loop inexpensive.
      for (let i = 0; i < thumbnail.length && similarity < cutoff; ) {
        const end = Math.min(i + 64, thumbnail.length);
        for (; i < end; i++)
          similarity += Math.abs(thumbnail[i] - currentThumbnail[i]);
      }
      if (similarity >= cutoff) continue;
      let insert = scored.length;
      while (insert > 0 && scored[insert - 1].similarity > similarity) insert--;
      scored.splice(insert, 0, { candidate, similarity });
      if (scored.length > limit) scored.pop();
    }
  } else {
    scored = candidates.map((candidate) => ({
      candidate,
      similarity: computeThumbnailSimilarity(
        candidate.thumbnail,
        currentThumbnail,
      ),
    }));
    scored.sort((a, b) => a.similarity - b.similarity);
  }

  // Phase 2: full-resolution diff on top-K candidates with available buffers
  let bestResult: BestParentResult | null = null;
  let bestDiffCount = Number.POSITIVE_INFINITY;
  let scratch: Uint8Array | undefined;
  let evaluated = 0;

  for (const { candidate } of scored) {
    if (evaluated >= topK) break;

    // Invariant: every candidate passed here has a corresponding entry in
    // parentBuffers, kept in sync by evictOldEntries in cropImages.ts.
    const buffer = parentBuffers.get(candidate.index);
    if (!buffer) continue; // should never happen

    // Create a lightweight proxy for rgb242diff
    const parentProxy: RawImageObjV1Cropped = {
      index: candidate.index,
      rect: candidate.rect,
      format: currentImage.format,
      buffer: buffer,
    };

    // An equal score retains the earlier parent, so this candidate can be
    // discarded as soon as it reaches the current best count.
    const stats = { count: 0, stopAt: bestDiffCount };
    const diff = rgb242diff(parentProxy, currentImage, stats, scratch);
    const diffCount = stats.count;
    evaluated++;

    if (diffCount < bestDiffCount) {
      bestDiffCount = diffCount;
      scratch = bestResult?.diff;
      bestResult = { parent: candidate, diff };
      // Counts cannot be negative, and equal scores retain the first parent.
      if (diffCount === 0) break;
    } else {
      scratch = diff;
    }
  }

  return bestResult;
};
