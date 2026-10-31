import { Buffer } from "buffer";
import * as diff from "@/lib/rawImage2Diff/rgb242diff";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectBestParent } from "./selectBestParent";

afterEach(() => vi.restoreAllMocks());

describe("parent selection", () => {
  it("stops when the first candidate has the minimum possible diff", () => {
    const buffer = Buffer.alloc(12 * 12 * 3, 20);
    const current = {
      index: 10,
      rect: { width: 12, height: 12 },
      format: "RGB24" as const,
      buffer,
    };
    const candidates = [0, 1, 2].map((index) => ({
      index,
      rect: current.rect,
      thumbnail: new Uint8Array([20, 20, 20]),
    }));
    const buffers = new Map(
      candidates.map(({ index }) => [index, Buffer.from(buffer)]),
    );
    const spy = vi.spyOn(diff, "rgb242diff");
    const result = selectBestParent(
      current,
      candidates[0].thumbnail,
      candidates,
      buffers,
      3,
    );
    expect(result?.parent.index).toBe(0);
    expect(result?.diff.every((pixel) => pixel === 0)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("discards a candidate at the best score and retains a later better mask", () => {
    const buffer = Buffer.alloc(12 * 12 * 3, 0);
    const current = {
      index: 10,
      rect: { width: 12, height: 12 },
      format: "RGB24" as const,
      buffer,
    };
    const candidates = [0, 1, 2].map((index) => ({
      index,
      rect: current.rect,
      thumbnail: new Uint8Array(3),
    }));
    const parent = (changed: number) => {
      const value = Buffer.from(buffer);
      for (let i = 0; i < changed; i++) value[i * 3] = 255;
      return value;
    };
    const buffers = new Map([
      [0, parent(20)],
      [1, parent(50)],
      [2, parent(10)],
    ]);
    const result = selectBestParent(
      current,
      candidates[0].thumbnail,
      candidates,
      buffers,
      3,
    );
    expect(result?.parent.index).toBe(2);
    expect(result?.diff.reduce((count, value) => count + value, 0)).toBe(10);
  });
});
