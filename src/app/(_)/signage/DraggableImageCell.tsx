import { DndImageFilePicker } from "@/components/DndImageFilePicker";
// 画像セルDND用コンポーネント
import { NumericInput } from "@/components/NumericInput";
import { Button } from "@/components/ui/button";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Trash } from "lucide-react";
import { useId } from "react";
import type { SlideConfig } from "./types";
type DraggableImageCellProps = {
  rowIdx: number;
  colIdx: number;
  slide: SlideConfig;
  onSelect: (file: File | null) => void;
};
export const DraggableImageCell: React.FC<DraggableImageCellProps> = ({
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
