import {
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

export const useDragAndDrop = (
  swapImages: (fromId: string, toRow: number, toCol: number) => void,
) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromElem = document.getElementById(String(active.id));
    const overElem = document.getElementById(String(over.id));
    if (!fromElem || !overElem) return;

    const fromId = fromElem.getAttribute("data-item-id");
    const overRow = overElem.getAttribute("data-item-row");
    const overCol = overElem.getAttribute("data-item-col");

    if (!fromId || !overRow || !overCol) {
      return;
    }

    swapImages(fromId, Number.parseInt(overRow), Number.parseInt(overCol));
  };

  return {
    sensors,
    handleDragEnd,
    collisionDetection: closestCenter,
  };
};
