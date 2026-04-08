export type SelectedFileAnimation = {
  x: number;
  y: number;
  w: number;
  h: number;
  fps: number;
  frames: OffscreenCanvas[];
};

export type SelectedFile = {
  id: string;
  fileName: string;
  note?: string;
  canvas: OffscreenCanvas;
  metadata: SelectedFileMetadata;
  animations?: SelectedFileAnimation[];
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
