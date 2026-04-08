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
  return new Promise<string[] | Buffer[]>((resolve, reject) => {
    const handler = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === "compress-signage") {
        cleanup();
        console.log("postCompressSignage response", event.data);
        resolve(event.data.data);
        return;
      }
      if (event.data.type === "compress-signage-error") {
        cleanup();
        reject(new Error(event.data.error));
      }
    };
    const errorHandler = (event: ErrorEvent) => {
      cleanup();
      reject(
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "Signage compression worker failed"),
      );
    };
    const messageErrorHandler = () => {
      cleanup();
      reject(new Error("Signage compression worker message error"));
    };
    const cleanup = () => {
      worker.removeEventListener("message", handler);
      worker.removeEventListener("error", errorHandler);
      worker.removeEventListener("messageerror", messageErrorHandler);
    };
    worker.addEventListener("message", handler);
    worker.addEventListener("error", errorHandler);
    worker.addEventListener("messageerror", messageErrorHandler);
    try {
      worker.postMessage(
        message,
        message.data.files.map((file) => file.bitmap),
      );
    } catch (e) {
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
};
