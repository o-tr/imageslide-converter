import { describe, expect, it, vi } from "vitest";
import { EiaCompressionCache } from "./compressionCache";

describe("EIA per-conversion compression cache", () => {
  it("compares differently aligned views across all offsets", () => {
    for (let firstOffset = 0; firstOffset < 4; firstOffset++) {
      for (let secondOffset = 0; secondOffset < 4; secondOffset++) {
        const length = 65539;
        const first = new Uint8Array(length + firstOffset).subarray(
          firstOffset,
        );
        const equal = new Uint8Array(length + secondOffset).subarray(
          secondOffset,
        );
        const different = new Uint8Array(length + secondOffset).subarray(
          secondOffset,
        );
        different[17] = 7;
        const encode = vi.fn((bytes: Uint8Array) => Uint8Array.of(bytes[17]));
        const cache = new EiaCompressionCache(encode);
        expect(cache.compressImage(first)).toEqual(Uint8Array.of(0));
        expect(cache.compressImage(equal)).toEqual(Uint8Array.of(0));
        expect(cache.compressImage(different)).toEqual(Uint8Array.of(7));
        expect(encode).toHaveBeenCalledTimes(2);
      }
    }
  });

  it("compares equally misaligned views and their initial alignment bytes", () => {
    for (let offset = 1; offset <= 3; offset++) {
      for (let delta = 0; delta < 5; delta++) {
        const length = 65537 + delta;
        const first = new Uint8Array(length + offset).subarray(offset);
        const equal = new Uint8Array(length + offset + 4).subarray(offset + 4);
        const different = new Uint8Array(length + offset + 8).subarray(
          offset + 8,
        );
        different[16 + (delta % 3)] = 7;
        const encode = vi.fn((bytes: Uint8Array) =>
          Uint8Array.of(bytes[16], bytes[17], bytes[18]),
        );
        const cache = new EiaCompressionCache(encode);
        expect(cache.compressImage(first)).toEqual(Uint8Array.of(0, 0, 0));
        expect(cache.compressImage(equal)).toEqual(Uint8Array.of(0, 0, 0));
        expect(cache.compressImage(different)).not.toEqual(
          Uint8Array.of(0, 0, 0),
        );
        expect(encode).toHaveBeenCalledTimes(2);
      }
    }
  });

  it("compares aligned views through the final partial word", () => {
    for (let length = 1024; length < 1033; length++) {
      const first = new Uint8Array(length + 4).subarray(4);
      const equal = new Uint8Array(length + 8).subarray(8);
      const different = new Uint8Array(length + 12).subarray(12);
      different[17] = 7;
      const encode = vi.fn((bytes: Uint8Array) => Uint8Array.of(bytes[17]));
      const cache = new EiaCompressionCache(encode);
      expect(cache.compressImage(first)).toEqual(Uint8Array.of(0));
      expect(cache.compressImage(equal)).toEqual(Uint8Array.of(0));
      expect(cache.compressImage(different)).toEqual(Uint8Array.of(7));
      expect(encode).toHaveBeenCalledTimes(2);
    }
  });

  it("uses a cached image's exact compressed size for later comparisons", () => {
    const encode = vi.fn(() => new Uint8Array(128));
    const cache = new EiaCompressionCache(encode);
    const image = new Uint8Array(4096);
    expect(cache.frameSizeLowerBound(image, 100)).toBeLessThan(128);
    cache.compressImage(image);
    expect(cache.frameSizeLowerBound(image, 100)).toBe(128);
    expect(cache.frameSizeLowerBound(image, 200)).toBe(128);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("checks content before reusing a cached size for a different image", () => {
    const encode = vi.fn((bytes: Uint8Array) => new Uint8Array(128 + bytes[1]));
    const cache = new EiaCompressionCache(encode);
    const first = new Uint8Array(4096);
    const equal = Uint8Array.from(first);
    const collision = Uint8Array.from(first);
    collision[1] = 1; // The sampled fingerprint does not inspect this byte.
    cache.compressImage(first);
    expect(cache.frameSizeLowerBound(equal, 1)).toBeLessThan(128);
    expect(cache.frameSizeLowerBound(equal, 100)).toBe(128);
    expect(cache.frameSizeLowerBound(collision, 100)).toBeLessThan(128);
    expect(cache.compressImage(equal)).toHaveLength(128);
    expect(cache.compressImage(collision)).toHaveLength(129);
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("reuses matching views but checks different ranges of the same buffer", () => {
    const encode = vi.fn((bytes: Uint8Array) => Uint8Array.of(bytes[1]));
    const cache = new EiaCompressionCache(encode);
    const storage = new Uint8Array(131_074);
    const first = storage.subarray(0, 65_537);
    const same = storage.subarray(0, 65_537);
    const different = storage.subarray(65_537);
    different[1] = 7;
    expect(cache.compressImage(first)).toEqual(Uint8Array.of(0));
    expect(cache.compressImage(same)).toEqual(Uint8Array.of(0));
    expect(cache.compressImage(different)).toEqual(Uint8Array.of(7));
    expect(encode).toHaveBeenCalledTimes(2);
  });

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

  it("limits content retention and reuses large identical inputs", () => {
    const encode = vi.fn((bytes: Uint8Array) => Uint8Array.from(bytes));
    const cache = new EiaCompressionCache(encode);
    const large = new Uint8Array(65537);
    cache.compressImage(large);
    cache.compressImage(large);
    cache.compressImage(Uint8Array.from(large));
    expect(encode).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 33; i++) cache.compressImage(Uint8Array.of(i));
    cache.compressImage(Uint8Array.of(0));
    expect(encode).toHaveBeenCalledTimes(35);
  });
  it("verifies weakly held large inputs when sampled hashes collide", () => {
    const encode = vi.fn((bytes: Uint8Array) => Uint8Array.of(bytes[1]));
    const cache = new EiaCompressionCache(encode);
    const first = new Uint8Array(2 * 1024 * 1024);
    const second = Uint8Array.from(first);
    second[1] = 7;
    expect(cache.compressImage(first)).toEqual(Uint8Array.of(0));
    expect(cache.compressImage(second)).toEqual(Uint8Array.of(7));
    expect(cache.compressImage(Uint8Array.from(first))).toEqual(
      Uint8Array.of(0),
    );
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("compares unaligned views and trailing bytes across word boundaries", () => {
    for (const length of [1023, 1024, 1025, 1026, 1027, 1031, 65541]) {
      const first = new Uint8Array(length + 2).subarray(1, length + 1);
      const same = new Uint8Array(length + 5).subarray(3, length + 3);
      const different = new Uint8Array(length + 7).subarray(4, length + 4);
      different[17] = 7; // Not among the 64 evenly spaced samples.
      const encode = vi.fn((bytes: Uint8Array) => Uint8Array.of(bytes[17]));
      const cache = new EiaCompressionCache(encode);
      expect(cache.compressImage(first)).toEqual(Uint8Array.of(0));
      expect(cache.compressImage(same)).toEqual(Uint8Array.of(0));
      expect(cache.compressImage(different)).toEqual(Uint8Array.of(7));
      expect(encode).toHaveBeenCalledTimes(2);
    }
  });

  it("checks the beginning, middle and end of colliding large inputs", () => {
    const length = 256 * 1024;
    const points = [1, length / 2 + 1, length - 2];
    const encode = vi.fn((bytes: Uint8Array) =>
      Uint8Array.from(points, (index) => bytes[index]),
    );
    const cache = new EiaCompressionCache(encode);
    const inputs = [
      new Uint8Array(length),
      ...points.map((index) => {
        const bytes = new Uint8Array(length);
        bytes[index] = 1;
        return bytes;
      }),
    ];
    for (const input of inputs)
      expect(cache.compressImage(input)).toEqual(
        Uint8Array.from(points, (index) => input[index]),
      );
    expect(encode).toHaveBeenCalledTimes(4);
  });

  it("falls back to identity-only caching when WeakRef is unavailable", () => {
    vi.stubGlobal("WeakRef", undefined);
    try {
      const encode = vi.fn((bytes: Uint8Array) => Uint8Array.of(bytes[0]));
      const cache = new EiaCompressionCache(encode);
      const large = new Uint8Array(65537);
      cache.compressImage(large);
      cache.compressImage(large);
      cache.compressImage(Uint8Array.from(large));
      expect(encode).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not retain large compressed results above the byte budget", () => {
    const encode = vi.fn(() => new Uint8Array(1024 * 1024 + 1));
    const cache = new EiaCompressionCache(encode);
    const input = new Uint8Array(65537);
    cache.compressImage(input);
    cache.compressImage(Uint8Array.from(input));
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("treats a collected weak input as a cache miss", () => {
    class CollectedRef {
      deref() {
        return undefined;
      }
    }
    vi.stubGlobal("WeakRef", CollectedRef);
    try {
      const encode = vi.fn((bytes: Uint8Array) => Uint8Array.of(bytes[0]));
      const cache = new EiaCompressionCache(encode);
      const large = new Uint8Array(65537);
      cache.compressImage(large);
      cache.compressImage(Uint8Array.from(large));
      expect(encode).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
