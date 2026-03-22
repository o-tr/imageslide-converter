"use client";
import type { FormatItemType } from "@/_types/text-zip/formats";
import {
  ConvertFormatAtom,
  TargetResolutionAtom,
  UsingVersionAtom,
} from "@/atoms/convert";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { FileSizeLimit } from "@/const/convert";
import { formatFileSize } from "@/utils/formatFileSize";
import { getAvailableFormats } from "@/utils/getAvailableFormats";
import { Flex, Select } from "antd";
import { useAtom, useAtomValue } from "jotai";
import { type FC, useEffect, useMemo } from "react";

const toLabel = (input: FormatItemType & { fileSize: number }) => {
  const sizeStr = formatFileSize(input.fileSize);
  const prefix = input.estimatedCompressionRatio !== undefined ? "~" : "";
  const fileCount = Math.ceil(input.fileSize / FileSizeLimit);
  return `${input.label} (${prefix}${sizeStr} / ${fileCount}file)`;
};

export const FormatSelect: FC = () => {
  const [format, setFormat] = useAtom(ConvertFormatAtom);
  const imageSlideVersion = useAtomValue(UsingVersionAtom);
  const files = useAtomValue(SelectedFilesAtom);
  const resolution = useAtomValue(TargetResolutionAtom);

  const availableFormats = useMemo(
    () => getAvailableFormats(imageSlideVersion, files, resolution),
    [files, imageSlideVersion, resolution],
  );

  const bestFormat = useMemo(() => {
    if (availableFormats.length === 0) return null;
    return availableFormats.toSorted((a, b) => b.priority - a.priority)[0];
  }, [availableFormats]);

  const oneFileOptionEnabled =
    bestFormat !== null && bestFormat.fileSize > FileSizeLimit;

  useEffect(() => {
    if (availableFormats.length === 0) {
      if (format === "auto-one-file") setFormat("auto");
      return;
    }
    if (format === "auto") return;
    if (format === "auto-one-file" && oneFileOptionEnabled) return;
    const validIds: string[] = availableFormats.map((f) => f.id);
    if (!validIds.includes(format)) {
      setFormat("auto");
    }
  }, [format, availableFormats, oneFileOptionEnabled, setFormat]);

  const options = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    if (bestFormat) {
      result.push({
        value: "auto",
        label: `自動 (${bestFormat.label})`,
      });
    }
    if (oneFileOptionEnabled) {
      result.push({
        value: "auto-one-file",
        label: "自動 (縮小して1ファイルに纏める)",
      });
    }
    for (const f of availableFormats) {
      result.push({
        value: f.id,
        label: toLabel(f),
      });
    }
    return result;
  }, [availableFormats, bestFormat, oneFileOptionEnabled]);

  return (
    <Flex vertical gap={4}>
      <span className="text-sm font-medium">フォーマット</span>
      {/* 表示値のフォールバック: atom の値が options に含まれない場合(例: ハイドレーション時の
          stale な "auto-one-file")、useEffect による atom リセット前のフラッシュを防ぐ。
          SettingsPanel の forceRender: true により、useEffect はユーザー操作前に実行される。 */}
      <Select
        value={options.some((o) => o.value === format) ? format : undefined}
        onChange={setFormat}
        options={options}
        disabled={options.length === 0}
        placeholder={
          options.length === 0 ? "フォーマットなし" : "選択してください"
        }
        className="w-full"
      />
    </Flex>
  );
};
