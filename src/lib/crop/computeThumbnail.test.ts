import { describe, expect, it } from "vitest";
import { computeThumbnail } from "./computeThumbnail";

describe("thumbnail averaging", () => {
  it("averages each grid cell without mixing rows", () => {
    const data = Uint8Array.from([
      0, 3, 6, 2, 5, 8, 10, 13, 16, 12, 15, 18, 4, 7, 10, 6, 9, 12, 14, 17, 20,
      16, 19, 22,
    ]);
    expect(computeThumbnail(data, 4, 2, 2)).toEqual(
      Uint8Array.from([1, 4, 7, 11, 14, 17, 5, 8, 11, 15, 18, 21]),
    );
  });

  it("leaves empty cells black when the grid exceeds the image", () => {
    expect(computeThumbnail(Uint8Array.from([7, 8, 9]), 1, 1, 2)).toEqual(
      Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 8, 9]),
    );
  });
});
