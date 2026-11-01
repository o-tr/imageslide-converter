import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";
import { nearLossless } from "./nearLossless";

describe("nearLossless", () => {
  const noisy = (width: number, height: number) => {
    const buffer = Buffer.alloc(width * height * 3);
    let s = 7;
    for (let i = 0; i < buffer.length; i++) {
      s = (s * 1103515245 + 12345) >>> 0;
      buffer[i] = 100 + ((s >>> 16) % 7);
    }
    return buffer;
  };

  it("returns the input unchanged for tolerance 0", () => {
    const input = noisy(8, 8);
    expect(nearLossless(input, 8, 8, 0)).toBe(input);
  });

  it("never moves a channel by more than the tolerance", () => {
    const input = noisy(32, 16);
    for (const tolerance of [1, 2, 5]) {
      const output = nearLossless(input, 32, 16, tolerance);
      for (let i = 0; i < input.length; i++)
        expect(Math.abs(output[i] - input[i])).toBeLessThanOrEqual(tolerance);
    }
  });

  it("creates runs from low-amplitude noise and keeps large steps", () => {
    const input = noisy(32, 16);
    const output = nearLossless(input, 32, 16, 6);
    const distinct = (b: Buffer) =>
      new Set(b.toString("hex").match(/.{6}/g)).size;
    expect(distinct(output)).toBeLessThan(distinct(input));
    const edge = Buffer.from([0, 0, 0, 200, 200, 200]);
    expect(nearLossless(edge, 2, 1, 5)).toEqual(edge);
  });

  it("does not modify its input", () => {
    const input = noisy(8, 8);
    const copy = Buffer.from(input);
    nearLossless(input, 8, 8, 3);
    expect(input).toEqual(copy);
  });
});
