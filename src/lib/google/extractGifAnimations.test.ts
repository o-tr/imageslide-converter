import { describe, expect, it } from "vitest";
import { computeGifCrop } from "./extractGifAnimations";

describe("computeGifCrop", () => {
  it("returns null when leftOffset + rightOffset >= 1", () => {
    expect(
      computeGifCrop(100, 100, { leftOffset: 0.6, rightOffset: 0.4 }),
    ).toBeNull();
  });

  it("returns null when topOffset + bottomOffset >= 1", () => {
    expect(
      computeGifCrop(100, 100, { topOffset: 0.5, bottomOffset: 0.5 }),
    ).toBeNull();
  });

  it("computes a centered crop for a typical case", () => {
    const crop = computeGifCrop(100, 80, {
      leftOffset: 0.1,
      rightOffset: 0.1,
      topOffset: 0.1,
      bottomOffset: 0.1,
    });
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.left).toBe(10);
    expect(crop.top).toBe(8);
    expect(crop.width).toBe(80);
    expect(crop.height).toBe(64);
  });

  it("clamps tiny remainders to at least 1px width/height (2x2 GIF)", () => {
    // Without clamping, Math.round(2 * 0.4) = 1 and
    // Math.round(2 * 0.2) = 0, which would yield zero width.
    const crop = computeGifCrop(2, 2, {
      leftOffset: 0.4,
      rightOffset: 0.4,
      topOffset: 0.4,
      bottomOffset: 0.4,
    });
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.width).toBeGreaterThanOrEqual(1);
    expect(crop.height).toBeGreaterThanOrEqual(1);
  });

  it("clamps width so left + width <= gifWidth when rounding overflows", () => {
    // 4 * 0.125 = 0.5 -> rounds to 1
    // 4 * 0.875 = 3.5 -> rounds to 4
    // 1 + 4 = 5 > 4, so clamping must reduce width to 3
    const crop = computeGifCrop(4, 10, { leftOffset: 0.125, rightOffset: 0 });
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.left).toBe(1);
    expect(crop.width).toBe(3);
    expect(crop.left + crop.width).toBeLessThanOrEqual(4);
  });

  it("clamps height so top + height <= gifHeight when rounding overflows", () => {
    const crop = computeGifCrop(10, 4, { topOffset: 0.125, bottomOffset: 0 });
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.top).toBe(1);
    expect(crop.height).toBe(3);
    expect(crop.top + crop.height).toBeLessThanOrEqual(4);
  });

  it("clamps cropLeft when rounding pushes it past the last pixel", () => {
    const crop = computeGifCrop(2, 10, { leftOffset: 0.99 });
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.left).toBe(1); // Math.round(1.98)=2 clamped to 1
    expect(crop.width).toBe(1);
  });

  it("clamps out-of-range offsets to [0, 1]", () => {
    expect(
      computeGifCrop(100, 100, { leftOffset: -0.5, rightOffset: 1.5 }),
    ).toBeNull();
  });

  it("returns null for NaN offsets", () => {
    expect(computeGifCrop(100, 100, { leftOffset: Number.NaN })).toBeNull();
  });

  it("handles a 1x1 GIF with zero offsets", () => {
    const crop = computeGifCrop(1, 1, {});
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.left).toBe(0);
    expect(crop.top).toBe(0);
    expect(crop.width).toBe(1);
    expect(crop.height).toBe(1);
  });

  it("handles a 1x1 GIF with small offsets by clamping to 1px", () => {
    const crop = computeGifCrop(1, 1, {
      leftOffset: 0.1,
      rightOffset: 0.1,
      topOffset: 0.1,
      bottomOffset: 0.1,
    });
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.width).toBe(1);
    expect(crop.height).toBe(1);
    expect(crop.left).toBeLessThanOrEqual(0);
    expect(crop.top).toBeLessThanOrEqual(0);
  });

  it("returns finite values for all outputs", () => {
    const crop = computeGifCrop(100, 100, {
      leftOffset: 0.25,
      rightOffset: 0.25,
      topOffset: 0.25,
      bottomOffset: 0.25,
    });
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(Number.isFinite(crop.left)).toBe(true);
    expect(Number.isFinite(crop.top)).toBe(true);
    expect(Number.isFinite(crop.width)).toBe(true);
    expect(Number.isFinite(crop.height)).toBe(true);
  });

  it("treats omitted offsets as 0", () => {
    const crop = computeGifCrop(100, 100, { leftOffset: 0.2 });
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.left).toBe(20);
    expect(crop.width).toBe(80);
    expect(crop.top).toBe(0);
    expect(crop.height).toBe(100);
  });
});
