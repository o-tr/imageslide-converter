"use client";
import { decodeSlides } from "@/lib/slidePreview/decodeSlides";
import type { SlideFrame } from "@/lib/slidePreview/types";
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
    ctx.putImageData(frame.imageData, 0, 0);
  }, [frame]);

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <canvas
        ref={canvasRef}
        width={frame.width}
        height={frame.height}
        style={{ width: thumbWidth, height: THUMBNAIL_HEIGHT }}
        className="border border-gray-200 rounded"
      />
      <span className="text-xs text-gray-500">{frame.index + 1}</span>
    </div>
  );
};

export const SlidePreview: FC<{ firstUrl: string }> = ({ firstUrl }) => {
  const [frames, setFrames] = useState<SlideFrame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    decodeSlides(firstUrl)
      .then((result) => {
        if (!cancelled) setFrames(result);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "プレビューの読み込みに失敗しました",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [firstUrl]);

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
