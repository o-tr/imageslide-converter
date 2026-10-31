import type { BoundingBox } from "@/_types/lib/crop";
import { expect, it } from "vitest";
import { shrinkOverlapBoundingBox } from "./shrinkOverlapBoundingBox";

// Reference retains the original all-pairs order and mutation rules.
function reference(input: BoundingBox[]): BoundingBox[] {
  const boxes = structuredClone(input);
  const inside = (box: BoundingBox, x: number, y: number) =>
    box.x1 < x && x < box.x2 && box.y1 < y && y < box.y2;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (inside(a, b.x2, b.y1) && inside(a, b.x2, b.y2)) b.x2 = a.x1;
      else if (inside(a, b.x1, b.y1) && inside(a, b.x1, b.y2)) b.x1 = a.x2;
      else if (inside(a, b.x1, b.y2) && inside(a, b.x2, b.y2)) b.y2 = a.y1;
      else if (inside(a, b.x1, b.y1) && inside(a, b.x2, b.y1)) b.y1 = a.y2;
      else if (inside(b, a.x1, a.y1) && inside(b, a.x2, a.y2)) a.x1 = b.x2;
      else if (inside(b, a.x1, a.y1) && inside(b, a.x2, a.y2)) a.x2 = b.x1;
      else if (inside(b, a.x1, a.y1) && inside(b, a.x2, a.y2)) a.y1 = b.y2;
      else if (inside(b, a.x1, a.y1) && inside(b, a.x2, a.y2)) a.y2 = b.y1;
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
}

it("preserves pair order and results for point, line, nested and inverted boxes", () => {
  let state = 773;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  for (let n = 0; n < 500; n++) {
    const count = random() % 150;
    const boxes = Array.from({ length: count }, () => {
      const x1 = random() % 30;
      const y1 = random() % 30;
      const width = random() % 5 ? 0 : (random() % 16) - 3;
      const height = random() % 5 ? 0 : (random() % 16) - 3;
      return {
        x1,
        y1,
        x2: x1 + width,
        y2: y1 + height,
        width: width + 1,
        height: height + 1,
        area: (width + 1) * (height + 1),
      };
    });
    const original = structuredClone(boxes);
    expect(shrinkOverlapBoundingBox(boxes)).toEqual(reference(boxes));
    expect(boxes).toEqual(original);
  }
});

it("matches ordered scanning for large indexed inputs and fallback paths", () => {
  const makeBox = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): BoundingBox => ({
    x1,
    y1,
    x2,
    y2,
    width: x2 - x1 + 1,
    height: y2 - y1 + 1,
    area: (x2 - x1 + 1) * (y2 - y1 + 1),
  });
  const separated = Array.from({ length: 1100 }, (_, i) =>
    makeBox(i * 40, i * 40, i * 40 + 4, i * 40 + 4),
  );
  const nested = [...separated];
  nested.splice(900, 0, makeBox(7, 100, 20, 115), makeBox(9, 102, 12, 106));
  const dense = Array.from({ length: 1100 }, () => makeBox(20, 20, 25, 25));
  const oversized = [makeBox(0, 0, 10000, 10000), ...separated];
  const fractional = [makeBox(0.5, 0, 2.5, 2), ...separated];
  const inverted = [makeBox(4, 4, 1, 5), ...separated];
  const edge = 2 ** 30;
  const indexedEdges = [
    makeBox(-edge, -edge, -edge + 4, -edge + 4),
    makeBox(edge - 5, edge - 5, edge - 1, edge - 1),
    ...separated,
  ];
  const outsideIndex = [makeBox(edge, 0, edge + 4, 4), ...separated];
  for (const boxes of [
    separated,
    nested,
    dense,
    oversized,
    fractional,
    inverted,
    indexedEdges,
    outsideIndex,
  ]) {
    expect(shrinkOverlapBoundingBox(boxes)).toEqual(reference(boxes));
  }
}, 30000);
