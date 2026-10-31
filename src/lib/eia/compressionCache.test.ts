import { describe, expect, it, vi } from "vitest";
import { EiaCompressionCache } from "./compressionCache";

describe("EIA per-conversion compression cache", () => {
  it("reuses identical immutable contents across images and rectangle arrays", () => {
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
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("checks all bytes even when sampled fingerprints collide", () => {
    const encode = vi.fn((bytes: Uint8Array) => Uint8Array.from(bytes));
    const cache = new EiaCompressionCache(encode);
    const first = new Uint8Array(1024);
    const second = Uint8Array.from(first);
    second[1] = 1; // The 64 samples are spaced 16 bytes apart.
    expect(cache.compressImage(first)).toEqual(first);
    expect(cache.compressImage(second)).toEqual(second);
    expect(cache.compressImage(Uint8Array.from(first))).toEqual(first);
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("constructs a rectangle payload only on a cache miss", () => {
    const encode = vi.fn((bytes: Uint8Array) => Uint8Array.from(bytes));
    const cache = new EiaCompressionCache(encode);
    const rects = [
      {
        index: 0,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        buffer: Buffer.from([1, 2, 3]),
      },
    ];
    const makePayload = vi.fn(() => Uint8Array.of(1, 2, 3));
    expect(cache.compressRects(rects, makePayload)).toEqual(
      Uint8Array.of(1, 2, 3),
    );
    expect(cache.compressRects(rects, makePayload)).toEqual(
      Uint8Array.of(1, 2, 3),
    );
    expect(makePayload).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("limits content retention and still uses identity caching for large inputs", () => {
    const encode = vi.fn((bytes: Uint8Array) => Uint8Array.from(bytes));
    const cache = new EiaCompressionCache(encode);
    const large = new Uint8Array(65537);
    cache.compressImage(large);
    cache.compressImage(large);
    cache.compressImage(Uint8Array.from(large));
    expect(encode).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 33; i++) cache.compressImage(Uint8Array.of(i));
    cache.compressImage(Uint8Array.of(0));
    expect(encode).toHaveBeenCalledTimes(36);
  });
});
