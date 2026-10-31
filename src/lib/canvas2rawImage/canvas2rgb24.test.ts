import { describe, expect, it } from "vitest";
import { canvas2rgb24 } from "./canvas2rgb24";
import { canvas2rgba32 } from "./canvas2rgba32";

function makeCanvas(width: number, height: number, data: Uint8ClampedArray) {
  const context = {
    canvas: { width, height },
    getImageData: () => ({ data }),
  };
  return { getContext: () => context } as unknown as OffscreenCanvas;
}

describe("canvas RGB24 conversion", () => {
  it("retains the old bottom-up pixel order and removes alpha", () => {
    let state = 123;
    for (let width = 1; width <= 17; width++) {
      for (let height = 1; height <= 13; height++) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i++) {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          data[i] = state >>> 24;
        }
        const canvas = makeCanvas(width, height, data);
        const previous = canvas2rgba32(canvas).filter((_, i) => i % 4 !== 3);
        expect(canvas2rgb24(canvas)).toEqual(previous);
      }
    }
  });

  it("reports missing canvas contexts", () => {
    const canvas = { getContext: () => null } as unknown as OffscreenCanvas;
    expect(() => canvas2rgb24(canvas)).toThrow("Canvas not found");
  });
});
