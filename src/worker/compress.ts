import type { SelectedFileAnimation } from "@/_types/file-picker";
import type { WorkerMessage, WorkerResponse } from "@/_types/worker";
import { TargetFormats } from "@/const/convert";
import { getResolutionScale } from "@/utils/getResolutionScale";

const worker = self as unknown as Worker;
console.log("compress worker start");
worker.addEventListener(
  "message",
  async (event: MessageEvent<WorkerMessage>) => {
    console.log("compress start", event.data);
    if (event.data.type !== "compress") return;
    try {
      const { files: _files, format, scale, resolution } = event.data.data;

      const files = _files.map((file) => {
        // ファイルごとにアスペクト比を維持したスケールを計算
        const resolutionScale = getResolutionScale(
          resolution,
          file.bitmap.width,
          file.bitmap.height,
        );

        // Compute effective scale for animations and main canvas
        let effectiveScaleX: number;
        let effectiveScaleY: number;
        let canvas: OffscreenCanvas;

        if (["DXT1"].includes(format)) {
          // そのままだとノイズが目立つので2倍に拡大してから圧縮
          const _width = Math.max(
            4,
            Math.ceil((file.bitmap.width * scale * 2) / 4) * 4,
          );
          const _height = Math.max(
            4,
            Math.ceil((file.bitmap.height * scale * 2) / 4) * 4,
          );
          effectiveScaleX = _width / file.bitmap.width;
          effectiveScaleY = _height / file.bitmap.height;
          canvas = new OffscreenCanvas(_width, _height);
          if (_width === file.bitmap.width && _height === file.bitmap.height) {
            canvas.getContext("2d")?.drawImage(file.bitmap, 0, 0);
          } else {
            canvas
              .getContext("2d")
              ?.drawImage(file.bitmap, 0, 0, canvas.width, canvas.height);
          }
        } else {
          const finalScale = scale * resolutionScale;
          if (finalScale === 1) {
            effectiveScaleX = 1;
            effectiveScaleY = 1;
            canvas = new OffscreenCanvas(file.bitmap.width, file.bitmap.height);
            canvas.getContext("2d")?.drawImage(file.bitmap, 0, 0);
          } else {
            const scaledWidth = Math.max(
              1,
              Math.round(file.bitmap.width * finalScale),
            );
            const scaledHeight = Math.max(
              1,
              Math.round(file.bitmap.height * finalScale),
            );
            effectiveScaleX = scaledWidth / file.bitmap.width;
            effectiveScaleY = scaledHeight / file.bitmap.height;
            canvas = new OffscreenCanvas(scaledWidth, scaledHeight);
            canvas
              .getContext("2d")
              ?.drawImage(file.bitmap, 0, 0, canvas.width, canvas.height);
          }
        }

        // Convert animation bitmaps to OffscreenCanvas with scaling applied
        let animations: SelectedFileAnimation[] | undefined;
        if (file.animations && file.animations.length > 0) {
          animations = file.animations.map((anim) => ({
            x: Math.round(anim.x * effectiveScaleX),
            y: Math.round(anim.y * effectiveScaleY),
            w: Math.max(1, Math.round(anim.w * effectiveScaleX)),
            h: Math.max(1, Math.round(anim.h * effectiveScaleY)),
            fps: anim.fps,
            frames: anim.frames.map((bm) => {
              const scaledW = Math.max(
                1,
                Math.round(bm.width * effectiveScaleX),
              );
              const scaledH = Math.max(
                1,
                Math.round(bm.height * effectiveScaleY),
              );
              const c = new OffscreenCanvas(scaledW, scaledH);
              const ctx = c.getContext("2d");
              if (!ctx)
                throw new Error("Cannot get 2d context for animation frame");
              ctx.drawImage(bm, 0, 0, scaledW, scaledH);
              bm.close();
              return c;
            }),
          }));
        }

        return { ...file, canvas, animations };
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
    } catch (e) {
      const error =
        e instanceof Error ? e.message : "Unknown error in compression worker";
      console.error("compress worker failed:", e);
      const message: WorkerResponse = {
        type: "compress-error",
        error,
      };
      worker.postMessage(message);
    }
  },
);
