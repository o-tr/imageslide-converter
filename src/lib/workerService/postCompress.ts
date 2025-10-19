import type { SelectedFile } from "@/_types/file-picker";
import type { TTextureConverterFormat } from "@/_types/text-zip/formats";
import type { WorkerMessage, WorkerResponse } from "@/_types/worker";
import type { Resolution } from "@/const/resolutions";

const worker = (
  typeof window !== "undefined"
    ? new Worker(new URL("../../worker/compress.ts", import.meta.url))
    : undefined
) as Worker;

export const postCompress = (
  files: SelectedFile[],
  format: TTextureConverterFormat,
  version: number,
  scale: number,
  resolution: Resolution,
): Promise<string[] | Buffer[]> => {
  console.log("postCompress");
  const message: WorkerMessage = {
    type: "compress",
    data: {
      format,
      version,
      scale,
      resolution,
      files: files.map((file) => ({
        ...file,
        bitmap: file.canvas.transferToImageBitmap(),
        canvas: undefined,
      })),
    },
  };
  console.log("postCompress", message);
  return new Promise<string[] | Buffer[]>((resolve) => {
    worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type !== "compress") return;
        resolve(event.data.data);
      },
    );
    worker.postMessage(
      message,
      message.data.files.map((file) => file.bitmap),
    );
  });
};
