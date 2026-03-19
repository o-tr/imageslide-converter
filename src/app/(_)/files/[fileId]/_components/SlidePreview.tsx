"use client";
import type { SlideFrameMeta } from "@/_types/slide-preview";
import { decodeSlides } from "@/lib/slidePreview/decodeSlides";
import { Spin } from "antd";
import { type FC, useEffect, useRef, useState } from "react";

const THUMBNAIL_HEIGHT = 128;

const SlideThumbnail: FC<{
  frame: SlideFrameMeta;
  imageDataMap: { current: Map<number, ImageData> };
}> = ({ frame, imageDataMap }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspectRatio = frame.width / frame.height;
  const thumbWidth = Math.round(THUMBNAIL_HEIGHT * aspectRatio);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = imageDataMap.current.get(frame.index);
    if (!imageData) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = Math.round(thumbWidth * dpr);
    canvas.height = Math.round(THUMBNAIL_HEIGHT * dpr);
    let cancelled = false;
    createImageBitmap(imageData)
      .then((bitmap) => {
        try {
          if (!cancelled)
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        } finally {
          bitmap.close();
        }
        // Release the heavy ImageData now that pixels are on the canvas
        if (!cancelled) imageDataMap.current.delete(frame.index);
      })
      .catch(() => {
        // rendering failed; leave the canvas blank
      });
    return () => {
      cancelled = true;
    };
  }, [frame, thumbWidth, imageDataMap]);

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <canvas
        ref={canvasRef}
        style={{ width: thumbWidth, height: THUMBNAIL_HEIGHT }}
        className="border border-gray-200 rounded"
      />
      <span className="text-xs text-gray-500">{frame.index + 1}</span>
    </div>
  );
};

export const SlidePreview: FC<{ urls: string[] }> = ({ urls }) => {
  const [frames, setFrames] = useState<SlideFrameMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageDataMap = useRef<Map<number, ImageData>>(new Map());

  useEffect(() => {
    setFrames(null);
    setError(null);
    imageDataMap.current.clear();
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await decodeSlides(urls, controller.signal);
        if (!controller.signal.aborted) {
          const map = new Map<number, ImageData>();
          const meta: SlideFrameMeta[] = [];
          for (const f of result) {
            map.set(f.index, f.imageData);
            meta.push({ index: f.index, width: f.width, height: f.height });
          }
          imageDataMap.current = map;
          setFrames(meta);
        }
      } catch (e: unknown) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "プレビューの読み込みに失敗しました",
          );
      }
    };
    load();
    return () => {
      controller.abort();
      imageDataMap.current.clear();
    };
  }, [urls]);

  if (error) {
    return (
      <p className="text-sm text-gray-400">
        プレビューを表示できませんでした: {error}
      </p>
    );
  }

  if (!frames) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Spin size="small" />
        <span>プレビューを読み込み中...</span>
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        プレビューを表示できるフレームがありません
      </p>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {frames.map((frame) => (
        <SlideThumbnail
          key={frame.index}
          frame={frame}
          imageDataMap={imageDataMap}
        />
      ))}
    </div>
  );
};
