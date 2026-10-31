import type { BoundingBox } from "@/_types/lib/crop";
import { mergeTwoBoundingBox } from "@/lib/crop/mergeTwoBoundingBox";
import {
  boxCellKey,
  boxCellRange,
  createBoxSpatialGrid,
} from "./boxSpatialGrid";

export const mergeOverlapBoundingBox = (
  _boxes: BoundingBox[],
): BoundingBox[] => {
  const boxes = structuredClone(_boxes);
  const indexed = boxes.length >= 1024 ? mergeIndexed(boxes) : undefined;
  if (indexed) return finish(indexed);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (areOverlap(boxes[i], boxes[j])) {
        boxes[i] = mergeTwoBoundingBox(boxes[i], boxes[j]);
        boxes.splice(j, 1);
        j--;
      }
    }
  }
  return finish(boxes);
};

function finish(boxes: BoundingBox[]): BoundingBox[] {
  return boxes.map((box) => {
    const width = box.x2 - box.x1 + 1;
    const height = box.y2 - box.y1 + 1;
    return {
      ...box,
      width,
      height,
      area: width * height,
    };
  });
}

const areOverlap = (r1: BoundingBox, r2: BoundingBox) => {
  // rect1とrect2はそれぞれ {x, y, x_max, y_max, w, h, area} の形式で与えられると仮定します。

  // 重なりチェック
  const isOverlapping = !(
    r1.x2 < r2.x1 ||
    r2.x2 < r1.x1 ||
    r1.y2 < r2.y1 ||
    r2.y2 < r1.y1
  );
  if (isOverlapping) {
    return true;
  }

  // 包含チェック
  const isContaining =
    (r1.x1 <= r2.x1 && r1.x2 >= r2.x2 && r1.y1 <= r2.y1 && r1.y2 >= r2.y2) ||
    (r2.x1 <= r1.x1 && r2.x2 >= r1.x2 && r2.y1 <= r1.y1 && r2.y2 >= r1.y2);

  if (isContaining) {
    return true;
  }
  // 隣接チェック
  return (
    ((r1.x2 === r2.x1 || r1.x1 === r2.x2) &&
      !(r1.y2 < r2.y1 || r1.y1 > r2.y2)) ||
    ((r1.y2 === r2.y1 || r1.y1 === r2.y2) && !(r1.x2 < r2.x1 || r1.x1 > r2.x2))
  );
};

function mergeIndexed(boxes: BoundingBox[]): BoundingBox[] | undefined {
  const spatial = createBoxSpatialGrid(boxes);
  if (!spatial) return;
  const { heads, ids, next } = spatial;
  const active = new Uint8Array(boxes.length).fill(1);
  const seen = new Uint32Array(boxes.length);
  let stamp = 0;
  for (let i = 0; i < boxes.length; i++) {
    if (!active[i]) continue;
    let cursor = i;
    let mergeCount = 0;
    for (;;) {
      const range = mergeCount >= 32 ? undefined : boxCellRange(boxes[i]);
      if (!range) {
        // Continue in original order if the merged box grows too large or
        // repeated merges make scanning the remaining entries cheaper.
        for (let j = cursor + 1; j < boxes.length; j++)
          if (active[j] && areOverlap(boxes[i], boxes[j])) {
            boxes[i] = mergeTwoBoundingBox(boxes[i], boxes[j]);
            active[j] = 0;
          }
        break;
      }
      stamp = (stamp + 1) >>> 0;
      if (stamp === 0) {
        seen.fill(0);
        stamp = 1;
      }
      const candidates: number[] = [];
      let dense = false;
      const maxCandidates = Math.min(
        512,
        Math.ceil((boxes.length - cursor - 1) / 2),
      );
      collect: for (let x = range[0]; x <= range[1]; x++)
        for (let y = range[2]; y <= range[3]; y++) {
          const key = boxCellKey(x, y);
          for (
            let link = heads.get(key) ?? 0;
            link !== 0;
            link = next[link - 1]
          ) {
            const id = ids[link - 1];
            if (id > cursor && active[id] && seen[id] !== stamp) {
              seen[id] = stamp;
              candidates.push(id);
              if (candidates.length > maxCandidates) {
                dense = true;
                break collect;
              }
            }
          }
        }
      if (dense) {
        for (let j = cursor + 1; j < boxes.length; j++)
          if (active[j] && areOverlap(boxes[i], boxes[j])) {
            boxes[i] = mergeTwoBoundingBox(boxes[i], boxes[j]);
            active[j] = 0;
          }
        break;
      }
      candidates.sort((a, b) => a - b);
      let merged = false;
      for (const j of candidates) {
        cursor = j;
        if (areOverlap(boxes[i], boxes[j])) {
          boxes[i] = mergeTwoBoundingBox(boxes[i], boxes[j]);
          active[j] = 0;
          merged = true;
          mergeCount++;
          // The merged box can reach new cells. Requery only later entries:
          // the original loop never revisits entries already passed.
          break;
        }
      }
      if (!merged) break;
    }
  }
  return boxes.filter((_, i) => active[i] !== 0);
}
