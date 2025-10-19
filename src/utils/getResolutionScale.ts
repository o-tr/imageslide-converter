/**
 * 解像度ごとのスケール係数（4K基準からのダウンスケール比率）
 */
const RESOLUTION_SCALES = {
  "4K": 1,
  FHD: 0.5, // 1920/3840
  HD: 1 / 3, // 1280/3840
  SD: 1 / 6, // 640/3840
} as const;

/**
 * 解像度に応じたスケール係数を取得します
 * @param resolution 目標解像度（4K/FHD/HD/SD）
 * @returns スケール係数（4K基準からのダウンスケール比率）
 */
export const getResolutionScale = (
  resolution: "4K" | "FHD" | "HD" | "SD",
): number => {
  return RESOLUTION_SCALES[resolution];
};
