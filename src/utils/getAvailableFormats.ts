import type { SelectedFile } from "@/_types/file-picker";
import { TargetFormats, TargetVersions } from "@/const/convert";
import { getResolutionScale } from "@/utils/getResolutionScale";

export const getAvailableFormats = (
  version: string,
  files: SelectedFile[],
  resolution: "4K" | "FHD" | "HD" | "SD" = "FHD",
) => {
  // 解像度を考慮したファイルサイズ計算
  const calculateFileSize = (
    files: SelectedFile[],
    bytePerPixel: number,
    compressionRatio = 1,
  ) => {
    const pixelCount = files.reduce((pv, val) => {
      // ファイルごとにアスペクト比を維持したスケールを計算
      const scale = getResolutionScale(
        resolution,
        val.canvas.width,
        val.canvas.height,
      );
      const scaledWidth = Math.round(val.canvas.width * scale);
      const scaledHeight = Math.round(val.canvas.height * scale);
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
