import type { BoundingBox } from "@/_types/lib/crop";

export const diff2boundingBox = (
  maskArray: Uint8Array,
  width: number,
  height: number,
  padding = 0,
): BoundingBox[] => {
  const boxes: BoundingBox[] = [];
  const visited = new Uint8Array(maskArray.length);
  // One integer per pending pixel avoids allocating a coordinate pair for
  // every visited pixel. Mark on insertion so no pixel is queued twice.
  const stack: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const first = y * width + x;
      if (maskArray[first] === 0 || visited[first]) continue;
      visited[first] = 1;
      stack.push(first);
      let x1 = x;
      let x2 = x;
      let y1 = y;
      let y2 = y;
      while (stack.length) {
        const at = stack.pop() as number;
        const px = at % width;
        const py = Math.floor(at / width);
        if (px < x1) x1 = px;
        if (px > x2) x2 = px;
        if (py < y1) y1 = py;
        if (py > y2) y2 = py;
        if (py > 0) {
          const p = at - width;
          if (!visited[p] && maskArray[p] !== 0) {
            visited[p] = 1;
            stack.push(p);
          }
        }
        if (px + 1 < width) {
          const p = at + 1;
          if (!visited[p] && maskArray[p] !== 0) {
            visited[p] = 1;
            stack.push(p);
          }
        }
        if (py + 1 < height) {
          const p = at + width;
          if (!visited[p] && maskArray[p] !== 0) {
            visited[p] = 1;
            stack.push(p);
          }
        }
        if (px > 0) {
          const p = at - 1;
          if (!visited[p] && maskArray[p] !== 0) {
            visited[p] = 1;
            stack.push(p);
          }
        }
      }
      x1 = Math.max(0, x1 - padding);
      y1 = Math.max(0, y1 - padding);
      x2 = Math.min(width - 1, x2 + padding);
      y2 = Math.min(height - 1, y2 + padding);
      const w = x2 - x1 + 1;
      const h = y2 - y1 + 1;
      boxes.push({ x1, y1, x2, y2, width: w, height: h, area: w * h });
    }
  return boxes;
};
