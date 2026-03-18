/**
 * Count the number of changed pixels in a diff mask.
 * Used to cheaply compare candidate parents without running the full bounding box pipeline.
 */
export const countDiffPixels = (diff: Uint8Array): number => {
  let count = 0;
  for (let i = 0; i < diff.length; i++) {
    count += diff[i];
  }
  return count;
};
