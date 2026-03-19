/**
 * Compute the Sum of Absolute Differences (SAD) between two thumbnails.
 * Lower score means more similar images.
 * Both thumbnails must have the same length (same gridSize).
 */
export const computeThumbnailSimilarity = (
  thumbA: Uint8Array,
  thumbB: Uint8Array,
): number => {
  if (thumbA.length !== thumbB.length) {
    throw new Error(
      `Thumbnail length mismatch: ${thumbA.length} vs ${thumbB.length}`,
    );
  }
  let sad = 0;
  for (let i = 0; i < thumbA.length; i++) {
    sad += Math.abs(thumbA[i] - thumbB[i]);
  }
  return sad;
};
