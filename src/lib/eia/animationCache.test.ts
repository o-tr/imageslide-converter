import { Buffer } from "buffer";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { describe, expect, it } from "vitest";
import {
  createAnimationCacheKey,
  findCachedAnimation,
  sameAnimationFrames,
} from "./animationCache";

describe("animation crop cache", () => {
  it("hashes complete frames consistently across unaligned buffer views", () => {
    for (let length = 0; length < 70; length++) {
      const backing = Buffer.alloc(length + 5);
      for (let i = 0; i < backing.length; i++) backing[i] = (i * 29) & 255;
      const data = backing.subarray(2, length + 2);
      const frame: RawImageObjV1 = {
        index: 0,
        rect: { width: length, height: 1 },
        format: "RGB24",
        buffer: data,
      };
      const key = createAnimationCacheKey([frame]);
      expect(
        createAnimationCacheKey([{ ...frame, buffer: Buffer.from(data) }]),
      ).toBe(key);
      for (let i = 0; i < data.length; i++) {
        const modified = Buffer.from(data);
        modified[i] ^= 1;
        expect(
          createAnimationCacheKey([{ ...frame, buffer: modified }]),
        ).not.toBe(key);
      }
    }
  });

  it("mixes both word lanes and still verifies a collision bucket", () => {
    const input = Buffer.alloc(16);
    const other = Buffer.alloc(16);
    // Construct a collision in the first lane by cancelling the effect of
    // the first changed word in the next word assigned to the same lane.
    let initial = 0x811c9dc5;
    for (const byte of new TextEncoder().encode("1|1x1:RGB24:16|")) {
      initial = Math.imul(initial ^ byte, 0x01000193) >>> 0;
    }
    const originalFirst = Math.imul(initial, 0x01000193) >>> 0;
    const changedFirst = Math.imul(initial ^ 1, 0x01000193) >>> 0;
    other.writeUInt32LE(1, 0);
    other.writeUInt32LE((originalFirst ^ changedFirst) >>> 0, 8);
    const frame: RawImageObjV1 = {
      index: 0,
      rect: { width: 1, height: 1 },
      format: "RGB24",
      buffer: input,
    };
    const collision = { ...frame, buffer: other };
    expect(createAnimationCacheKey([frame])).not.toBe(
      createAnimationCacheKey([collision]),
    );
    expect(findCachedAnimation([frame], [[collision]])).toBeUndefined();
    const gray = (value: number) => [
      { ...frame, buffer: Buffer.alloc(16, value) },
    ];
    expect(
      new Set(
        Array.from({ length: 256 }, (_, value) =>
          createAnimationCacheKey(gray(value)),
        ),
      ).size,
    ).toBe(256);
  });

  it("requires matching dimensions, format, frame count and all pixel bytes", () => {
    const a: RawImageObjV1 = {
      index: 0,
      rect: { width: 1, height: 2 },
      format: "RGB24",
      buffer: Buffer.from([1, 2, 3, 4, 5, 6]),
    };
    expect(
      sameAnimationFrames([a], [{ ...a, buffer: Buffer.from(a.buffer) }]),
    ).toBe(true);
    expect(sameAnimationFrames([a], [])).toBe(false);
    expect(
      sameAnimationFrames([a], [{ ...a, rect: { width: 2, height: 1 } }]),
    ).toBe(false);
    expect(sameAnimationFrames([a], [{ ...a, format: "RGBA32" }])).toBe(false);
    expect(
      sameAnimationFrames(
        [a],
        [{ ...a, buffer: Buffer.from([1, 2, 3, 4, 5, 7]) }],
      ),
    ).toBe(false);
    const collision = [{ ...a, buffer: Buffer.from([1, 2, 3, 4, 5, 7]) }];
    const matching = [{ ...a, buffer: Buffer.from(a.buffer) }];
    expect(findCachedAnimation([a], [collision, matching])).toBe(matching);
    expect(findCachedAnimation([a], [collision])).toBeUndefined();
  });
});
