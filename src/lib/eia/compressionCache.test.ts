import { describe, expect, it, vi } from "vitest";
import { EiaCompressionCache } from "./compressionCache";

describe("EIA per-conversion compression cache", () => {
  it("reuses only the same immutable image or rectangle array", () => {
    const encode = vi.fn((bytes: Uint8Array) => Uint8Array.from(bytes));
    const cache = new EiaCompressionCache(encode);
    const image = Uint8Array.of(1, 2, 3);
    const rects = [
      { index: 0, x: 0, y: 0, width: 1, height: 1, buffer: Buffer.from(image) },
    ];
    expect(cache.compressImage(image)).toEqual(image);
    expect(cache.compressImage(image)).toEqual(image);
    expect(cache.compressImage(Uint8Array.from(image))).toEqual(image);
    expect(cache.compressRects(rects, image)).toEqual(image);
    expect(cache.compressRects(rects, Uint8Array.from(image))).toEqual(image);
    expect(cache.compressRects([...rects], image)).toEqual(image);
    expect(encode).toHaveBeenCalledTimes(4);
  });
});
