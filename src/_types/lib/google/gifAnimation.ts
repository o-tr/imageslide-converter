import type { SlidePageElement } from "@/_types/google-slides-api";
import type { PixelRect } from "@/_types/lib/google/slideGeometry";
import type { ParsedFrame } from "gifuct-js";

export type AnimatedGifCandidate = {
  element: SlidePageElement;
  pixelRect: PixelRect;
  rawFrames: ParsedFrame[];
  gifWidth: number;
  gifHeight: number;
};
