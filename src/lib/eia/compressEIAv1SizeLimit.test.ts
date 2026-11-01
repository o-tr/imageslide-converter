import { Buffer } from "buffer";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/const/convert", () => ({
  FileSizeLimit: 2000,
  EIA_SIZE_LIMIT_ERROR: "EIA_SIZE_LIMIT_EXCEEDED",
}));

const { compressEIAv1 } = await import("./compressEIAv1");

const noise = (seed: number, length: number) => {
  const buffer = Buffer.alloc(length);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    buffer[i] = s & 255;
  }
  return buffer;
};
const slide = (index: number, size: number): RawImageObjV1 => ({
  index,
  rect: { width: size, height: size },
  format: "RGB24",
  buffer: noise(index + 1, size * size * 3),
});

describe("compressEIAv1 size limit", () => {
  it("returns the archive when it fits", async () => {
    const archive = await compressEIAv1([slide(0, 4)]);
    expect(archive.length).toBeLessThanOrEqual(2000);
  });

  it("rejects an archive larger than the limit instead of splitting it", async () => {
    await expect(
      compressEIAv1([slide(0, 24), slide(1, 24), slide(2, 24)]),
    ).rejects.toThrow("EIA_SIZE_LIMIT_EXCEEDED");
  });

  it("writes a base before the slides that reference it", async () => {
    const base = slide(0, 4);
    const child = {
      ...slide(1, 4),
      cropped: {
        baseIndex: 0,
        merged: base.buffer,
        rects: [
          {
            index: 0,
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            buffer: Buffer.from(base.buffer.subarray(0, 3)),
          },
        ],
      },
    };
    const archive = await compressEIAv1([child, base]);
    const manifest = JSON.parse(
      archive.subarray(4, archive.indexOf("$")).toString(),
    );
    expect(manifest.i.map((entry: { n: string }) => entry.n)).toEqual([
      "0",
      "1",
    ]);
  });
});
