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
          frame.close(); // Release the now-empty canvas backing store
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
  return new Promise<string[] | Buffer[]>((resolve) => {
    const handler = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type !== "compress") return;
      worker.removeEventListener("message", handler);
      resolve(event.data.data);
    };
    worker.addEventListener("message", handler);
    worker.postMessage(message, transferables);
  });
};
