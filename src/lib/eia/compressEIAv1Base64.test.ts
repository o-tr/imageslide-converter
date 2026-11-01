import { Buffer } from "buffer";
import type { RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import lz4 from "lz4js";
import { expect, it } from "vitest";
import { compressEIAv1Base64 } from "./compressEIAv1Base64";

it("writes standard LZ4 frames for master and delta payloads in base64 EIA", async () => {
  const pixels = Buffer.alloc(32 * 32 * 3, 20);
  const changed = Buffer.from(pixels);
  const pixel = Buffer.from([100, 110, 120]);
  pixel.copy(changed, 0);
  const slides: RawImageObjV1Cropped[] = [
    {
      index: 0,
      rect: { width: 32, height: 32 },
      format: "RGB24",
      buffer: pixels,
    },
    {
      index: 1,
      rect: { width: 32, height: 32 },
      format: "RGB24",
      buffer: changed,
      cropped: {
        baseIndex: 0,
        merged: changed,
        rects: [{ index: 0, x: 0, y: 0, width: 1, height: 1, buffer: pixel }],
      },
    },
  ];
  const archive = await compressEIAv1Base64(slides);
  const text = archive.toString("utf8");
  const end = text.indexOf("$");
  const manifest = JSON.parse(text.slice(4, end));
  expect(manifest.c).toBe("lz4-base64");
  const section = text.slice(end + 1);
  for (const [index, expected] of [pixels, pixel].entries()) {
    const item = manifest.i[index];
    const encoded = Buffer.from(
      section.slice(item.s, item.s + item.l),
      "base64",
    );
    expect(Buffer.from(lz4.decompress(encoded, expected.length))).toEqual(
      expected,
    );
  }
});
