import type { WorkerMessage, WorkerResponse } from "@/_types/worker";
import { TargetFormats } from "@/const/convert";
import { getResolutionScale } from "@/utils/getResolutionScale";

const worker = self as unknown as Worker;
console.log("compress worker start");
worker.addEventListener(
  "message",
  async (event: MessageEvent<WorkerMessage>) => {
    console.log("compress start", event.data);
    if (event.data.type !== "compress-signage") return;
    try {
      const {
        files: _files,
        format,
        signage,
        scale,
        resolution,
      } = event.data.data;

      const files = _files.map((file) => {
        // ファイルごとにアスペクト比を維持したスケールを計算
        const resolutionScale = getResolutionScale(
          resolution,
          file.bitmap.width,
          file.bitmap.height,
        );
        const finalScale = scale * resolutionScale;
        const { animations: _a, bitmap: _b, ...rest } = file;
        const canvas =
          finalScale === 1
            ? new OffscreenCanvas(file.bitmap.width, file.bitmap.height)
            : new OffscreenCanvas(
                Math.max(1, Math.round(file.bitmap.width * finalScale)),
                Math.max(1, Math.round(file.bitmap.height * finalScale)),
              );
        try {
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            throw new Error(
              `Cannot get 2d context for signage frame ${file.bitmap.width}x${file.bitmap.height}`,
            );
          }
          if (finalScale === 1) {
            ctx.drawImage(file.bitmap, 0, 0);
          } else {
            ctx.drawImage(file.bitmap, 0, 0, canvas.width, canvas.height);
          }
          return { ...rest, canvas };
        } finally {
          file.bitmap.close();
        }
      });
      console.log("compress", files);
      const converterObj = TargetFormats.find((f) => f.id === format);
      if (!converterObj || !converterObj.signageSupport)
        throw new Error("converter not found");
      const result = await converterObj.converter(files, signage);
      const message: WorkerResponse = {
        type: "compress-signage",
        data: result,
      };
      worker.postMessage(message);
    } catch (e) {
      const error =
        e instanceof Error
          ? e.message
          : "Unknown error in signage compression worker";
      console.error("compress signage worker failed:", e);
      const message: WorkerResponse = {
        type: "compress-signage-error",
        error,
      };
      worker.postMessage(message);
    }
  },
);
