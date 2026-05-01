"use client";
import type { SelectedFile } from "@/_types/file-picker";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import type { CSSProperties, FC } from "react";
import { MdDeleteOutline } from "react-icons/md";
import { Preview } from "./Preview";

interface SlideSidePanelProps {
  files: SelectedFile[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (id: string) => void;
}

interface SlideItemProps {
  file: SelectedFile;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onDelete: (id: string) => void;
}

const SlideItem: FC<SlideItemProps> = ({
  file,
  index,
  isSelected,
  onSelect,
  onDelete,
}) => {
  const { attributes, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: file.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.5, zIndex: 9999 } : {}),
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "delete",
      label: "削除",
      danger: true,
      icon: <MdDeleteOutline />,
      onClick: () => onDelete(file.id),
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        className="col-span-full grid grid-cols-subgrid cursor-pointer shrink-0"
        onClick={() => onSelect(index)}
      >
        <span className={"text-xs text-gray-500 text-right"}>{index + 1}</span>
        <Preview
          canvas={file.canvas}
          className={`w-full border-2 rounded overflow-hidden ${
            isSelected
              ? "border-blue-500"
              : "border-transparent hover:border-gray-300"
          }`}
        />
      </div>
    </Dropdown>
  );
};

export const SlideSidePanel: FC<SlideSidePanelProps> = ({
  files,
  selectedIndex,
  onSelect,
  onDelete,
}) => {
  return (
    <div className="grid gap-2 p-1 grid-cols-[20px_1fr]">
      {files.map((file, index) => (
        <SlideItem
          key={file.id}
          file={file}
          index={index}
          isSelected={index === selectedIndex}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};
