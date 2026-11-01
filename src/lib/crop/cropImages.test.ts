import { Buffer } from "buffer";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { compressEIAv1 } from "@/lib/eia/compressEIAv1";
import { EiaCompressionCache } from "@/lib/eia/compressionCache";
import { decodeEIAv1 } from "@/lib/slidePreview/decodeEIAv1";
import lz4 from "lz4js";
import { describe, expect, it, vi } from "vitest";
import { cropImages } from "./cropImages";

const image = (
  index: number,
  buffer: Buffer,
  width = 32,
  height = 32,
): RawImageObjV1 => ({
  index,
  rect: { width, height },
  format: "RGB24",
  buffer,
  note: `note-${index}`,
});

function randomImage(seed: number, size = 32 * 32 * 3): Buffer {
  const buffer = Buffer.alloc(size);
  let state = seed >>> 0;
  for (let i = 0; i < size; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    buffer[i] = state & 255;
  }
  return buffer;
}

describe("EIA crop selection", () => {
  it("makes the same crop decision using a previously compressed master", () => {
    const source = randomImage(111);
    const changed = Buffer.from(source);
    for (let y = 8; y < 16; y++)
      for (let x = 8; x < 16; x++) changed[(y * 32 + x) * 3] ^= 255;
    const input = [image(0, source), image(1, changed)];
    const cached = new EiaCompressionCache(lz4.compress);
    cached.compressImage(Buffer.from(changed));
    const bound = vi.spyOn(cached, "frameSizeLowerBound");
    const result = cropImages(input, {
      optimizeEia: true,
      compressionCache: cached,
    });
    const uncached = cropImages(input, {
      optimizeEia: true,
      compressionCache: new EiaCompressionCache(lz4.compress),
    });
    expect(bound).toHaveBeenCalledWith(changed, expect.any(Number));
    expect(result).toEqual(uncached);
  });

  it("reuses only exactly reconstructible input buffers", () => {
    for (const hidden of [false, true]) {
      const source = randomImage(991);
      const changed = Buffer.from(source);
      for (let y = 12; y < 16; y++)
        for (let x = 12; x < 16; x++) {
          const i = (y * 32 + x) * 3;
          changed[i] = source[i] < 128 ? 255 : 0;
        }
      if (hidden) changed[0] = source[0] === 255 ? 254 : source[0] + 1;
      const result = cropImages([image(0, source), image(1, changed)], {
        optimizeEia: true,
        compressionCache: new EiaCompressionCache(lz4.compress),
      });
      const merged = result[1].cropped?.merged;
      expect(merged).toBeDefined();
      if (hidden) {
        expect(merged).not.toBe(changed);
        expect(merged?.[0]).toBe(source[0]);
      } else expect(merged).toBe(changed);
    }
  });

  it("preserves full-width crop rows", () => {
    const width = 64;
    const source = randomImage(123, width * width * 3);
    const changed = Buffer.from(source);
    for (let y = 20; y < 28; y++)
      for (let x = 0; x < width; x++) changed[(y * width + x) * 3] ^= 255;
    const result = cropImages(
      [image(0, source, width, width), image(1, changed, width, width)],
      {
        optimizeEia: true,
        compressionCache: new EiaCompressionCache(lz4.compress),
      },
    );
    const rect = result[1].cropped?.rects[0];
    expect(rect?.x).toBe(0);
    expect(rect?.width).toBe(width);
    expect(rect?.height).toBeLessThan(width);
    expect(result[1].cropped?.merged).toEqual(changed);
    if (!rect) throw new Error("Expected a crop rectangle");
    expect(rect.buffer).toEqual(
      changed.subarray(rect.y * width * 3, (rect.y + rect.height) * width * 3),
    );
  });

  it("builds multiple crop rectangles in their original payload order", () => {
    const width = 64;
    const source = randomImage(888, width * width * 3);
    const changed = Buffer.from(source);
    for (const [left, top] of [
      [4, 4],
      [45, 45],
    ]) {
      for (let y = top; y < top + 6; y++) {
        for (let x = left; x < left + 6; x++)
          changed[(y * width + x) * 3] ^= 255;
      }
    }
    const cache = new EiaCompressionCache(lz4.compress);
    const compress = vi.spyOn(cache, "compressRects");
    const result = cropImages(
      [image(0, source, width, width), image(1, changed, width, width)],
      {
        optimizeEia: true,
        compressionCache: cache,
      },
    );
    const rects = result[1].cropped?.rects;
    expect(rects?.length).toBeGreaterThan(1);
    expect(result[1].cropped?.merged).toEqual(changed);
    const payload = compress.mock.calls[0][1];
    expect(typeof payload).not.toBe("function");
    expect(payload).toEqual(
      Buffer.concat(rects?.map((rect) => rect.buffer) ?? []),
    );
  });

  it("serializes a cached multi-rectangle payload without changing its bytes", async () => {
    const source = Buffer.alloc(20 * 20 * 3, 1);
    const rects = [
      {
        index: 0,
        x: 1,
        y: 1,
        width: 4,
        height: 3,
        buffer: Buffer.alloc(4 * 3 * 3, 100),
      },
      {
        index: 1,
        x: 10,
        y: 10,
        width: 5,
        height: 2,
        buffer: Buffer.alloc(5 * 2 * 3, 150),
      },
    ];
    const payload = Buffer.concat(rects.map((rect) => rect.buffer));
    const frames = [
      image(0, source, 20, 20),
      {
        ...image(1, source, 20, 20),
        cropped: { baseIndex: 0, rects, merged: source },
      },
    ];
    const cached = new EiaCompressionCache(lz4.compress);
    cached.compressRects(rects, payload);
    const [withCache] = await compressEIAv1(
      frames,
      undefined,
      1,
      10,
      undefined,
      cached,
    );
    const [withoutHit] = await compressEIAv1(
      frames,
      undefined,
      1,
      10,
      undefined,
      new EiaCompressionCache(lz4.compress),
    );
    expect(withCache).toEqual(withoutHit);
    const end = withCache.indexOf(36);
    const delta = JSON.parse(withCache.subarray(4, end).toString()).i[1];
    expect(delta.u).toBe(payload.length);
    expect(
      Buffer.from(
        lz4.decompress(
          withCache.subarray(end + 1 + delta.s, end + 1 + delta.s + delta.l),
        ),
      ),
    ).toEqual(payload);
  });

  it("produces the same archive when per-conversion compressed payloads are reused", async () => {
    const source = randomImage(111);
    const changed = Buffer.from(source);
    for (let y = 8; y < 16; y++)
      for (let x = 8; x < 16; x++) changed[(y * 32 + x) * 3] ^= 255;
    const cache = new EiaCompressionCache();
    const images = cropImages([image(0, source), image(1, changed)], {
      optimizeEia: true,
      compressionCache: cache,
    });
    const [cached] = await compressEIAv1(
      images,
      undefined,
      1,
      10,
      undefined,
      cache,
    );
    const [uncached] = await compressEIAv1(images);
    expect(cached).toEqual(uncached);
  });

  it("encodes identical images as an existing one-pixel delta and preserves notes and bytes", async () => {
    const data = randomImage(123);
    const source = [image(0, data), image(1, Buffer.from(data))];
    const baseline = cropImages(source);
    const optimized = cropImages(source, { optimizeEia: true });
    expect(baseline[1].cropped).toBeUndefined();
    expect(optimized[1].cropped?.baseIndex).toBe(0);
    expect(optimized[1].cropped?.rects[0].buffer).toEqual(data.subarray(0, 3));
    expect(optimized[1].cropped?.merged).toEqual(data);
    expect(optimized[1].cropped?.merged).toBe(data);
    const [archive] = await compressEIAv1(optimized);
    const [oldArchive] = await compressEIAv1(baseline);
    expect(archive.length).toBeLessThan(oldArchive.length);
    const end = archive.indexOf(36);
    const manifest = JSON.parse(archive.subarray(4, end).toString());
    expect(manifest.i[1].e.note).toBe("note-1");
    const delta = manifest.i[1];
    const decoded = Buffer.from(
      lz4.decompress(
        archive.subarray(end + 1 + delta.s, end + 1 + delta.s + delta.l),
      ),
    );
    expect(decoded).toEqual(data.subarray(0, 3));
    vi.stubGlobal(
      "ImageData",
      class {
        data: Uint8ClampedArray;
        constructor(
          public width: number,
          public height: number,
        ) {
          this.data = new Uint8ClampedArray(width * height * 4);
        }
      },
    );
    try {
      const frames = decodeEIAv1(Uint8Array.from(archive).buffer).frames;
      expect(frames).toHaveLength(2);
      expect(frames[1].imageData.data).toEqual(frames[0].imageData.data);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("skips full-image compression when a delta is provably smaller", () => {
    const pixels = randomImage(1234, 256 * 256 * 3);
    for (const change of [false, true]) {
      const second = Buffer.from(pixels);
      if (change) second[(128 * 256 + 128) * 3] ^= 255;
      const encode = vi.fn((value: Uint8Array) => lz4.compress(value));
      const cache = new EiaCompressionCache(encode);
      const output = cropImages(
        [image(0, pixels, 256, 256), image(1, second, 256, 256)],
        { optimizeEia: true, compressionCache: cache },
      );
      expect(output[1].cropped?.baseIndex).toBe(0);
      expect(encode).toHaveBeenCalledTimes(1);
      expect(encode.mock.calls[0][0].length).toBeLessThan(pixels.length);
    }
  });

  it("uses the stronger match-history bound for a larger image delta", () => {
    const pixels = randomImage(9876, 256 * 256 * 3);
    const changed = Buffer.from(pixels);
    for (let y = 96; y < 136; y++)
      for (let x = 96; x < 136; x++) changed[(y * 256 + x) * 3] ^= 255;
    const encode = vi.fn((value: Uint8Array) => lz4.compress(value));
    const output = cropImages(
      [image(0, pixels, 256, 256), image(1, changed, 256, 256)],
      { optimizeEia: true, compressionCache: new EiaCompressionCache(encode) },
    );
    expect(output[1].cropped?.baseIndex).toBe(0);
    expect(encode).toHaveBeenCalledTimes(1);
    // This delta is too large for the inexpensive expansion-ratio bound.
    expect(encode.mock.calls[0][0].length).toBeGreaterThan(
      Math.ceil(pixels.length / 255),
    );
  });

  it("uses a master when a small compressed image beats a delta plus its metadata", () => {
    const original = Buffer.alloc(32 * 32 * 3, 0);
    const changed = Buffer.from(original);
    changed[(16 * 32 + 16) * 3] = 255;
    const baseline = cropImages([image(0, original), image(1, changed)]);
    const optimized = cropImages([image(0, original), image(1, changed)], {
      optimizeEia: true,
    });
    expect(baseline[1].cropped).toBeDefined();
    expect(optimized[1].cropped).toBeUndefined();
    expect(optimized[1].buffer).toEqual(changed);
  });

  it("does not discard differences hidden by the threshold", () => {
    const original = randomImage(9);
    const changed = Buffer.from(original);
    changed[0] = changed[0] === 255 ? 254 : changed[0] + 1;
    const output = cropImages([image(0, original), image(1, changed)], {
      optimizeEia: true,
    });
    expect(output[1].cropped).toBeUndefined();
    expect(output[1].buffer).toEqual(changed);
  });

  it("round-trips repeated GIF frames through the EIA animation pool", async () => {
    const pixels = randomImage(17);
    const frames = cropImages(
      [image(0, pixels), image(1, Buffer.from(pixels))],
      {
        optimizeEia: true,
      },
    );
    const animations = new Map([
      [
        0,
        [
          {
            x: 0,
            y: 0,
            w: 32,
            h: 32,
            fps: 10,
            format: "RGB24" as const,
            frames,
          },
        ],
      ],
    ]);
    const [archive] = await compressEIAv1(
      [image(0, pixels)],
      undefined,
      1,
      10,
      animations,
    );
    vi.stubGlobal(
      "ImageData",
      class {
        data: Uint8ClampedArray;
        constructor(
          public width: number,
          public height: number,
        ) {
          this.data = new Uint8ClampedArray(width * height * 4);
        }
      },
    );
    try {
      const animation = decodeEIAv1(Uint8Array.from(archive).buffer).frames[0]
        .animations?.[0];
      expect(animation?.frames).toHaveLength(2);
      expect(animation?.frames[0].data).toEqual(animation?.frames[1].data);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not reference a parent with different dimensions", () => {
    const output = cropImages(
      [
        image(0, randomImage(1), 32, 32),
        image(1, randomImage(2, 16 * 16 * 3), 16, 16),
      ],
      { optimizeEia: true },
    );
    expect(output[1].cropped).toBeUndefined();
  });

  it("includes every ancestor when splitting a chain of cropped slides", async () => {
    const slides = Array.from({ length: 5 }, (_, index) => {
      const pixels = Buffer.from([index, index, index]);
      return {
        ...image(index, pixels, 1, 1),
        cropped:
          index === 0
            ? undefined
            : {
                baseIndex: index - 1,
                merged: pixels,
                rects: [
                  { index: 0, x: 0, y: 0, width: 1, height: 1, buffer: pixels },
                ],
              },
      };
    });
    const archives = await compressEIAv1(slides, undefined, 5, 1);
    expect(archives).toHaveLength(5);
    for (const [i, archive] of archives.entries()) {
      const end = archive.indexOf("$");
      const manifest = JSON.parse(archive.subarray(4, end).toString());
      expect(manifest.i.map((entry: { n: string }) => entry.n)).toEqual(
        Array.from({ length: i + 1 }, (_, index) => String(index)),
      );
    }
  });

  it("rejects circular crop references", async () => {
    const pixels = Buffer.from([1, 2, 3]);
    const cropped = (index: number, baseIndex: number) => ({
      ...image(index, pixels, 1, 1),
      cropped: {
        baseIndex,
        merged: pixels,
        rects: [{ index: 0, x: 0, y: 0, width: 1, height: 1, buffer: pixels }],
      },
    });
    await expect(
      compressEIAv1([image(0, pixels, 1, 1), cropped(1, 2), cropped(2, 1)]),
    ).rejects.toThrow("Circular crop reference detected involving slide");
  });
});
