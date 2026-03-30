import type { SelectedFile } from "@/_types/file-picker";
import type { TTextureConverterFormat } from "@/_types/text-zip/formats";
import type { Resolution } from "@/const/resolutions";
import type { EIASignageManifest } from "./eia/v1";

export type WorkerAnimationBitmap = {
  x: number;
  y: number;
  w: number;
  h: number;
  fps: number;
  frames: ImageBitmap[];
};

type WorkerFile = Omit<SelectedFile, "canvas" | "animations"> & {
  bitmap: ImageBitmap;
  animations?: WorkerAnimationBitmap[];
};

export type WorkerMessage =
  | {
      type: "compress";
      data: {
        files: WorkerFile[];
        format: TTextureConverterFormat;
        version: number;
        scale: number;
        resolution: Resolution;
      };
    }
  | {
      type: "compress-signage";
      data: {
        files: WorkerFile[];
        format: TTextureConverterFormat;
        version: number;
        scale: number;
        resolution: Resolution;
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
