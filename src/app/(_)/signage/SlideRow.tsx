import { DndImageFilePicker } from "@/components/DndImageFilePicker";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type React from "react";
import { Preview } from "../convert/pick/_components/FileList/Preview";
import type { SignboardConfig, SlideConfig } from "./types";

interface SlideRowProps {
  idx: number;
  durations: number[];
  signboards: SignboardConfig;
  handleDurationChange: (idx: number, value: string) => void;
  handleImageChange: (
    signboardIdx: number,
    idx: number,
    file: File | null,
  ) => void;
  removeSlide: (idx: number) => void;
  slideCount: number;
  getImagePreview: (file: File | null) => string | undefined;
}

const SlideRow: React.FC<SlideRowProps> = ({
  idx,
  durations,
  signboards,
  handleDurationChange,
  handleImageChange,
  removeSlide,
  slideCount,
}) => {
  return (
    <>
      <td className="px-2 py-2 text-center font-bold">{idx + 1}</td>
      <td className="px-2 py-2">
        <Input
          type="number"
          min={1}
          value={durations[idx]}
          onChange={(e) => handleDurationChange(idx, e.target.value)}
          className="rounded px-2 py-1 w-16"
        />
      </td>

      {signboards.signboards.map((sb, sbIdx) => {
        const image = signboards.rows[idx]?.images[sbIdx];
        if (!image) {
          return null;
        }
        return (
          <DraggableImageCell
            key={image.id}
            rowIdx={idx}
            colIdx={sbIdx}
            slide={image}
            onSelect={(file) => handleImageChange(sbIdx, idx, file)}
          />
        );
      })}
      <td className="px-2 py-2 align-middle">
        <Button
          type="button"
          onClick={() => removeSlide(idx)}
          disabled={slideCount === 1}
          variant={"destructive"}
          size={"sm"}
        >
          <Trash />
        </Button>
      </td>
    </>
  );
};

// 画像セルDND用コンポーネント
import type { SelectedFile } from "@/_types/file-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash } from "lucide-react";
import { useId } from "react";
type DraggableImageCellProps = {
  rowIdx: number;
  colIdx: number;
  slide: SlideConfig;
  onSelect: (file: File | null) => void;
};
const DraggableImageCell: React.FC<DraggableImageCellProps> = ({
  rowIdx,
  colIdx,
  slide,
  onSelect,
}) => {
  const id = useId();
  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id });
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({ id });
  const style: React.CSSProperties = {
    cursor: "grab",
    opacity: isDragging ? 0.5 : 1,
    background: isOver ? "#facc15" : isDragging ? "#e0e7ef" : undefined,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition: "background 0.15s",
  };
  // ドラッグとドロップ両方のrefを合成
  const setRefs = (node: HTMLTableCellElement | null) => {
    setDragNodeRef(node);
    setDropNodeRef(node);
  };
  return (
    <td
      id={id}
      ref={setRefs}
      style={style}
      {...attributes}
      {...listeners}
      data-item-id={slide.id}
      data-item-row={rowIdx}
      data-item-col={colIdx}
    >
      <DndImageFilePicker
        onSelect={onSelect}
        accept="image/*"
        showPreview
        selectedFile={slide.file || undefined}
      />
    </td>
  );
};

export default SlideRow;
