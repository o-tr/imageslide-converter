import { Buffer } from "buffer";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { describe, expect, it } from "vitest";
import {
  createAnimationCacheKey,
  findCachedAnimation,
  sameAnimationFrames,
} from "./animationCache";

function previousKey(frames: RawImageObjV1[]) {
  const encoder = new TextEncoder();
  let a = 0x811c9dc5;
  let b = (a ^ 0x9e3779b9) >>> 0;
  const update = (seed: number, bytes: Uint8Array) => {
    let hash = seed;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    return hash;
  };
  const both = (bytes: Uint8Array) => {
    a = update(a, bytes);
    b = update(b, bytes);
  };
  both(encoder.encode(`${frames.length}|`));
  for (const frame of frames) {
    both(
      encoder.encode(
        `${frame.rect.width}x${frame.rect.height}:${frame.format}:${frame.buffer.length}|`,
      ),
    );
    both(frame.buffer);
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

describe("animation crop cache", () => {
  it("preserves the previous dual hash across varied frames", () => {
    let state = 123;
    for (let n = 0; n < 100; n++) {
      const frames: RawImageObjV1[] = [];
      for (let i = 0; i < n % 5; i++) {
        const bytes = Buffer.alloc(3 * (n + 1) * (i + 1));
        for (let j = 0; j < bytes.length; j++) {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          bytes[j] = state >>> 24;
        }
        frames.push({
          index: i,
          rect: { width: n + 1, height: i + 1 },
          format: "RGB24",
          buffer: bytes,
        });
      }
      expect(createAnimationCacheKey(frames)).toBe(previousKey(frames));
    }
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
