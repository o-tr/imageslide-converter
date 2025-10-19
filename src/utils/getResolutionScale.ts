/**
 * 解像度ごとの目標サイズ
 */
const RESOLUTION_DIMENSIONS = {
  "4K": { width: 3840, height: 2160 },
  FHD: { width: 1920, height: 1080 },
  HD: { width: 1280, height: 720 },
  SD: { width: 640, height: 480 },
} as const;

/**
 * 解像度に応じたスケール係数を計算します（アスペクト比維持）
 * @param resolution 目標解像度（4K/FHD/HD/SD）
 * @param sourceWidth 元画像の幅
 * @param sourceHeight 元画像の高さ
 * @returns スケール係数（アスペクト比を維持したまま目標解像度にフィットする最大スケール）
 */
export const getResolutionScale = (
  resolution: "4K" | "FHD" | "HD" | "SD",
  sourceWidth: number,
  sourceHeight: number,
): number => {
  const target = RESOLUTION_DIMENSIONS[resolution];
  const scaleX = target.width / sourceWidth;
  const scaleY = target.height / sourceHeight;
  // アスペクト比を維持するため、小さい方のスケールを使用
  return Math.min(scaleX, scaleY, 1); // 拡大はしない（最大1）
};
