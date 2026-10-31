import { Buffer } from "buffer";
import { IMAGE_DIFF_THRESHOLD } from "@/const/config";
import { Buffer as BrowserBuffer } from "buffer/";
import lz4 from "lz4js";
import { describe, expect, it } from "vitest";
import { hasSimilarPixels } from "./animationSimilarity";
import { compressEIAv1 } from "./compressEIAv1";
import { EiaCompressionCache } from "./compressionCache";

describe("animation frame similarity", () => {
  it("concatenates unaligned frame views with the browser Buffer implementation", () => {
    const first = Uint8Array.of(99, 1, 2, 99).subarray(1, 3);
    const second = Uint8Array.of(99, 3, 4, 5, 99).subarray(1, 4);
    expect(Array.from(BrowserBuffer.concat([first, second]))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("matches the full-mask count for RGB and RGBA frames", () => {
    let state = 12345;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    for (const bpp of [3, 4]) {
      for (let n = 0; n < 200; n++) {
        const a = new Uint8Array((1 + (random() % 1000)) * bpp);
        const b = new Uint8Array(a.length);
        for (let i = 0; i < a.length; i++) {
          a[i] = random() >>> 24;
          b[i] = n % 2 ? a[i] : random() >>> 24;
          if (n % 2 && random() % 31 === 0) b[i] = random() >>> 24;
        }
        let count = 0;
        for (let i = 0; i < a.length; i += bpp) {
          let diff = 0;
          for (let c = 0; c < bpp; c++) diff += Math.abs(a[i + c] - b[i + c]);
          if (diff > IMAGE_DIFF_THRESHOLD * bpp) count++;
        }
        for (const threshold of [0, 1, count, Math.max(0, count - 1)]) {
          expect(hasSimilarPixels(a, b, bpp, threshold)).toBe(
            count <= threshold,
          );
        }
      }
    }
  });

  it("keeps threshold boundaries and unaligned RGB and RGBA views", () => {
    for (const bpp of [3, 4]) {
      const a = new Uint8Array(3 * bpp + 2).subarray(1, -1);
      const b = new Uint8Array(3 * bpp + 4).subarray(2, -2);
      // At the per-pixel threshold does not count; one unit above it does.
      b[0] = IMAGE_DIFF_THRESHOLD * bpp;
      b[bpp] = IMAGE_DIFF_THRESHOLD * bpp + 1;
      b[2 * bpp + bpp - 1] = IMAGE_DIFF_THRESHOLD * bpp + 1;
      expect(hasSimilarPixels(a, b, bpp, 0)).toBe(false);
      expect(hasSimilarPixels(a, b, bpp, 1)).toBe(false);
      expect(hasSimilarPixels(a, b, bpp, 2)).toBe(true);
    }
  });

  it("preserves pool matching and exact matches for crop dependencies", async () => {
    const frame = (index: number, buffer: Buffer) => ({
      index,
      rect: { width: 20, height: 20 },
      format: "RGB24" as const,
      buffer,
    });
    const original = Buffer.alloc(20 * 20 * 3);
    const similar = Buffer.from(original);
    similar.fill(255, 0, 6);
    const different = Buffer.from(original);
    different.fill(255, 0, 9);
    const rect = Buffer.from([255, 255, 255]);
    const cropped = {
      ...frame(3, Buffer.alloc(0)),
      cropped: {
        baseIndex: 2,
        merged: rect,
        rects: [{ index: 0, x: 4, y: 0, width: 1, height: 1, buffer: rect }],
      },
    };
    const slide = frame(0, original);
    const animations = new Map([
      [
        0,
        [
          {
            x: 0,
            y: 0,
            w: 20,
            h: 20,
            fps: 10,
            format: "RGB24" as const,
            frames: [
              frame(0, original),
              frame(1, similar),
              frame(2, different),
              cropped,
            ],
          },
        ],
      ],
    ]);
    const cache = new EiaCompressionCache(lz4.compress);
    cache.compressRects(cropped.cropped.rects, rect);
    const [archive] = await compressEIAv1(
      [slide],
      undefined,
      1,
      10,
      animations,
      cache,
    );
    const [withoutHit] = await compressEIAv1(
      [slide],
      undefined,
      1,
      10,
      animations,
      new EiaCompressionCache(lz4.compress),
    );
    expect(archive).toEqual(withoutHit);
    // Some encoders return a view into a larger allocation. The archive must
    // contain only the frame bytes, including for cached cropped frames.
    const paddedEncoder = (bytes: Uint8Array) => {
      const encoded = lz4.compress(bytes);
      const backing = new Uint8Array(encoded.length + 12).fill(91);
      backing.set(encoded, 5);
      return backing.subarray(5, 5 + encoded.length);
    };
    const paddedCache = new EiaCompressionCache(paddedEncoder);
    paddedCache.compressRects(cropped.cropped.rects, rect);
    const [paddedArchive] = await compressEIAv1(
      [slide],
      undefined,
      1,
      10,
      animations,
      paddedCache,
    );
    expect(paddedArchive).toEqual(archive);
    const end = archive.indexOf("$");
    const manifest = JSON.parse(archive.subarray(4, end).toString());
    expect(manifest.ac.anims[0].seq).toEqual([0, 0, 1, 2]);
    expect(manifest.ac.pool[2].b).toBe(1);
    expect(manifest.ac.pool[2].u).toBe(rect.length);
  });
});
