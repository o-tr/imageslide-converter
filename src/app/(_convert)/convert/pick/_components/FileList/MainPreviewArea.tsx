"use client";
import type { SelectedFile } from "@/_types/file-picker";
import { Flex } from "antd";
import TextArea from "antd/es/input/TextArea";
import type { ChangeEvent, FC } from "react";
import { Preview } from "./Preview";

interface MainPreviewAreaProps {
  file: SelectedFile;
  onNoteChange: (id: string, note: string) => void;
}

export const MainPreviewArea: FC<MainPreviewAreaProps> = ({
  file,
  onNoteChange,
}) => {
  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onNoteChange(file.id, e.target.value);
  };

  return (
    <Flex vertical gap={16} className={"h-full"}>
      <div className="flex-1 flex items-center justify-center">
        <div
          className={"w-full aspect-video bg-gray-100 rounded overflow-hidden"}
        >
          <Preview canvas={file.canvas} className={"w-full h-full"} />
        </div>
      </div>
      <Flex vertical gap={4} className={""}>
        <span className={"text-sm font-medium"}>スピーカーノート</span>
        <TextArea
          value={file.note ?? ""}
          onChange={onChange}
          placeholder={"クリックしてスピーカーノートを追加できます"}
          autoSize={{ minRows: 4 }}
        />
      </Flex>
    </Flex>
  );
};
