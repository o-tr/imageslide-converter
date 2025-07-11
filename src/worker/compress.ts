import type { WorkerMessage, WorkerResponse } from "@/_types/worker";
import { TargetFormats } from "@/const/convert";

const worker = self as unknown as Worker;
console.log("compress worker start");
worker.addEventListener(
  "message",
  async (event: MessageEvent<WorkerMessage>) => {
    console.log("compress start", event.data);
    if (event.data.type !== "compress") return;
    const { files: _files, format, version, scale } = event.data.data;
    const files = _files.map((file) => {
      if (["DXT1"].includes(format)) {
        // そのままだとノイズが目立つので2倍に拡大してから圧縮
        const _width = Math.ceil((file.bitmap.width * scale * 2) / 4) * 4;
        const _height = Math.ceil((file.bitmap.height * scale * 2) / 4) * 4;
        if (_width === file.bitmap.width && _height === file.bitmap.height) {
          const canvas = new OffscreenCanvas(
            file.bitmap.width,
            file.bitmap.height,
          );
          canvas.getContext("2d")?.drawImage(file.bitmap, 0, 0);
          return { ...file, canvas };
        }
        const canvas = new OffscreenCanvas(_width, _height);
        canvas
          .getContext("2d")
          ?.drawImage(file.bitmap, 0, 0, canvas.width, canvas.height);
        return { ...file, canvas };
      }
      if (scale === 1) {
        const canvas = new OffscreenCanvas(
          file.bitmap.width,
          file.bitmap.height,
        );
        canvas.getContext("2d")?.drawImage(file.bitmap, 0, 0);
        return { ...file, canvas };
      }
      const canvas = new OffscreenCanvas(
        file.bitmap.width * scale,
        file.bitmap.height * scale,
      );
      canvas
        .getContext("2d")
        ?.drawImage(file.bitmap, 0, 0, canvas.width, canvas.height);
      return { ...file, canvas };
    });
    console.log("compress", files);
    const converter = TargetFormats.find((f) => f.id === format)?.converter;
    if (!converter) throw new Error("converter not found");
    const result = await converter(files);
    const message: WorkerResponse = {
      type: "compress",
      data: result,
    };
    worker.postMessage(message);
  },
);
