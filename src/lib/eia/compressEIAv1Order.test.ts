import { Buffer } from "buffer";
import type { RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { expect, it } from "vitest";
import { compressEIAv1 } from "./compressEIAv1";
import { compressEIAv1Base64 } from "./compressEIAv1Base64";

const makeSlides = (): RawImageObjV1Cropped[] => {
  const pixels = Buffer.alloc(32 * 32 * 3, 20);
  const changed = Buffer.from(pixels);
  const pixel = Buffer.from([100, 110, 120]);
  pixel.copy(changed, 0);
  // Slide 0 is cropped against slide 2 (a later master); input is unordered.
  return [
    {
      index: 2,
      rect: { width: 32, height: 32 },
      format: "RGB24",
      buffer: pixels,
    },
    {
      index: 0,
      rect: { width: 32, height: 32 },
      format: "RGB24",
      buffer: changed,
      cropped: {
        baseIndex: 2,
        merged: changed,
        rects: [{ index: 0, x: 0, y: 0, width: 1, height: 1, buffer: pixel }],
      },
    },
    {
      index: 1,
      rect: { width: 32, height: 32 },
      format: "RGB24",
      buffer: pixels,
    },
  ];
};

it("orders the manifest by slide number even when bases come later", async () => {
  const archive = await compressEIAv1(makeSlides());
  const end = archive.indexOf("$");
  const manifest = JSON.parse(archive.subarray(4, end).toString("utf8"));
  expect(manifest.i.map((f: { n: string }) => f.n)).toEqual(["0", "1", "2"]);
  expect(manifest.i[0].b).toBe("2");
});

it("orders the base64 manifest by slide number", async () => {
  const archive = await compressEIAv1Base64(makeSlides());
  const text = archive.toString("utf8");
  const manifest = JSON.parse(text.slice(4, text.indexOf("$")));
  expect(manifest.i.map((f: { n: string }) => f.n)).toEqual(["0", "1", "2"]);
});
