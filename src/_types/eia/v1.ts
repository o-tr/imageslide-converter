import type { TTextureFormat } from "@/_types/text-zip/formats";

export const EIAExtensions = ["note"];

export type EIAExtension = (typeof EIAExtensions)[number];

export type EIAExtensionObject = {
  note?: string;
} & { [key in EIAExtension]?: string };

export type EIACompressionMethod = "lz4" | "lz4-base64";

export type EIAManifestV1 = {
  t: "eia"; //type
  c: EIACompressionMethod; //compressor
  v: 1; //version
  f: string[]; //features
  e: EIAExtension[]; //extensions
  i: EIAFileV1[]; //items
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
