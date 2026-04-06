import type { EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import type { TTextureConverterFormat } from "@/_types/text-zip/formats";
import type { WorkerMessage, WorkerResponse } from "@/_types/worker";
import type { Resolution } from "@/const/resolutions";

const worker = (
  typeof window !== "undefined"
    ? new Worker(new URL("../../worker/compressSignage.ts", import.meta.url))
    : undefined
) as Worker;

export const postCompressSignage = (
  files: SelectedFile[],
  signage: EIASignageManifest,
  format: TTextureConverterFormat,
  version: number,
  scale: number,
  resolution: Resolution,
): Promise<string[] | Buffer[]> => {
  console.log("postCompressSignage");
  const message: WorkerMessage = {
    type: "compress-signage",
    data: {
      format,
      version,
      signage,
      scale,
      resolution,
      // Signage path does not support GIF animations; they are intentionally excluded.
      files: files.map((file) => {
        const bitmap = file.canvas.transferToImageBitmap();
        const { canvas: _canvas, animations: _animations, ...fileRest } = file;
        return { ...fileRest, bitmap };
      }),
    },
  };
  console.log("postCompressSignage", message);
  return new Promise<string[] | Buffer[]>((resolve) => {
    const handler = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type !== "compress-signage") return;
      worker.removeEventListener("message", handler);
      console.log("postCompressSignage response", event.data);
      resolve(event.data.data);
    };
    worker.addEventListener("message", handler);
    worker.postMessage(
      message,
      message.data.files.map((file) => file.bitmap),
    );
  });
};
