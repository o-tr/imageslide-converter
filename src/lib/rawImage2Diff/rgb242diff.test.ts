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

  it("retains suppressed-difference information when a scan stops early", () => {
    const a = {
      index: 0,
      rect: { width: 3, height: 1 },
      format: "RGB24" as const,
      buffer: Buffer.alloc(9),
    };
    const b = {
      ...a,
      index: 1,
      buffer: Buffer.from([1, 0, 0, 255, 0, 0, 0, 0, 0]),
    };
    const stats = { count: 0, stopAt: 1, hasSuppressedDifferences: false };
    expect(Array.from(rgb242diff(a, b, stats))).toEqual([0, 1, 0]);
    expect(stats).toEqual({
      count: 1,
      stopAt: 1,
      hasSuppressedDifferences: true,
    });
  });

  it("only treats matching views of the same storage as identical", () => {
    const storage = Buffer.alloc(24);
    storage.fill(255, 12);
    const image = {
      index: 0,
      rect: { width: 2, height: 2 },
      format: "RGB24" as const,
      buffer: storage.subarray(0, 12),
    };
    const sameView = { ...image, buffer: storage.subarray(0, 12) };
    const differentView = { ...image, buffer: storage.subarray(12, 24) };
    const stats = { count: -1 };
    const workspace = new Uint8Array(4).fill(9);
    expect(rgb242diff(image, sameView, stats, workspace)).toEqual(
      new Uint8Array(4),
    );
    expect(stats.count).toBe(0);
    expect(rgb242diff(image, differentView, stats, workspace)).toEqual(
      new Uint8Array(4).fill(1),
    );
    expect(stats.count).toBe(4);
    const otherDimensions = { ...sameView, rect: { width: 3, height: 1 } };
    expect(Array.from(rgb242diff(image, otherDimensions))).toEqual([0, 0, 1]);
  });

  it("clears a reused workspace, including the tail after an early cutoff", () => {
    const image = {
      index: 0,
      rect: { width: 4, height: 3 },
      format: "RGB24" as const,
      buffer: Buffer.alloc(36),
    };
    const different = { ...image, buffer: Buffer.alloc(36, 255) };
    const workspace = new Uint8Array(12).fill(7);
    const stats = { count: 0, stopAt: 2 };
    expect(rgb242diff(image, different, stats, workspace)).toBe(workspace);
    expect(Array.from(workspace)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(stats.count).toBe(2);
    expect(rgb242diff(image, image, undefined, workspace)).toBe(workspace);
    expect(workspace.every((value) => value === 0)).toBe(true);
  });

  it("matches the threshold and cutoff for packed images and unaligned views", () => {
    let state = 12345;
    for (let run = 0; run < 150; run++) {
      const width = 1 + (run % 19);
      const height = 1 + (run % 13);
      const aBytes = Buffer.alloc(width * height * 3 + 5).subarray(2, -3);
      const bBytes = Buffer.alloc(width * height * 3 + 3).subarray(1, -2);
      for (let i = 0; i < aBytes.length; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        aBytes[i] = state >>> 24;
        bBytes[i] = run % 2 && i % 5 ? aBytes[i] : (state >>> 16) & 255;
      }
      const image = {
        index: 0,
        rect: { width, height },
        format: "RGB24" as const,
      };
      const a = { ...image, buffer: aBytes };
      const b = { ...image, buffer: bBytes };
      for (const stopAt of [1, 3, width * height, Number.POSITIVE_INFINITY]) {
        const expected = new Uint8Array(width * height);
        let count = 0;
        for (let pixel = 0; pixel < expected.length; pixel++) {
          const i = pixel * 3;
          const delta =
            Math.abs(aBytes[i] - bBytes[i]) +
            Math.abs(aBytes[i + 1] - bBytes[i + 1]) +
            Math.abs(aBytes[i + 2] - bBytes[i + 2]);
          if (delta > IMAGE_DIFF_THRESHOLD * 3) {
            expected[pixel] = 1;
            if (++count >= stopAt) break;
          }
        }
        const stats = { count: -1, stopAt };
        expect(rgb242diff(a, b, stats)).toEqual(expected);
        expect(stats.count).toBe(count);
      }
    }
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
