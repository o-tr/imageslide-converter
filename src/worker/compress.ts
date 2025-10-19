import type { WorkerMessage, WorkerResponse } from "@/_types/worker";
import { TargetFormats } from "@/const/convert";

const worker = self as unknown as Worker;
console.log("compress worker start");
worker.addEventListener(
  "message",
  async (event: MessageEvent<WorkerMessage>) => {
    console.log("compress start", event.data);
    if (event.data.type !== "compress") return;
    const { files: _files, format, scale, resolution } = event.data.data;

    // 解像度に応じたスケール係数を計算
    const getResolutionScale = (
      resolution: "4K" | "FHD" | "HD" | "SD",
    ): number => {
      switch (resolution) {
        case "4K":
          return 1; // そのまま
        case "FHD":
          return Math.min(1920 / 3840, 1080 / 2160); // 1920x1080基準
        case "HD":
          return Math.min(1280 / 3840, 720 / 2160); // 1280x720基準
        case "SD":
          return Math.min(640 / 3840, 480 / 2160); // 640x480基準
        default:
          return 1;
      }
    };

    const resolutionScale = getResolutionScale(resolution);

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

      // 解像度とscaleの両方を考慮した最終スケール
      const finalScale = scale * resolutionScale;

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
