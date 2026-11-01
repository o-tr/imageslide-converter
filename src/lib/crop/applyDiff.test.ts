import { Buffer } from "buffer";
import type {
  RawImageObjV1,
  RawImageObjV1Cropped,
  RawImageObjV1CroppedPart,
} from "@/_types/text-zip/v1";
import { expect, it } from "vitest";
import { applyDiff } from "./applyDiff";

function reference(
  source: RawImageObjV1Cropped,
  output: RawImageObjV1,
  rects: RawImageObjV1CroppedPart[],
) {
  const result = Buffer.alloc(output.buffer.length);
  const input = source.cropped?.merged ?? source.buffer;
  for (let y = 0; y < source.rect.height; y++) {
    const start = y * source.rect.width * 3;
    input.copy(
      result,
      y * output.rect.width * 3,
      start,
      start + source.rect.width * 3,
    );
  }
  for (const rect of rects) {
    for (let y = 0; y < rect.height; y++) {
      const start = y * rect.width * 3;
      rect.buffer.copy(
        result,
        ((rect.y + y) * output.rect.width + rect.x) * 3,
        start,
        start + rect.width * 3,
      );
    }
  }
  return result;
}

it("preserves diff application for equal and different image dimensions", () => {
  for (let n = 0; n < 160; n++) {
    const width = 1 + (n % 13);
    const height = 1 + ((n * 3) % 11);
    const sourceWidth = n % 3 ? width : 1 + ((n * 7) % 13);
    const sourceHeight = n % 3 ? height : 1 + ((n * 5) % 11);
    const sourceBuffer = Buffer.alloc(
      sourceWidth * sourceHeight * 3 + (n % 7 === 0 ? 3 : 0),
    );
    for (let i = 0; i < sourceBuffer.length; i++)
      sourceBuffer[i] = (i * 17 + n) & 255;
    const source = {
      index: 0,
      rect: { width: sourceWidth, height: sourceHeight },
      format: "RGB24" as const,
      buffer: sourceBuffer,
    };
    const output = {
      index: 1,
      rect: { width, height },
      format: "RGB24" as const,
      buffer: Buffer.alloc(width * height * 3 + (n % 7 === 0 ? 3 : 0)),
    };
    const rects = [
      {
        index: 0,
        x: width - 1,
        y: height - 1,
        width: 1,
        height: 1,
        buffer: Buffer.from([n, 1, 2]),
      },
    ];
    expect(applyDiff(source, output, rects)).toEqual(
      reference(source, output, rects),
    );
  }
});

it("copies the resolved parent when it has its own crop", () => {
  const input = Buffer.alloc(4 * 3 * 3, 1);
  const resolved = Buffer.alloc(input.length, 8);
  const source = {
    index: 0,
    rect: { width: 4, height: 3 },
    format: "RGB24" as const,
    buffer: input,
    cropped: { baseIndex: 2, rects: [], merged: resolved },
  };
  const output = { ...source, index: 1 };
  const result = applyDiff(source, output, []);
  expect(result).toEqual(resolved);
  expect(result).not.toBe(resolved);
});

it("keeps the row-wise error for a truncated full-width rectangle", () => {
  const image = {
    index: 0,
    rect: { width: 2, height: 3 },
    format: "RGB24" as const,
    buffer: Buffer.alloc(18),
  };
  const rects = [
    { index: 0, x: 0, y: 0, width: 2, height: 2, buffer: Buffer.alloc(1) },
  ];
  expect(() => reference(image, image, rects)).toThrow(RangeError);
  expect(() => applyDiff(image, image, rects)).toThrow(RangeError);
});
