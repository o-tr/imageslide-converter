import type { SelectedFile } from "@/_types/file-picker";
import type { TTextureConverterFormat } from "@/_types/text-zip/formats";
import type {
  WorkerAnimationBitmap,
  WorkerMessage,
  WorkerResponse,
} from "@/_types/worker";
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

  const transferables: Transferable[] = [];
  const workerFiles = files.map((file) => {
    const bitmap = file.canvas.transferToImageBitmap();
    transferables.push(bitmap);

    let animations: WorkerAnimationBitmap[] | undefined;
    if (file.animations && file.animations.length > 0) {
      animations = file.animations.map((anim) => {
        const animBitmaps = anim.frames.map((frame) => {
          const bm = frame.transferToImageBitmap();
          transferables.push(bm);
          return bm;
        });
        return {
          x: anim.x,
          y: anim.y,
          w: anim.w,
          h: anim.h,
          fps: anim.fps,
          frames: animBitmaps,
        };
      });
    }

    const { canvas: _canvas, animations: _origAnimations, ...fileRest } = file;
    return { ...fileRest, bitmap, animations };
  });

  const message: WorkerMessage = {
    type: "compress",
    data: {
      format,
      version,
      scale,
      resolution,
      files: workerFiles,
    },
  };
  console.log("postCompress", message);
  return new Promise<string[] | Buffer[]>((resolve, reject) => {
    const handler = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === "compress") {
        cleanup();
        resolve(event.data.data);
        return;
      }
      if (event.data.type === "compress-error") {
        cleanup();
        reject(new Error(event.data.error));
      }
    };
    const errorHandler = (event: ErrorEvent) => {
      cleanup();
      reject(
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "Compression worker failed"),
      );
    };
    const messageErrorHandler = () => {
      cleanup();
      reject(new Error("Compression worker message error"));
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
      worker.postMessage(message, transferables);
    } catch (e) {
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
};
