import type { SelectedFile } from "@/_types/file-picker";
import type { TTextureConverterFormat } from "@/_types/text-zip/formats";
import type { EIASignageManifest } from "./eia/v1";

export type WorkerMessage =
  | {
      type: "compress";
      data: {
        files: (Omit<SelectedFile, "canvas"> & { bitmap: ImageBitmap })[];
        format: TTextureConverterFormat;
        version: number;
        scale: number;
      };
    }
  | {
      type: "compress-signage";
      data: {
        files: (Omit<SelectedFile, "canvas"> & { bitmap: ImageBitmap })[];
        format: TTextureConverterFormat;
        version: number;
        scale: number;
        signage: EIASignageManifest;
      };
    };

export type WorkerResponse =
  | {
      type: "compress";
      data: string[] | Buffer[];
    }
  | {
      type: "compress-signage";
      data: string[] | Buffer[];
    };
