import type { SelectedFile } from "@/_types/file-picker";
import { TargetFormats, TargetVersions } from "@/const/convert";

export const getAvailableFormats = (
  version: string,
  files: SelectedFile[],
  resolution: "4K" | "FHD" | "HD" | "SD" = "FHD",
) => {
  // 解像度に応じたスケール係数を計算
  const getResolutionScale = (
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

  const resolutionScale = getResolutionScale(resolution);

  // 解像度を考慮したファイルサイズ計算
  const calculateFileSize = (
    files: SelectedFile[],
    bytePerPixel: number,
    compressionRatio = 1,
  ) => {
    const pixelCount = files.reduce((pv, val) => {
      const scaledWidth = Math.round(val.canvas.width * resolutionScale);
      const scaledHeight = Math.round(val.canvas.height * resolutionScale);
      return pv + scaledWidth * scaledHeight;
    }, 0);
    return ((pixelCount * bytePerPixel * 4) / 3) * compressionRatio; // base64でエンコードするときに4/3倍になる
  };

  if (version === "all") {
    return TargetFormats.map((format) => ({
      ...format,
      fileSize: calculateFileSize(
        files,
        format.bytePerPixel,
        format.estimatedCompressionRatio ?? 1,
      ),
    }));
  }
  const supported = TargetVersions.find((v) => v.label === version)?.formats;
  if (!supported) {
    return [];
  }
  return TargetFormats.filter((v) => supported.includes(v.id)).map(
    (format) => ({
      ...format,
      fileSize: calculateFileSize(
        files,
        format.bytePerPixel,
        format.estimatedCompressionRatio ?? 1,
      ),
    }),
  );
};
