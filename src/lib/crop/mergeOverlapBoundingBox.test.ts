import type { BoundingBox } from "@/_types/lib/crop";
import { expect, it } from "vitest";
import { mergeOverlapBoundingBox } from "./mergeOverlapBoundingBox";
import { mergeTwoBoundingBox } from "./mergeTwoBoundingBox";

function reference(input: BoundingBox[]): BoundingBox[] {
  const boxes = structuredClone(input);
  const overlap = (a: BoundingBox, b: BoundingBox) => {
    if (!(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1))
      return true;
    if (
      (a.x1 <= b.x1 && a.x2 >= b.x2 && a.y1 <= b.y1 && a.y2 >= b.y2) ||
      (b.x1 <= a.x1 && b.x2 >= a.x2 && b.y1 <= a.y1 && b.y2 >= a.y2)
    )
      return true;
    return (
      ((a.x2 === b.x1 || a.x1 === b.x2) && !(a.y2 < b.y1 || a.y1 > b.y2)) ||
      ((a.y2 === b.y1 || a.y1 === b.y2) && !(a.x2 < b.x1 || a.x1 > b.x2))
    );
  };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlap(boxes[i], boxes[j])) {
        boxes[i] = mergeTwoBoundingBox(boxes[i], boxes[j]);
        boxes.splice(j, 1);
        j--;
      }
    }
  }
  return boxes.map((box) => {
    const width = box.x2 - box.x1 + 1;
    const height = box.y2 - box.y1 + 1;
    return { ...box, width, height, area: width * height };
  });
}

const box = (x1: number, y1: number, x2 = x1, y2 = y1): BoundingBox => ({
  x1,
  y1,
  x2,
  y2,
  width: x2 - x1 + 1,
  height: y2 - y1 + 1,
  area: (x2 - x1 + 1) * (y2 - y1 + 1),
});

it("preserves ordered merging across indexed, dense and fallback inputs", () => {
  let state = 1991;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  for (let n = 0; n < 45; n++) {
    const count = n % 2 ? 1024 + (random() % 120) : random() % 180;
    const boxes = Array.from({ length: count }, () => {
      const x = random() % 600;
      const y = random() % 400;
      const w = random() % 4 ? 0 : random() % 24;
      const h = random() % 4 ? 0 : random() % 24;
      return box(x, y, x + w, y + h);
    });
    const original = structuredClone(boxes);
    expect(mergeOverlapBoundingBox(boxes)).toEqual(reference(boxes));
    expect(boxes).toEqual(original);
  }
  const filler = Array.from({ length: 1024 }, (_, i) =>
    box(5000 + i * 40, 5000),
  );
  // The earlier disjoint box must not be reconsidered after a later merge
  // expands the first box into its cell; a still-later box can merge.
  const expanding = [
    box(30, 30, 31, 31),
    box(33, 30, 34, 31),
    box(31, 30, 34, 31),
    box(34, 30, 35, 31),
    ...filler,
  ];
  expect(mergeOverlapBoundingBox(expanding)).toEqual(reference(expanding));
  const chain = Array.from({ length: 1200 }, (_, i) => box(i, 0, i + 2, 1));
  expect(mergeOverlapBoundingBox(chain)).toEqual(reference(chain));
  for (const unusual of [
    box(1.5, 2, 3, 4),
    box(4, 4, 2, 5),
    box(Number.NaN, 0),
    box(0, 0, 10000, 10000),
  ]) {
    const boxes = [unusual, ...filler];
    expect(mergeOverlapBoundingBox(boxes)).toEqual(reference(boxes));
  }
}, 30000);
