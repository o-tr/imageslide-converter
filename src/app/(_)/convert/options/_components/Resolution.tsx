import { TargetResolutionAtom } from "@/atoms/convert";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { Flex, Radio, Tooltip } from "antd";
import { useAtom, useAtomValue } from "jotai";
import { type FC, useMemo } from "react";

type ResolutionOption = "4K" | "FHD" | "HD" | "SD";

const resolutionOptions: {
  value: ResolutionOption;
  label: string;
  description: string;
  width: number;
  height: number;
}[] = [
  {
    value: "4K",
    label: "4K",
    description: "3840×2160",
    width: 3840,
    height: 2160,
  },
  {
    value: "FHD",
    label: "FHD",
    description: "1920×1080",
    width: 1920,
    height: 1080,
  },
  {
    value: "HD",
    label: "HD",
    description: "1280×720",
    width: 1280,
    height: 720,
  },
  {
    value: "SD",
    label: "SD",
    description: "640×480",
    width: 640,
    height: 480,
  },
];

export const Resolution: FC = () => {
  const [resolution, setResolution] = useAtom(TargetResolutionAtom);
  const files = useAtomValue(SelectedFilesAtom);

  const estimatedSizes = useMemo<Record<ResolutionOption, number>>(() => {
    if (files.length === 0) {
      return { "4K": 0, FHD: 0, HD: 0, SD: 0 };
    }

    const sizes: Record<ResolutionOption, number> = {
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

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)}KB`;
    }
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  };

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
