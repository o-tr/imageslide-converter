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
  it("reuses discarded masks without overwriting the best candidate", () => {
    const current = {
      index: 10,
      rect: { width: 12, height: 12 },
      format: "RGB24" as const,
      buffer: Buffer.alloc(12 * 12 * 3),
    };
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      index,
      rect: current.rect,
      thumbnail: new Uint8Array(3),
    }));
    const parent = (pixels: number, offset: number) => {
      const buffer = Buffer.from(current.buffer);
      for (let i = offset; i < offset + pixels; i++) buffer[i * 3] = 255;
      return buffer;
    };
    const buffers = new Map([
      [0, parent(20, 0)],
      [1, parent(50, 0)],
      [2, parent(10, 30)],
      [3, parent(30, 0)],
      [4, parent(5, 60)],
    ]);
    const spy = vi.spyOn(diff, "rgb242diff");
    const result = selectBestParent(
      current,
      candidates[0].thumbnail,
      candidates,
      buffers,
      5,
    );
    expect(result?.parent.index).toBe(4);
    expect(Array.from(result?.diff ?? [])).toEqual(
      Array.from({ length: 144 }, (_, i) => (i >= 60 && i < 65 ? 1 : 0)),
    );
    expect(spy).toHaveBeenCalledTimes(5);
    expect(spy.mock.calls[2][3]).toBe(spy.mock.results[1].value);
    expect(spy.mock.calls[3][3]).toBe(spy.mock.results[0].value);
  });
  it("keeps stable thumbnail ties and skips missing parents in a large candidate set", () => {
    const current = {
      index: 999,
      rect: { width: 8, height: 8 },
      format: "RGB24" as const,
      buffer: Buffer.alloc(8 * 8 * 3),
    };
    const candidates = Array.from({ length: 24 }, (_, index) => ({
      index,
      rect: current.rect,
      thumbnail: new Uint8Array(129).fill(index < 5 ? 1 : 200),
    }));
    const buffers = new Map<number, Buffer>();
    for (let index = 1; index < candidates.length; index++) {
      const buffer = Buffer.from(current.buffer);
      for (let i = 0; i < (index === 3 ? 1 : 5); i++) buffer[i * 3] = 255;
      buffers.set(index, buffer);
    }
    const result = selectBestParent(
      current,
      new Uint8Array(129),
      candidates,
      buffers,
      2,
    );
    // Candidate 0 is missing and candidate 3 must remain outside the first
    // two available equal-score thumbnails.
    expect(result?.parent.index).toBe(1);
    expect(result?.diff.reduce((sum, value) => sum + value, 0)).toBe(5);
  });

  it("still validates thumbnail lengths for candidates without buffers", () => {
    const current = {
      index: 0,
      rect: { width: 1, height: 1 },
      format: "RGB24" as const,
      buffer: Buffer.alloc(3),
    };
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      index,
      rect: current.rect,
      thumbnail: new Uint8Array(index === 19 ? 3 : 2),
    }));
    expect(() =>
      selectBestParent(current, new Uint8Array(2), candidates, new Map(), 1),
    ).toThrow("Thumbnail length mismatch: 3 vs 2");
  });
});
