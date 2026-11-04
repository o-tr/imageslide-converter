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
  fpsOverride?: number;
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
        resolution: Resolution;
      };
    }
  | {
      type: "compress-signage";
      data: {
        files: WorkerFile[];
        format: TTextureConverterFormat;
        resolution: Resolution;
        signage: EIASignageManifest;
      };
    };

export type WorkerResponse =
  | {
      type: "compress-progress";
      phase: "prepare" | "plan" | "crop" | "compress";
      completed: number;
      total: number;
    }
  | {
      type: "compress-graph";
      parents: (number | null)[];
      stage: "planned" | "final";
      resolved?: boolean[];
      rawBytes?: number;
      payloadBytes?: number;
    }
  | {
      type: "compress-graph-item";
      index: number;
      parent: number | null;
    }
  | {
      type: "compress";
      data: Buffer;
    }
  | {
      type: "compress-error";
      error: string;
    }
  | {
      type: "compress-signage";
      data: Buffer;
    }
  | {
      type: "compress-signage-error";
      error: string;
    };
