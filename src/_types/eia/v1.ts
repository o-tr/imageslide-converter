import type { TTextureFormat } from "@/_types/text-zip/formats";

export const EIAExtensions = ["note", "a"];

export type EIAExtension = (typeof EIAExtensions)[number];

export type EIAExtensionObject = {
  note?: string;
  a?: string; // JSON string of EIAAnimationMeta[]
} & { [key in EIAExtension]?: string };

export type EIAAnimationMeta = {
  x: number; // pixel X on base image
  y: number; // pixel Y on base image
  w: number; // pixel width
  h: number; // pixel height
  fps: number; // frame rate
  f: TTextureFormat; // frame format
  frames: EIAAnimationFrameRef[];
};

export type EIAAnimationFrameRef =
  | EIAAnimationFrameRefMaster
  | EIAAnimationFrameRefCropped;

export type EIAAnimationFrameRefMaster = {
  t: "m"; // master (full frame)
  s: number; // start offset in data section
  l: number; // compressed length
  u: number; // uncompressed size
};

export type EIAAnimationFrameRefCropped = {
  t: "c"; // cropped (diff frame)
  b: number; // base frame index within this animation's frames array
  s: number; // start offset in data section
  l: number; // compressed length
  u: number; // uncompressed size
  r: EIAFileV1CroppedPart[]; // changed rects
};

export type EIACompressionMethod = "lz4" | "lz4-base64";

export type EIAManifestV1 = {
  t: "eia"; //type
  c: EIACompressionMethod; //compressor
  v: 1; //version
  f: string[]; //features
  e: EIAExtension[]; //extensions
  i: EIAFileV1[]; //items
  m?: EIASignageManifest;
};

export type EIASignageManifest = {
  [deviceId: string]: EIASignageItem[];
};

export type EIASignageItem = {
  f: string; // file name
  t: string; // transition
  d: number; // duration
};

export type EIAFileV1 = EIAFileV1Master | EIAFileV1Cropped;

type EIAFileV1Base = {
  n: string; //name
  f: TTextureFormat; //format
  w: number; //width
  h: number; //height
  s: number; //start
  l: number; //length
  u: number; //uncompressed size
  e?: EIAExtensionObject; //extensions
};

export type EIAFileV1Master = EIAFileV1Base & {
  t: "m"; //type: master
};

export type EIAFileV1Cropped = EIAFileV1Base & {
  t: "c"; //type: cropped
  b: string; // base file name
  r: EIAFileV1CroppedPart[]; //rects
};

export type EIAFileV1CroppedPart = {
  x: number;
  y: number;
  w: number; //width
  h: number; //height
  s: number; //start (in file)
  l: number; //length
};
