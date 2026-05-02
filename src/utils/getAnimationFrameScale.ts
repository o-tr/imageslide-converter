export const getAnimationFrameScale = (fps: number): number => {
  if (fps <= 5) return 1.0;
  if (fps <= 10) return 0.75;
  return 0.5;
};
