import type { TTextureFormat } from "@/_types/text-zip/formats";
import type { RawImageObjV1Cropped } from "@/_types/text-zip/v1";

export type RawAnimationData = {
  x: number;
  y: number;
  w: number;
  h: number;
  fps: number;
  format: TTextureFormat;
  frames: RawImageObjV1Cropped[];
};
