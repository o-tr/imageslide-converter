import { expect, it } from "vitest";
import { diff2boundingBox } from "./diff2boundingBox";

function reference(
  mask: Uint8Array,
  width: number,
  height: number,
  padding: number,
) {
  const seen = new Set<number>();
  const result = [];
  for (let first = 0; first < width * height; first++) {
    if (!mask[first] || seen.has(first)) continue;
    const queue = [first];
    seen.add(first);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < queue.length; i++) {
      const position = queue[i];
      const x = position % width;
      const y = Math.floor(position / width);
      xs.push(x);
      ys.push(y);
      for (const [nx, ny] of [
        [x, y - 1],
        [x + 1, y],
        [x, y + 1],
        [x - 1, y],
      ]) {
        const next = ny * width + nx;
        if (
          nx >= 0 &&
          nx < width &&
          ny >= 0 &&
          ny < height &&
          mask[next] &&
          !seen.has(next)
        ) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const x1 = Math.max(0, Math.min(...xs) - padding);
    const y1 = Math.max(0, Math.min(...ys) - padding);
    const x2 = Math.min(width - 1, Math.max(...xs) + padding);
    const y2 = Math.min(height - 1, Math.max(...ys) + padding);
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    result.push({ x1, y1, x2, y2, width: w, height: h, area: w * h });
  }
  return result;
}

it("preserves connected-component bounds and ordering across masks and padding", () => {
  let state = 817;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  for (let n = 0; n < 400; n++) {
    const width = 1 + (random() % 31);
    const height = 1 + (random() % 29);
    const mask = new Uint8Array(width * height);
    const threshold = n % 8;
    for (let i = 0; i < mask.length; i++)
      mask[i] = random() % 8 < threshold ? 2 : 0;
    const padding = n % 4;
    expect(diff2boundingBox(mask, width, height, padding)).toEqual(
      reference(mask, width, height, padding),
    );
  }
});
