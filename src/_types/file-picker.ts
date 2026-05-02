import type { PixelRect } from "@/_types/lib/google/slideGeometry";

export type SelectedFileAnimation = {
  x: number;
  y: number;
  w: number;
  h: number;
  fps: number;
  fpsOverride?: number;
  frames: OffscreenCanvas[];
};

export type SkippedAnimation = PixelRect;

export type SelectedFile = {
  id: string;
  fileName: string;
  note?: string;
  canvas: OffscreenCanvas;
  metadata: SelectedFileMetadata;
  animations?: SelectedFileAnimation[];
  skippedAnimations?: SkippedAnimation[];
};

export type SelectedFileMetadataImage = {
  fileType: "image";
};

export type SelectedFileMetadataPdf = {
  file: File;
  fileType: "pdf";
  index: number;
  scale: number;
};

export type SelectedFileMetadata =
  | SelectedFileMetadataImage
  | SelectedFileMetadataPdf;
