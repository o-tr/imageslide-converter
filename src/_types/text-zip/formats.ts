import type { SelectedFile } from "@/_types/file-picker";

export const ContainerFormat = ["text-zip-v0", "text-zip-v1", "eia-v1"];

export const TextureFormat = [
  "RGBA32",
  "RGB24",
  "DXT1",
  "RGB24-cropped",
  "RGB24-cropped-base64",
] as const;

export type TTextureFormat = (typeof TextureFormat)[number];
export type TContainerFormat = (typeof ContainerFormat)[number];

export const TextureConverterFormat = [
  "text-zip-v0-RGBA32",
  "text-zip-v1-RGB24",
  "text-zip-v1-RGBA32",
  "text-zip-v1-DXT1",
  "text-zip-v1-RGB24-cropped",
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
  converter: (selectedFiles: SelectedFile[]) => Promise<string[]|Buffer[]>;
};
