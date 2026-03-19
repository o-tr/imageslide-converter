"use client";
import type { SlideFrameMeta } from "@/_types/slide-preview";
import { decodeSlides } from "@/lib/slidePreview/decodeSlides";
import { Button, Spin } from "antd";
import { type FC, useEffect, useRef, useState } from "react";
import { TbChevronLeft, TbChevronRight } from "react-icons/tb";

const THUMBNAIL_HEIGHT = 128;

const SlideThumbnail: FC<{
  frame: SlideFrameMeta;
  imageDataMap: { current: Map<number, ImageData> };
  isSelected?: boolean;
  onClick?: () => void;
}> = ({ frame, imageDataMap, isSelected = false, onClick }) => {
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
      })
      .catch((e) => {
        console.error("Error occurred while creating image bitmap:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [frame, thumbWidth, imageDataMap]);

  const borderClass = isSelected ? "border-blue-500" : "border-gray-200";

  return (
    <button
      type="button"
      className={
        "flex flex-col items-center gap-1 rounded p-1 cursor-pointer transition-all max-h-full max-w-full"
      }
      onClick={onClick}
      data-index={frame.index}
    >
      <canvas
        ref={canvasRef}
        className={`rounded object-contain md:w-full md:h-auto h-full max-h-full overflow-hidden aspect-video! border-2 hover:border-blue-400 ${borderClass}`}
      />
      <span className="text-xs text-gray-500">{frame.index + 1}</span>
    </button>
  );
};

const MainSlideDisplay: FC<{
  frame: SlideFrameMeta;
  imageDataMap: { current: Map<number, ImageData> };
  onPrevious: () => void;
  onNext: () => void;
}> = ({ frame, imageDataMap, onPrevious, onNext }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = imageDataMap.current.get(frame.index);
    if (!imageData) return;

    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = imageData.width * dpr;
    canvas.height = imageData.height * dpr;

    const offsetX = (canvas.width - imageData.width * dpr) / 2;
    const offsetY = (canvas.height - imageData.height * dpr) / 2;

    let cancelled = false;
    createImageBitmap(imageData)
      .then((bitmap) => {
        try {
          if (!cancelled) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(
              bitmap,
              offsetX,
              offsetY,
              imageData.width * dpr,
              imageData.height * dpr,
            );
          }
        } finally {
          bitmap.close();
        }
      })
      .catch((e) => {
        console.error("Error occurred while creating image bitmap:", e);
      });

    return () => {
      cancelled = true;
    };
  }, [frame.index, imageDataMap]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center flex-1 rounded overflow-hidden aspect-video"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full max-w-full max-h-full object-contain"
      />
      <button
        onClick={onPrevious}
        disabled={frame.index === 0}
        className="absolute left-0 top-0 w-[30%] h-full opacity-0 hover:opacity-100 cursor-pointer disabled:bg-opacity-20 disabled:cursor-not-allowed bg-linear-to-l from-transparent to-black/30"
        type="button"
      >
        <TbChevronLeft
          size={24}
          className="text-white absolute left-2 top-1/2 transform -translate-y-1/2"
        />
      </button>
      <button
        onClick={onNext}
        disabled={frame.index === imageDataMap.current.size - 1}
        className="absolute right-0 top-0 w-[30%] h-full opacity-0 hover:opacity-100 cursor-pointer disabled:bg-opacity-20 disabled:cursor-not-allowed bg-linear-to-r from-transparent to-black/30"
        type="button"
      >
        <TbChevronRight
          size={24}
          className="text-white absolute right-2 top-1/2 transform -translate-y-1/2"
        />
      </button>
    </div>
  );
};

const SlideList: FC<{
  frames: SlideFrameMeta[];
  imageDataMap: { current: Map<number, ImageData> };
  selectedIndex: number;
  onSelectFrame: (index: number) => void;
}> = ({ frames, imageDataMap, selectedIndex, onSelectFrame }) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selectedElement = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    if (selectedElement) {
      selectedElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedIndex]);

  return (
    <div className="flex overflow-x-auto md:overflow-x-hidden md:overflow-y-auto shrink-0 w-full md:w-1/4 h-[100px] md:h-auto px-2 py-2">
      <div ref={listRef} className="flex flex-row md:flex-col gap-2">
        {frames.map((frame) => (
          <SlideThumbnail
            key={frame.index}
            frame={frame}
            imageDataMap={imageDataMap}
            isSelected={selectedIndex === frame.index}
            onClick={() => onSelectFrame(frame.index)}
          />
        ))}
      </div>
    </div>
  );
};

const MainView: FC<{
  frames: SlideFrameMeta[];
  imageDataMap: { current: Map<number, ImageData> };
  selectedIndex: number;
  onPrevious: () => void;
  onNext: () => void;
}> = ({ frames, imageDataMap, selectedIndex, onPrevious, onNext }) => {
  const selectedFrame = frames[selectedIndex];

  return (
    <div className="flex flex-col gap-4 flex-1 md:w-3/4 md:px-4 md:py-2">
      <MainSlideDisplay
        frame={selectedFrame}
        imageDataMap={imageDataMap}
        onPrevious={onPrevious}
        onNext={onNext}
      />
      <div className="flex items-center justify-between flex-row">
        {/* Previous Button */}
        <Button
          type="primary"
          icon={<TbChevronLeft size={20} />}
          onClick={onPrevious}
          disabled={selectedIndex <= 0}
        />

        <div className="text-sm text-gray-600 text-center">
          スライド {selectedIndex + 1} / {frames.length}
        </div>
        {/* Next Button */}
        <Button
          type="primary"
          icon={<TbChevronRight size={20} />}
          onClick={onNext}
          disabled={selectedIndex >= frames.length - 1}
        />
      </div>
    </div>
  );
};

const SlidePreviewContainer: FC<{
  frames: SlideFrameMeta[];
  imageDataMap: { current: Map<number, ImageData> };
  selectedIndex: number;
  onSelectFrame: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}> = ({
  frames,
  imageDataMap,
  selectedIndex,
  onSelectFrame,
  onPrevious,
  onNext,
}) => {
  return (
    <div className="flex flex-col-reverse md:flex-row gap-2 h-auto max-h-[600px] rounded bg-secondary p-2">
      <SlideList
        frames={frames}
        imageDataMap={imageDataMap}
        selectedIndex={selectedIndex}
        onSelectFrame={onSelectFrame}
      />
      <MainView
        frames={frames}
        imageDataMap={imageDataMap}
        selectedIndex={selectedIndex}
        onPrevious={onPrevious}
        onNext={onNext}
      />
    </div>
  );
};

export const SlidePreview: FC<{ urls: string[] }> = ({ urls }) => {
  const [frames, setFrames] = useState<SlideFrameMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const imageDataMap = useRef<Map<number, ImageData>>(new Map());

  useEffect(() => {
    setFrames(null);
    setError(null);
    setSelectedIndex(0);
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
        if (!controller.signal.aborted) {
          console.error("Slide preview decode error:", e);
          setError("プレビューの読み込みに失敗しました");
        }
      }
    };
    load();
    return () => {
      controller.abort();
      imageDataMap.current.clear();
    };
  }, [urls]);

  const handlePrevious = () => {
    if (selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex < (frames?.length ?? 0) - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  if (error) {
    return <p className="text-sm text-gray-400">{error}</p>;
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
    <SlidePreviewContainer
      frames={frames}
      imageDataMap={imageDataMap}
      selectedIndex={selectedIndex}
      onSelectFrame={setSelectedIndex}
      onPrevious={handlePrevious}
      onNext={handleNext}
    />
  );
};
