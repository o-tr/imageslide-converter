/**
 * 解像度に応じたスケール係数を計算します
 * @param resolution 目標解像度（4K/FHD/HD/SD）
 * @returns スケール係数（4K基準からのダウンスケール比率）
 */
export const getResolutionScale = (
  resolution: "4K" | "FHD" | "HD" | "SD",
): number => {
  switch (resolution) {
    case "4K":
      return 1; // そのまま
    case "FHD":
      return Math.min(1920 / 3840, 1080 / 2160); // 1920x1080基準
    case "HD":
      return Math.min(1280 / 3840, 720 / 2160); // 1280x720基準
    case "SD":
      return Math.min(640 / 3840, 480 / 2160); // 640x480基準
    default:
      return 1;
  }
};
