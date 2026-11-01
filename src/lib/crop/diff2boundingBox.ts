import type { BoundingBox } from "@/_types/lib/crop";

export const diff2boundingBox = (
  maskArray: Uint8Array,
  width: number,
  height: number,
  padding = 0,
  consumeMask = false,
  binaryMask = false,
): BoundingBox[] => {
  // The fast path is valid only for complete masks containing 0 or 1.
  const fastBinary =
    binaryMask &&
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height >= 0 &&
    width * height <= maskArray.length;
  const boxes: BoundingBox[] = [];
  // Callers with exclusive ownership can let traversal consume the mask.
  // Otherwise copy it to preserve the public function's input semantics.
  const remaining = consumeMask ? maskArray : Uint8Array.from(maskArray);
  // A pending seed represents a contiguous horizontal run.
  const stack: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let first = y * width + x;
      if (remaining[first] === 0) {
        if (!fastBinary) continue;
        first = remaining.indexOf(1, first);
        if (first < 0 || first >= width * height) return boxes;
        y = Math.floor(first / width);
        x = first - y * width;
      }
      // All earlier rows and positions have already been consumed. A first
      // pixel with no right or lower neighbor is a one-pixel component.
      if (
        (x + 1 >= width || remaining[first + 1] === 0) &&
        (y + 1 >= height || remaining[first + width] === 0)
      )
        remaining[first] = 0;
      else stack.push(first);
      let x1 = x;
      let x2 = x;
      let y1 = y;
      let y2 = y;
      while (stack.length) {
        const at = stack.pop() as number;
        if (remaining[at] === 0) continue;
        const py = Math.floor(at / width);
        const px = at - py * width;
        const row = py * width;
        let left = px;
        let right = px;
        while (left > 0 && remaining[row + left - 1] !== 0) left--;
        while (right + 1 < width && remaining[row + right + 1] !== 0) right++;
        if (left < x1) x1 = left;
        if (right > x2) x2 = right;
        if (py < y1) y1 = py;
        if (py > y2) y2 = py;
        let aboveRun = false;
        let belowRun = false;
        for (let xx = left; xx <= right; xx++) {
          const p = row + xx;
          remaining[p] = 0;
          const above = py > 0 && remaining[p - width] !== 0;
          if (above && !aboveRun) stack.push(p - width);
          aboveRun = above;
          const below = py + 1 < height && remaining[p + width] !== 0;
          if (below && !belowRun) stack.push(p + width);
          belowRun = below;
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
