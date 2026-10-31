import type { BoundingBox } from "@/_types/lib/crop";
import { describe, expect, it } from "vitest";
import { mergeBoundingBoxByLimit } from "./mergeBoundingBoxByLimit";
import { mergeTwoBoundingBox } from "./mergeTwoBoundingBox";

// Simple exhaustive reference for the previous 200-entry search and its
// ordering rules. It is intentionally used only on bounded test cases.
function reference(input: BoundingBox[], limit: number): BoundingBox[] {
  const boxes = structuredClone(input);
  while (boxes.length > limit) {
    let best = Number.POSITIVE_INFINITY;
    let left = -1;
    let right = -1;
    let merged: BoundingBox | undefined;
    for (let i = Math.max(0, boxes.length - 200); i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const candidate = mergeTwoBoundingBox(boxes[i], boxes[j]);
        const cost = candidate.area - (boxes[i].area + boxes[j].area);
        if (cost < best) {
          best = cost;
          left = i;
          right = j;
          merged = candidate;
        }
      }
    }
    if (!merged) break;
    boxes[left] = merged;
    boxes.splice(right, 1);
  }
  return boxes;
}

describe("bounding-box limit selection", () => {
  it("matches exhaustive selection, including ties and the 200-entry window", () => {
    let state = 472;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
    for (const count of [0, 1, 2, 19, 199, 200, 201, 202, 250, 401]) {
      for (let kind = 0; kind < 4; kind++) {
        const boxes = Array.from({ length: count }, (_, i) => {
          const x1 = kind === 0 ? 4 : random() % 80;
          const y1 = kind === 0 ? 8 : random() % 70;
          const width = 1 + (kind === 1 ? i % 3 : random() % 9);
          const height = 1 + (kind === 1 ? i % 4 : random() % 9);
          return {
            x1,
            y1,
            x2: x1 + width - 1,
            y2: y1 + height - 1,
            width,
            height,
            area: width * height,
          };
        });
        const original = structuredClone(boxes);
        for (const limit of [0, 1, 8, count - 1, count, count + 1]) {
          expect(mergeBoundingBoxByLimit(boxes, limit)).toEqual(
            reference(boxes, limit),
          );
        }
        expect(boxes).toEqual(original);
      }
    }
  }, 30000);

  it("preserves behavior when pair costs are not finite", () => {
    const box = (x: number): BoundingBox => ({
      x1: x,
      y1: 0,
      x2: x,
      y2: 0,
      width: 1,
      height: 1,
      area: 1,
    });
    const boxes = [
      box(0),
      box(Number.NaN),
      box(Number.POSITIVE_INFINITY),
      box(10),
    ];
    expect(mergeBoundingBoxByLimit(boxes, 0)).toEqual(reference(boxes, 0));
  });
});
