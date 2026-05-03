import type { TTextureFormat } from "@/_types/text-zip/formats";

export const EIAExtensions = ["note", "a"] as const;

export type EIAExtension = (typeof EIAExtensions)[number];

export type EIAExtensionObject = {
  note?: string;
  a?: EIAAnimationRef[];
};

export type EIAAnimationContainer = {
  pool: EIAAnimFramePoolItem[];
  anims: EIAAnimation[];
};

export type EIAAnimFramePoolItem =
  | EIAAnimFramePoolItemMaster
  | EIAAnimFramePoolItemCropped;

export type EIAAnimFramePoolItemMaster = {
  t: "m";
  f: TTextureFormat;
  w: number;
  h: number;
  s: number;
  l: number;
  u: number;
};

export type EIAAnimFramePoolItemCropped = {
  t: "c";
  f: TTextureFormat;
  w: number;
  h: number;
  b: number;
  s: number;
  l: number;
  u: number;
  r: EIAFileV1CroppedPart[];
};

export type EIAAnimation = {
  id: string;
  fps: number;
  seq: number[];
};

export type EIAAnimationRef = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * "lz4" is the standard compression method defined by the EIA v1 spec.
 * "lz4-base64" is a non-standard extension where each block is LZ4-compressed
 * then Base64-encoded, primarily used for text-based transport or embedding.
 */
export type EIACompressionMethod = "lz4" | "lz4-base64";

export type EIAManifestV1 = {
  t: "eia";
  c: EIACompressionMethod;
  v: 1;
  f: string[];
  e: EIAExtension[];
  i: EIAFileV1[];
  m?: EIASignageManifest;
  ac?: EIAAnimationContainer;
};

export type EIASignageManifest = {
  [deviceId: string]: EIASignageItem[];
};

export type EIASignageItem = {
  f: string;
  t: string;
  d: number;
};

export type EIAFileV1 = EIAFileV1Master | EIAFileV1Cropped;

type EIAFileV1Base = {
  n: string;
  f: TTextureFormat;
  w: number;
  h: number;
  s: number;
  l: number;
  u: number;
  e?: EIAExtensionObject;
};

export type EIAFileV1Master = EIAFileV1Base & {
  t: "m";
};

export type EIAFileV1Cropped = EIAFileV1Base & {
  t: "c";
  b: string;
  r: EIAFileV1CroppedPart[];
};

export type EIAFileV1CroppedPart = {
  x: number;
  y: number;
  w: number;
  h: number;
  s: number;
  l: number;
};
