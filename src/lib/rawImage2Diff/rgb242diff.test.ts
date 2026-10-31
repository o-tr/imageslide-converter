import { Buffer } from "buffer";
import { IMAGE_DIFF_THRESHOLD } from "@/const/config";
import { describe, expect, it } from "vitest";
import { rgb242diff } from "./rgb242diff";

describe("RGB image diff", () => {
  it("returns a partial mask when the caller's cutoff is reached", () => {
    const a = {
      index: 0,
      rect: { width: 10, height: 10 },
      format: "RGB24" as const,
      buffer: Buffer.alloc(300),
    };
    const b = {
      index: 1,
      rect: a.rect,
      format: "RGB24" as const,
      buffer: Buffer.alloc(300, 255),
    };
    const stats = { count: 0, stopAt: 5 };
    const mask = rgb242diff(a, b, stats);
    expect(stats.count).toBe(5);
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(5);
    expect(rgb242diff(a, b).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("counts the same changed pixels as the mask for different dimensions", () => {
    for (let n = 0; n < 100; n++) {
      const width = 1 + (n % 31);
      const height = 1 + ((n * 7) % 29);
      const otherWidth = 1 + ((n * 11) % 31);
      const otherHeight = 1 + ((n * 13) % 29);
      const other = Buffer.alloc(otherWidth * otherHeight * 3);
      const current = Buffer.alloc(width * height * 3);
      let state = n + 1;
      for (const bytes of [other, current])
        for (let i = 0; i < bytes.length; i++) {
          state ^= state << 13;
          state ^= state >>> 17;
          state ^= state << 5;
          bytes[i] = state & 255;
        }
      const a = {
        index: 0,
        rect: { width: otherWidth, height: otherHeight },
        format: "RGB24" as const,
        buffer: other,
      };
      const b = {
        index: 1,
        rect: { width, height },
        format: "RGB24" as const,
        buffer: current,
      };
      const stats = { count: -1 };
      const mask = rgb242diff(a, b, stats);
      let expectedCount = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const pos = y * width + x;
          const p = pos * 3;
          const q = (y * otherWidth + x) * 3;
          const changed =
            x >= otherWidth ||
            y >= otherHeight ||
            Math.abs(other[q] - current[p]) +
              Math.abs(other[q + 1] - current[p + 1]) +
              Math.abs(other[q + 2] - current[p + 2]) >
              IMAGE_DIFF_THRESHOLD * 3;
          expect(mask[pos]).toBe(changed ? 1 : 0);
          if (changed) expectedCount++;
        }
      expect(stats.count).toBe(expectedCount);
    }
  });
});
