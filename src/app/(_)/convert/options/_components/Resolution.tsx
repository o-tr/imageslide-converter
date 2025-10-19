import { TargetResolutionAtom } from "@/atoms/convert";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import {
  RESOLUTION_DIMENSIONS,
  type Resolution as ResolutionType,
} from "@/const/resolutions";
import { formatFileSize } from "@/utils/formatFileSize";
import { Flex, Radio, Tooltip } from "antd";
import { useAtom, useAtomValue } from "jotai";
import { type FC, useMemo } from "react";

// RESOLUTION_DIMENSIONSから配列形式に変換
const resolutionOptions = Object.entries(RESOLUTION_DIMENSIONS).map(
  ([key, value]) => ({
    value: key as ResolutionType,
    ...value,
  }),
);

export const Resolution: FC = () => {
  const [resolution, setResolution] = useAtom(TargetResolutionAtom);
  const files = useAtomValue(SelectedFilesAtom);

  const estimatedSizes = useMemo<Record<ResolutionType, number>>(() => {
    if (files.length === 0) {
      return { "4K": 0, FHD: 0, HD: 0, SD: 0 };
    }

    const sizes: Record<ResolutionType, number> = {
      "4K": 0,
      FHD: 0,
      HD: 0,
      SD: 0,
    };

    for (const option of resolutionOptions) {
      // 4K基準からのダウンスケール比率を計算
      const scaleFactor =
        option.value === "4K"
          ? 1
          : Math.min(option.width / 3840, option.height / 2160);

      // 解像度を考慮した総ピクセル数を計算
      const pixelCount = files.reduce((acc, file) => {
        const scaledWidth = Math.round(file.canvas.width * scaleFactor);
        const scaledHeight = Math.round(file.canvas.height * scaleFactor);
        return acc + scaledWidth * scaledHeight;
      }, 0);

      // RGB24フォーマット（3 bytes per pixel）でのファイルサイズ推定
      // base64エンコード時に4/3倍になることを考慮
      sizes[option.value] = (pixelCount * 3 * 4) / 3;
    }

    return sizes;
  }, [files]);

  return (
    <Flex vertical gap={"middle"}>
      <h2 className={"text-xl"}>解像度を選択してください</h2>
      <Radio.Group
        onChange={(e) => setResolution(e.target.value)}
        value={resolution}
      >
        {resolutionOptions.map((option) => {
          const estimatedSize = estimatedSizes[option.value];
          const isRecommended = option.value === "FHD";

          return (
            <Tooltip
              key={option.value}
              placement="top"
              title={
                estimatedSize
                  ? `推定ファイルサイズ: ${formatFileSize(estimatedSize)}`
                  : ""
              }
              arrow={true}
            >
              <Radio.Button
                className={`w-[200px] !h-[80px] ${isRecommended ? "border-blue-500" : ""}`}
                value={option.value}
              >
                <Flex
                  vertical
                  className={"p-2 text-center h-full"}
                  align={"center"}
                  justify={"center"}
                >
                  <p className="font-semibold">{option.label}</p>
                  <p className="text-sm text-gray-600">{option.description}</p>
                  {estimatedSize && (
                    <p className="text-xs text-gray-500">
                      {formatFileSize(estimatedSize)}
                    </p>
                  )}
                </Flex>
              </Radio.Button>
            </Tooltip>
          );
        })}
      </Radio.Group>
    </Flex>
  );
};
