import type { BoundingBox } from "@/_types/lib/crop";

export const shrinkOverlapBoundingBox = (
  boundingBoxes: BoundingBox[],
): BoundingBox[] => {
  const boxes = structuredClone(boundingBoxes);

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const boxA = boxes[i];
      const boxB = boxes[j];

      if (
        isInside(boxA, boxB.x2, boxB.y1) &&
        isInside(boxA, boxB.x2, boxB.y2)
      ) {
        boxB.x2 = boxA.x1;
        continue;
      }

      if (
        isInside(boxA, boxB.x1, boxB.y1) &&
        isInside(boxA, boxB.x1, boxB.y2)
      ) {
        boxB.x1 = boxA.x2;
        continue;
      }

      if (
        isInside(boxA, boxB.x1, boxB.y2) &&
        isInside(boxA, boxB.x2, boxB.y2)
      ) {
        boxB.y2 = boxA.y1;
        continue;
      }

      if (
        isInside(boxA, boxB.x1, boxB.y1) &&
        isInside(boxA, boxB.x2, boxB.y1)
      ) {
        boxB.y1 = boxA.y2;
        continue;
      }

      if (
        isInside(boxB, boxA.x1, boxA.y1) &&
        isInside(boxB, boxA.x2, boxA.y2)
      ) {
        boxA.x1 = boxB.x2;
        continue;
      }

      if (
        isInside(boxB, boxA.x1, boxA.y1) &&
        isInside(boxB, boxA.x2, boxA.y2)
      ) {
        boxA.x2 = boxB.x1;
        continue;
      }

      if (
        isInside(boxB, boxA.x1, boxA.y1) &&
        isInside(boxB, boxA.x2, boxA.y2)
      ) {
        boxA.y1 = boxB.y2;
        continue;
      }

      if (
        isInside(boxB, boxA.x1, boxA.y1) &&
        isInside(boxB, boxA.x2, boxA.y2)
      ) {
        boxA.y2 = boxB.y1;
      }
    }
  }
  return boxes.map((box) => {
    const width = box.x2 - box.x1 + 1;
    const height = box.y2 - box.y1 + 1;
    return {
      ...box,
      width: Math.max(0, width),
      height: Math.max(0, height),
      area: Math.max(0, width * height),
    };
  });
};

const isInside = (box: BoundingBox, x: number, y: number) => {
  return box.x1 < x && x < box.x2 && box.y1 < y && y < box.y2;
};
