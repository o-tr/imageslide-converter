"use client";
import type { SlideFrame } from "@/_types/slide-preview";
import { decodeSlides } from "@/lib/slidePreview/decodeSlides";
import { Spin } from "antd";
import { type FC, useEffect, useRef, useState } from "react";

const THUMBNAIL_HEIGHT = 128;

const SlideThumbnail: FC<{ frame: SlideFrame }> = ({ frame }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspectRatio = frame.width / frame.height;
  const thumbWidth = Math.round(THUMBNAIL_HEIGHT * aspectRatio);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = Math.round(thumbWidth * dpr);
    canvas.height = Math.round(THUMBNAIL_HEIGHT * dpr);
    let cancelled = false;
    createImageBitmap(frame.imageData).then((bitmap) => {
      if (!cancelled) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
    });
    return () => {
      cancelled = true;
    };
  }, [frame, thumbWidth]);

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
  const [frames, setFrames] = useState<SlideFrame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFrames(null);
    setError(null);
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await decodeSlides(urls, controller.signal);
        if (!controller.signal.aborted) setFrames(result);
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
        <SlideThumbnail key={frame.index} frame={frame} />
      ))}
    </div>
  );
};
