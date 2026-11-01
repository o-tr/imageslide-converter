import type { BoundingBox } from "@/_types/lib/crop";
import { boxCellKey, createBoxSpatialGrid } from "./boxSpatialGrid";

export const shrinkOverlapBoundingBox = (
  boundingBoxes: BoundingBox[],
): BoundingBox[] => {
  const boxes = structuredClone(boundingBoxes);
  if (boxes.length >= 1024 && hasEnoughInteriors(boxes) && shrinkIndexed(boxes))
    return finish(boxes);

  // Every adjustment only raises a lower edge or lowers an upper edge. A box
  // without strict interior cannot gain one, so two such boxes can never
  // satisfy any of the containment checks below.
  const containers: number[] = [];
  const potential = boxes.map((box, index) => {
    const canContain = box.x1 < box.x2 && box.y1 < box.y2;
    if (canContain) containers.push(index);
    return canContain;
  });
  continueLinear(boxes, potential, containers, 0, 1);
  return finish(boxes);
};

function hasEnoughInteriors(boxes: BoundingBox[]): boolean {
  let count = 0;
  for (const box of boxes) {
    if (box.x1 < box.x2 && box.y1 < box.y2 && ++count >= 128) return true;
  }
  return false;
}

function finish(boxes: BoundingBox[]): BoundingBox[] {
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

const isInside = (box: BoundingBox, x: number, y: number) => {
  return box.x1 < x && x < box.x2 && box.y1 < y && y < box.y2;
};

function shrinkIndexed(boxes: BoundingBox[]): boolean {
  // Until an edge crosses its opposite edge, adjustments can only contract
  // a box. Its original cells therefore cover every relevant later pair.
  const spatial = createBoxSpatialGrid(boxes);
  if (!spatial) return false;
  const { ranges, heads, ids, next } = spatial;
  const potential = boxes.map((b) => b.x1 < b.x2 && b.y1 < b.y2);
  const containers: number[] = [];
  for (let i = 0; i < boxes.length; i++) if (potential[i]) containers.push(i);
  const seen = new Uint32Array(boxes.length);
  let stamp = 0;
  for (let i = 0; i < boxes.length; i++) {
    stamp = (stamp + 1) >>> 0;
    if (!stamp) {
      seen.fill(0);
      stamp = 1;
    }
    const p = i * 4;
    const candidates: number[] = [];
    let dense = false;
    const maxCandidates = Math.min(512, Math.ceil((boxes.length - i - 1) / 2));
    collect: for (let x = ranges[p]; x <= ranges[p + 1]; x++)
      for (let y = ranges[p + 2]; y <= ranges[p + 3]; y++) {
        const key = boxCellKey(x, y);
        for (
          let link = heads.get(key) ?? 0;
          link !== 0;
          link = next[link - 1]
        ) {
          const j = ids[link - 1];
          // Two boxes without an interior cannot satisfy any adjustment.
          // Edges only contract; an inversion switches to the ordered scan.
          if (j > i && (potential[i] || potential[j]) && seen[j] !== stamp) {
            seen[j] = stamp;
            candidates.push(j);
            if (candidates.length > maxCandidates) {
              dense = true;
              break collect;
            }
          }
        }
      }
    if (dense) {
      // Resume the ordered scan before examining this dense row.
      continueLinear(boxes, potential, containers, i, i + 1);
      return true;
    }
    candidates.sort((a, b) => a - b);
    for (const j of candidates) {
      const boxA = boxes[i];
      const boxB = boxes[j];
      adjustPair(boxA, boxB);
      if (
        boxA.x1 > boxA.x2 ||
        boxA.y1 > boxA.y2 ||
        boxB.x1 > boxB.x2 ||
        boxB.y1 > boxB.y2
      ) {
        // Inversion may move endpoints beyond the original indexed extent.
        // The current pair is done; continue from the next pair in order.
        continueLinear(boxes, potential, containers, i, j + 1);
        return true;
      }
    }
  }
  return true;
}
function continueLinear(
  boxes: BoundingBox[],
  potential: boolean[],
  containers: number[],
  rowStart: number,
  columnStart: number,
): void {
  let first = 0;
  for (let row = rowStart; row < boxes.length; row++) {
    while (first < containers.length && containers[first] <= row) first++;
    const begin = row === rowStart ? columnStart : row + 1;
    if (potential[row]) {
      for (let col = begin; col < boxes.length; col++)
        adjustPair(boxes[row], boxes[col]);
    } else {
      for (let k = first; k < containers.length; k++) {
        const col = containers[k];
        if (col >= begin) adjustPair(boxes[row], boxes[col]);
      }
    }
  }
}
function adjustPair(a: BoundingBox, b: BoundingBox): void {
  // The historical three cases after the final condition repeated that exact
  // condition and were unreachable after its first match.
  if (isInside(a, b.x2, b.y1) && isInside(a, b.x2, b.y2)) b.x2 = a.x1;
  else if (isInside(a, b.x1, b.y1) && isInside(a, b.x1, b.y2)) b.x1 = a.x2;
  else if (isInside(a, b.x1, b.y2) && isInside(a, b.x2, b.y2)) b.y2 = a.y1;
  else if (isInside(a, b.x1, b.y1) && isInside(a, b.x2, b.y1)) b.y1 = a.y2;
  else if (isInside(b, a.x1, a.y1) && isInside(b, a.x2, a.y2)) a.x1 = b.x2;
}
