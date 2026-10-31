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
});
