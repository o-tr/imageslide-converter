import type { BoundingBox } from "@/_types/lib/crop";
import type { Rect } from "@/_types/text-zip";
import { IMAGE_BOUNDING_BOX_LIMIT } from "@/const/config";
import { expect, it } from "vitest";
import { calcBoundingBoxScore } from "./calcBoundingBoxScore";
import { expandBoundingBoxes } from "./expandBoundingBox";
import { mergeBoundingBoxByLimit } from "./mergeBoundingBoxByLimit";
import { optimizeBoundingBox } from "./optimizeBoundingBox";
import { shrinkOverlapBoundingBox } from "./shrinkOverlapBoundingBox";

function reference(boxes: BoundingBox[], rect: Rect): BoundingBox[] {
  let best = mergeBoundingBoxByLimit(
    expandBoundingBoxes(boxes, rect, 4),
    IMAGE_BOUNDING_BOX_LIMIT,
  );
  let bestScore = calcBoundingBoxScore(best);
  let reduced = best;
  for (let i = IMAGE_BOUNDING_BOX_LIMIT - 1; i > 0; i--) {
    reduced = mergeBoundingBoxByLimit(reduced, i);
    const score = calcBoundingBoxScore(reduced);
    if (score < bestScore) {
      bestScore = score;
      best = reduced;
    }
  }
  return shrinkOverlapBoundingBox(best).map((box) => {
    const width = box.x2 - box.x1 + 1;
    const height = box.y2 - box.y1 + 1;
    return { ...box, width, height, area: width * height };
  });
}

it("retains the selected rectangles when no-op merge limits are skipped", () => {
  let state = 357;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const rect = { width: 1920, height: 1080 };
  for (let n = 0; n < 150; n++) {
    const boxes = Array.from({ length: n % 20 }, () => {
      const x = random() % 1800;
      const y = random() % 1000;
      const width = 1 + (random() % 100);
      const height = 1 + (random() % 70);
      return {
        x1: x,
        y1: y,
        x2: x + width - 1,
        y2: y + height - 1,
        width,
        height,
        area: width * height,
      };
    });
    expect(optimizeBoundingBox(boxes, rect)).toEqual(reference(boxes, rect));
  }
});
