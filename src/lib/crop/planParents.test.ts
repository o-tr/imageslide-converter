import { Buffer } from "buffer";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { compressEIAv1 } from "@/lib/eia/compressEIAv1";
import { EiaCompressionCache } from "@/lib/eia/compressionCache";
import { decodeEIAv1 } from "@/lib/slidePreview/decodeEIAv1";
import lz4 from "lz4js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cropImages } from "./cropImages";
import { planParents } from "./planParents";

const W = 64;
const H = 64;
const estimateSize = (payload: Uint8Array) => lz4.compress(payload).length;

const noise = (seed: number) => {
  const buffer = Buffer.alloc(W * H * 3);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < buffer.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    buffer[i] = s & 255;
  }
  return buffer;
};
const withBlock = (base: Buffer, x0: number, y0: number, seed: number) => {
  const out = Buffer.from(base);
  const patch = noise(seed);
  for (let y = y0; y < y0 + 12; y++)
    for (let x = x0; x < x0 + 12; x++)
      for (let c = 0; c < 3; c++)
        out[(y * W + x) * 3 + c] =
          (base[(y * W + x) * 3 + c] +
            100 +
            (patch[(y * W + x) * 3 + c] % 50)) &
          255;
  return out;
};
const image = (index: number, buffer: Buffer): RawImageObjV1 => ({
  index,
  rect: { width: W, height: H },
  format: "RGB24",
  buffer,
});

// Two unrelated sections; the second slide of each builds on the first, and
// slide 4 repeats slide 0 (a revisit outside any sliding window).
const deck = () => {
  const a0 = Buffer.alloc(W * H * 3, 240);
  const a1 = withBlock(a0, 4, 4, 11);
  const a2 = withBlock(a1, 30, 30, 12);
  const b0 = noise(99);
  const b1 = withBlock(b0, 40, 8, 13);
  return [a0, a1, a2, b0, b1, Buffer.from(a0)].map((b, i) => image(i, b));
};

afterEach(() => vi.unstubAllGlobals());

describe("planParents", () => {
  it("builds a depth-limited forest with parents before children", () => {
    const images = deck();
    const plan = planParents(images, {
      estimateSize,
      maxDepth: 2,
      depthPenalty: 0,
    });
    expect([...plan.order].sort()).toEqual(images.map((_, i) => i));
    const seen = new Set<number>();
    for (const pos of plan.order) {
      const parent = plan.parents[pos];
      if (parent !== null) expect(seen.has(parent)).toBe(true);
      seen.add(pos);
    }
    expect(Math.max(...plan.depths)).toBeLessThanOrEqual(2);
    expect(
      plan.parents.filter((p) => p === null).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("lets several children share one parent and revisit distant slides", () => {
    const plan = planParents(deck(), {
      estimateSize,
      maxDepth: 6,
      depthPenalty: 0,
    });
    // The repeated slide must hang off an identical earlier slide.
    const repeat = plan.parents[5];
    expect([0, 1, 2]).toContain(repeat);
    const counts = new Map<number | null, number>();
    for (const p of plan.parents) counts.set(p, (counts.get(p) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(2);
  });

  it("round-trips through the EIA encoder and decoder", async () => {
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
    const images = deck();
    const cache = new EiaCompressionCache(lz4.compress);
    const parentPlan = planParents(images, {
      estimateSize,
      maxDepth: 3,
      depthPenalty: 0,
    });
    const cropped = cropImages(images, {
      optimizeEia: true,
      compressionCache: cache,
      parentPlan,
    });
    expect(cropped.map((c) => c.index)).toEqual(images.map((i) => i.index));
    const [archive] = await compressEIAv1(cropped, undefined, undefined, cache);
    const frames = decodeEIAv1(Uint8Array.from(archive).buffer).frames;
    expect(frames).toHaveLength(images.length);
    frames.forEach((frame, i) => {
      const source = images[i].buffer;
      // The decoder emits rows bottom-up, as Unity textures expect.
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          for (let c = 0; c < 3; c++)
            expect(frame.imageData.data[(y * W + x) * 4 + c]).toBe(
              source[((H - 1 - y) * W + x) * 3 + c],
            );
    });
  });

  it("rejects a plan that does not cover every image", () => {
    const images = deck();
    expect(() =>
      cropImages(images, {
        parentPlan: {
          order: [0],
          parents: [null],
          depths: [0],
          estimatedCost: 0,
        },
      }),
    ).toThrow(/cover/);
  });
});
