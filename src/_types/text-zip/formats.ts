import type { SelectedFile } from "@/_types/file-picker";
import type { EIASignageManifest } from "../eia/v1";

export const ContainerFormat = ["eia-v1"];

export const TextureFormat = [
  "RGBA32",
  "RGB24",
  "RGB24-cropped",
  "RGB24-cropped-base64",
] as const;

export type TTextureFormat = (typeof TextureFormat)[number];
export type TContainerFormat = (typeof ContainerFormat)[number];

export const TextureConverterFormat = [
  "eia-v1-RGB24-cropped",
  "eia-v1-RGB24-cropped-base64",
] as const satisfies `${TContainerFormat}-${TTextureFormat}`[];

export type TTextureConverterFormat = (typeof TextureConverterFormat)[number];

export type FormatItemType = {
  id: TTextureConverterFormat;
  label: string;
  description?: string;
  bytePerPixel: number;
  priority: number;
  container: TContainerFormat;
  format: TTextureFormat;
  estimatedCompressionRatio?: number;
} & (
  | {
      signageSupport: true;
      converter: (
        selectedFiles: SelectedFile[],
        signage?: EIASignageManifest,
        onProgress?: (completed: number, total: number) => void,
      ) => Promise<Buffer>;
    }
  | {
      signageSupport?: false;
      converter: (
        selectedFiles: SelectedFile[],
        signage?: undefined,
        onProgress?: (completed: number, total: number) => void,
      ) => Promise<Buffer>;
    }
);
