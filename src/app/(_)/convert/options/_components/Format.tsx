import type { FormatItemType } from "@/_types/text-zip/formats";
import {
  ConvertFormatAtom,
  TargetResolutionAtom,
  UsingVersionAtom,
} from "@/atoms/convert";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { FileSizeLimit } from "@/const/convert";
import { getAvailableFormats } from "@/utils/getAvailableFormats";
import { Flex, Radio, Tooltip } from "antd";
import { useAtom, useAtomValue } from "jotai";
import { type FC, useEffect, useMemo } from "react";

export const Format: FC = () => {
  const [format, setFormat] = useAtom(ConvertFormatAtom);
  const imageSlideVersion = useAtomValue(UsingVersionAtom);
  const files = useAtomValue(SelectedFilesAtom);
  const resolution = useAtomValue(TargetResolutionAtom);

  const availableFormats: (FormatItemType & { fileSize: number })[] = useMemo(
    () => getAvailableFormats(imageSlideVersion, files, resolution),
    [files, imageSlideVersion, resolution],
  );

  const bestFormat = useMemo(() => {
    return availableFormats.toSorted((a, b) => b.priority - a.priority)[0];
  }, [availableFormats]);

  const oneFileOptionEnabled = bestFormat?.fileSize > FileSizeLimit;

  useEffect(() => {
    if (oneFileOptionEnabled) return;
    if (format === "auto-one-file") setFormat("auto");
  }, [format, oneFileOptionEnabled, setFormat]);

  return (
    <Flex vertical gap={"middle"}>
      <h2 className={"text-xl"}>フォーマットを選択してください</h2>
      <Radio.Group onChange={(e) => setFormat(e.target.value)} value={format}>
        {bestFormat && (
          <Radio.Button className={"w-[256px] !h-[76px]"} value={"auto"}>
            <Flex
              vertical
              className={"p-2 text-center h-full"}
              align={"center"}
            >
              <p>自動 ({bestFormat.label})</p>
              <p>{toLabel(bestFormat)}</p>
            </Flex>
          </Radio.Button>
        )}
        {oneFileOptionEnabled && (
          <Tooltip
            placement="top"
            title={`画像サイズを${Math.floor((FileSizeLimit * 100) / bestFormat.fileSize)}% に縮小することによって容量を圧縮します`}
            arrow={true}
          >
            <Radio.Button
              className={"w-[256px] !h-[76px]"}
              value={"auto-one-file"}
            >
              <Flex
                vertical
                className={"p-2 text-center h-full"}
                align={"center"}
              >
                <p>自動 ({bestFormat.label})</p>
                <p>縮小して1ファイルに纏める</p>
              </Flex>
            </Radio.Button>
          </Tooltip>
        )}
        {availableFormats.map((v) => (
          <FormatItem key={v.label} item={v} />
        ))}
      </Radio.Group>
    </Flex>
  );
};

export const FormatItem: FC<{
  item: FormatItemType & { fileSize: number };
}> = ({ item }) => {
  const label = useMemo(() => {
    return toLabel(item);
  }, [item]);
  return (
    <Radio.Button
      key={item.label}
      value={item.id}
      className={"w-[256px] !h-[76px]"}
    >
      <Flex vertical className={"p-2 text-center"}>
        <p>{item.label}</p>
        <p>{label}</p>
      </Flex>
    </Radio.Button>
  );
};

const unit = ["B", "KB", "MB", "GB", "TB"] as const;
const toLabel = (input: FormatItemType & { fileSize: number }) => {
  let size = input.fileSize;
  let i = 0;
  while (size >= 1000) {
    size /= 1000;
    i++;
  }
  return `${input.estimatedCompressionRatio !== undefined ? "~" : ""}${size.toFixed(2)}${unit[i]} / ${Math.ceil(input.fileSize / FileSizeLimit)}file(s)`;
};
