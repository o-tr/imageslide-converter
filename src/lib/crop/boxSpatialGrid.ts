import type { BoundingBox } from "@/_types/lib/crop";

const CELL_SIZE = 32;
const MAX_CELLS_PER_BOX = 64;
// Two signed 26-bit cell coordinates fit exactly in a JavaScript number.
const CELL_COORD_OFFSET = 2 ** 25;
const CELL_COORD_SPAN = 2 ** 26;

type CellRange = [number, number, number, number];

export function boxCellRange(box: BoundingBox): CellRange | undefined {
  if (
    !Number.isSafeInteger(box.x1) ||
    !Number.isSafeInteger(box.y1) ||
    !Number.isSafeInteger(box.x2) ||
    !Number.isSafeInteger(box.y2) ||
    box.x1 > box.x2 ||
    box.y1 > box.y2
  )
    return;
  const x1 = Math.floor(box.x1 / CELL_SIZE);
  const x2 = Math.floor(box.x2 / CELL_SIZE);
  const y1 = Math.floor(box.y1 / CELL_SIZE);
  const y2 = Math.floor(box.y2 / CELL_SIZE);
  if (
    (x2 - x1 + 1) * (y2 - y1 + 1) > MAX_CELLS_PER_BOX ||
    x1 < -CELL_COORD_OFFSET ||
    x2 >= CELL_COORD_OFFSET ||
    y1 < -CELL_COORD_OFFSET ||
    y2 >= CELL_COORD_OFFSET
  )
    return;
  return [x1, x2, y1, y2];
}

export const boxCellKey = (x: number, y: number): number =>
  (x + CELL_COORD_OFFSET) * CELL_COORD_SPAN + y + CELL_COORD_OFFSET;

/** Undefined means callers should use their ordered, unindexed fallback. */
export function createBoxSpatialGrid(boxes: BoundingBox[]) {
  if (boxes.length > 1_000_000) return;
  const ranges = new Int32Array(boxes.length * 4);
  let references = 0;
  const limit = Math.min(1_000_000, Math.max(65_536, boxes.length * 8));
  for (let i = 0; i < boxes.length; i++) {
    const range = boxCellRange(boxes[i]);
    if (!range) return;
    references += (range[1] - range[0] + 1) * (range[3] - range[2] + 1);
    if (references > limit) return;
    ranges.set(range, i * 4);
  }
  // A zero head/link means the list has ended; other values are index + 1.
  const heads = new Map<number, number>();
  const ids = new Uint32Array(references);
  const next = new Uint32Array(references);
  let used = 0;
  for (let i = 0; i < boxes.length; i++) {
    const p = i * 4;
    for (let x = ranges[p]; x <= ranges[p + 1]; x++) {
      for (let y = ranges[p + 2]; y <= ranges[p + 3]; y++) {
        const key = boxCellKey(x, y);
        ids[used] = i;
        next[used] = heads.get(key) ?? 0;
        heads.set(key, ++used);
        if (heads.size > 65_536) return;
      }
    }
  }
  return { ranges, heads, ids, next };
}
