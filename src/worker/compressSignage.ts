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
    const {
      files: _files,
      format,
      signage,
      scale,
      resolution,
    } = event.data.data;

    const resolutionScale = getResolutionScale(resolution);
    const finalScale = scale * resolutionScale;

    const files = _files.map((file) => {
      if (finalScale === 1) {
        const canvas = new OffscreenCanvas(
          file.bitmap.width,
          file.bitmap.height,
        );
        canvas.getContext("2d")?.drawImage(file.bitmap, 0, 0);
        return { ...file, canvas };
      }
      const canvas = new OffscreenCanvas(
        file.bitmap.width * finalScale,
        file.bitmap.height * finalScale,
      );
      canvas
        .getContext("2d")
        ?.drawImage(file.bitmap, 0, 0, canvas.width, canvas.height);
      return { ...file, canvas };
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
  },
);
