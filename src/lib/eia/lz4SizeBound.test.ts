import lz4 from "lz4js";
import { describe, expect, it } from "vitest";
import { compressLz4Search } from "./lz4Search";
import { lz4FrameSizeLowerBound } from "./lz4SizeBound";

describe("LZ4 frame size lower bound", () => {
  it("never exceeds standard frames for varied data and offsets", () => {
    let state = 73;
    for (let sample = 0; sample < 300; sample++) {
      const size = (sample * 83) % 10000;
      const backing = new Uint8Array(size + 9);
      const data = backing.subarray(5, 5 + size);
      for (let i = 0; i < size; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        const value = state >>> 0;
        data[i] =
          sample % 4 === 0
            ? value & 255
            : sample % 4 === 1
              ? i % 17
              : sample % 4 === 2 && i > 80 && value % 5
                ? data[i - 1 - (value % 80)]
                : value & 15;
      }
      const bound = lz4FrameSizeLowerBound(data);
      expect(bound).toBeLessThanOrEqual(lz4.compress(data).length);
      if (sample % 30 === 0)
        expect(bound).toBeLessThanOrEqual(compressLz4Search(data).length);
    }
  });

  it("returns a useful conservative bound even when stopped early", () => {
    const data = new Uint8Array(8192);
    let state = 12;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state & 255;
    }
    const full = lz4FrameSizeLowerBound(data);
    const partial = lz4FrameSizeLowerBound(data, 64);
    expect(partial).toBeGreaterThanOrEqual(64);
    expect(partial).toBeLessThanOrEqual(full);
    expect(full).toBeGreaterThan(Math.ceil(data.length / 255));
    expect(full).toBeLessThanOrEqual(lz4.compress(data).length);
  });

  it("does not miss a reachable target when it stops early", () => {
    let state = 91;
    for (let sample = 0; sample < 80; sample++) {
      const data = new Uint8Array(500 + sample * 137);
      for (let i = 0; i < data.length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        const value = state >>> 0;
        data[i] = sample % 2 ? value & 255 : value & 7;
      }
      const full = lz4FrameSizeLowerBound(data);
      for (const target of [1, 100, 1000, data.length >>> 1, data.length]) {
        const partial = lz4FrameSizeLowerBound(data, target);
        expect(partial).toBeLessThanOrEqual(full);
        if (partial < target) expect(full).toBeLessThan(target);
      }
    }
  });

  it("clears a reused workspace after early exits and changing input sizes", () => {
    const workspace: { seen?: Uint32Array } = {};
    const first = Uint8Array.from(
      { length: 12000 },
      (_, index) => (index * 17) & 255,
    );
    const second = Uint8Array.from(
      { length: 2000 },
      (_, index) => (index * 31 + 7) & 255,
    );
    lz4FrameSizeLowerBound(first, 100, workspace);
    const table = workspace.seen;
    expect(table).toBeDefined();
    expect(
      lz4FrameSizeLowerBound(second, Number.POSITIVE_INFINITY, workspace),
    ).toBe(lz4FrameSizeLowerBound(second));
    expect(workspace.seen).toBe(table);
    expect(
      lz4FrameSizeLowerBound(first, Number.POSITIVE_INFINITY, workspace),
    ).toBe(lz4FrameSizeLowerBound(first));
  });

  it("stays conservative for long runs and window-boundary repetitions", () => {
    const uniform = new Uint8Array(4 * 1024 * 1024 + 31).fill(73);
    expect(lz4FrameSizeLowerBound(uniform)).toBeLessThanOrEqual(
      lz4.compress(uniform).length,
    );
    const data = new Uint8Array(200000);
    let state = 41;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state & 255;
    }
    data.set(data.subarray(0, 65535), 65535);
    expect(lz4FrameSizeLowerBound(data)).toBeLessThanOrEqual(
      lz4.compress(data).length,
    );
  }, 30000);
});
