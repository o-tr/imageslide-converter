/**
 * Compute the Sum of Absolute Differences (SAD) between two thumbnails.
 * Lower score means more similar images.
 */
export const computeThumbnailSimilarity = (
  thumbA: Uint8Array,
  thumbB: Uint8Array,
): number => {
  let sad = 0;
  for (let i = 0; i < thumbA.length; i++) {
    sad += Math.abs(thumbA[i] - thumbB[i]);
  }
  return sad;
};
