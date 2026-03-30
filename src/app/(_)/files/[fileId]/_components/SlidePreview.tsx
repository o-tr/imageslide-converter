"use client";
import type { SlideFrameMeta } from "@/_types/slide-preview";
import { decodeSlides } from "@/lib/slidePreview/decodeSlides";
import { Button, Spin } from "antd";
import { type FC, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TbChevronLeft, TbChevronRight } from "react-icons/tb";

type DecodedAnimation = {
  x: number;
  y: number;
  w: number;
  h: number;
  fps: number;
  frames: ImageBitmap[];
};

const THUMBNAIL_HEIGHT = 128;

// On the client we want to size/draw the canvas before paint to reduce
// layout shift. On the server, useLayoutEffect would warn, so we fall back.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const SlideThumbnail: FC<{
  frame: SlideFrameMeta;
  bitmapMap: { current: Map<number, ImageBitmap> };
  isSelected?: boolean;
  onClick?: () => void;
}> = ({ frame, bitmapMap, isSelected = false, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspectRatio = frame.width / frame.height;
  const thumbWidth = Math.round(THUMBNAIL_HEIGHT * aspectRatio);

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bitmap = bitmapMap.current.get(frame.index);
    if (!bitmap) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = Math.round(thumbWidth * dpr);
    canvas.height = Math.round(THUMBNAIL_HEIGHT * dpr);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }, [frame.index, thumbWidth, bitmapMap]);

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
      <span className="text-xs text-primary">{frame.index + 1}</span>
    </button>
  );
};

const MainSlideDisplay: FC<{
  frame: SlideFrameMeta;
  totalFrames: number;
  bitmapMap: { current: Map<number, ImageBitmap> };
  animationMap: { current: Map<number, DecodedAnimation[]> };
  onPrevious: () => void;
  onNext: () => void;
}> = ({ frame, totalFrames, bitmapMap, animationMap, onPrevious, onNext }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bitmap = bitmapMap.current.get(frame.index);
    if (!bitmap) return;

    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const animations = animationMap.current.get(frame.index);

    if (!animations || animations.length === 0) {
      // No animation: just draw the base bitmap
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return;
    }

    // Animation loop
    const frameIndices = animations.map(() => 0);
    let lastTime = 0;
    let rafId: number;

    const draw = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (let i = 0; i < animations.length; i++) {
        const anim = animations[i];
        if (anim.frames.length === 0) continue;

        // Advance frame based on fps
        if (lastTime > 0) {
          const elapsed = time - lastTime;
          const interval = 1000 / anim.fps;
          if (elapsed >= interval) {
            frameIndices[i] = (frameIndices[i] + 1) % anim.frames.length;
          }
        }

        const animBitmap = anim.frames[frameIndices[i]];
        ctx.drawImage(animBitmap, anim.x, anim.y, anim.w, anim.h);
      }

      // Use the slowest fps among all animations for timing
      const minInterval = Math.min(...animations.map((a) => 1000 / a.fps));
      if (lastTime === 0 || time - lastTime >= minInterval) {
        lastTime = time;
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    animFrameRef.current = rafId;

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [frame.index, bitmapMap, animationMap]);

  return (
    <div className="relative flex items-center justify-center flex-1 rounded overflow-hidden aspect-video">
      <canvas
        ref={canvasRef}
        className="w-full h-full max-w-full max-h-full object-contain"
      />
      <button
        onClick={onPrevious}
        disabled={frame.index === 0}
        aria-label="前のスライド"
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
        disabled={frame.index === totalFrames - 1}
        aria-label="次のスライド"
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
  bitmapMap: { current: Map<number, ImageBitmap> };
  selectedIndex: number;
  onSelectFrame: (index: number) => void;
}> = ({ frames, bitmapMap, selectedIndex, onSelectFrame }) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selectedElement = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    if (selectedElement) {
      selectedElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [selectedIndex]);

  return (
    <div className="flex overflow-x-auto md:overflow-x-hidden md:overflow-y-auto shrink-0 w-full md:w-auto h-[100px] md:h-auto px-2 py-2">
      <div ref={listRef} className="flex flex-row md:flex-col gap-2">
        {frames.map((frame) => (
          <SlideThumbnail
            key={frame.index}
            frame={frame}
            bitmapMap={bitmapMap}
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
  bitmapMap: { current: Map<number, ImageBitmap> };
  animationMap: { current: Map<number, DecodedAnimation[]> };
  selectedIndex: number;
  onPrevious: () => void;
  onNext: () => void;
}> = ({
  frames,
  bitmapMap,
  animationMap,
  selectedIndex,
  onPrevious,
  onNext,
}) => {
  const selectedFrame = frames[selectedIndex];

  return (
    <div className="flex flex-col gap-4 flex-1 md:w-3/4 md:px-4 md:py-2">
      <MainSlideDisplay
        frame={selectedFrame}
        totalFrames={frames.length}
        bitmapMap={bitmapMap}
        animationMap={animationMap}
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

        <div className="text-sm text-center text-primary">
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
  bitmapMap: { current: Map<number, ImageBitmap> };
  animationMap: { current: Map<number, DecodedAnimation[]> };
  selectedIndex: number;
  onSelectFrame: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}> = ({
  frames,
  bitmapMap,
  animationMap,
  selectedIndex,
  onSelectFrame,
  onPrevious,
  onNext,
}) => {
  return (
    <div className="flex flex-col-reverse md:flex-row gap-2 h-auto aspect-video rounded bg-secondary p-2">
      <SlideList
        frames={frames}
        bitmapMap={bitmapMap}
        selectedIndex={selectedIndex}
        onSelectFrame={onSelectFrame}
      />
      <MainView
        frames={frames}
        bitmapMap={bitmapMap}
        animationMap={animationMap}
        selectedIndex={selectedIndex}
        onPrevious={onPrevious}
        onNext={onNext}
      />
    </div>
  );
};

const imageDataToBitmap = async (data: ImageData): Promise<ImageBitmap> => {
  try {
    return await createImageBitmap(data);
  } catch {
    const canvas = document.createElement("canvas");
    canvas.width = data.width;
    canvas.height = data.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context not available");
    ctx.putImageData(data, 0, 0);
    return await createImageBitmap(canvas);
  }
};

export const SlidePreview: FC<{ urls: string[] }> = ({ urls }) => {
  const [frames, setFrames] = useState<SlideFrameMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const bitmapMap = useRef<Map<number, ImageBitmap>>(new Map());
  const animationMap = useRef<Map<number, DecodedAnimation[]>>(new Map());

  useEffect(() => {
    setFrames(null);
    setError(null);
    setSelectedIndex(0);
    for (const bitmap of bitmapMap.current.values()) bitmap.close();
    bitmapMap.current.clear();
    for (const anims of animationMap.current.values()) {
      for (const anim of anims) {
        for (const bm of anim.frames) bm.close();
      }
    }
    animationMap.current.clear();
    const controller = new AbortController();
    const load = async () => {
      let nextMap: Map<number, ImageBitmap> | null = null;
      const nextAnimMap = new Map<number, DecodedAnimation[]>();
      try {
        const result = await decodeSlides(urls, controller.signal);
        if (!controller.signal.aborted) {
          const map = new Map<number, ImageBitmap>();
          const meta: SlideFrameMeta[] = [];
          nextMap = map;

          while (result.length > 0) {
            const f = result.shift();
            if (!f) break;
            if (controller.signal.aborted) break;

            const bitmap = await imageDataToBitmap(f.imageData);
            map.set(f.index, bitmap);
            meta.push({
              index: f.index,
              width: f.width,
              height: f.height,
              hasAnimations: !!f.animations && f.animations.length > 0,
            });

            // Convert animation ImageData to ImageBitmap
            if (f.animations && f.animations.length > 0) {
              const decodedAnims: DecodedAnimation[] = [];
              for (const anim of f.animations) {
                const animBitmaps: ImageBitmap[] = [];
                for (const frameData of anim.frames) {
                  if (controller.signal.aborted) break;
                  animBitmaps.push(await imageDataToBitmap(frameData));
                }
                decodedAnims.push({
                  x: anim.x,
                  y: anim.y,
                  w: anim.w,
                  h: anim.h,
                  fps: anim.fps,
                  frames: animBitmaps,
                });
              }
              nextAnimMap.set(f.index, decodedAnims);
            }
          }

          if (!controller.signal.aborted) {
            bitmapMap.current = map;
            animationMap.current = nextAnimMap;
            nextMap = null;
            setFrames(meta);
          }
        }
      } catch (e: unknown) {
        if (!controller.signal.aborted) {
          console.error("Slide preview decode error:", e);
          setError("プレビューの読み込みに失敗しました");
        }
      } finally {
        if (nextMap) {
          for (const bitmap of nextMap.values()) bitmap.close();
          for (const anims of nextAnimMap.values()) {
            for (const anim of anims) {
              for (const bm of anim.frames) bm.close();
            }
          }
        }
      }
    };
    load();
    return () => {
      controller.abort();
      for (const bitmap of bitmapMap.current.values()) bitmap.close();
      bitmapMap.current.clear();
      for (const anims of animationMap.current.values()) {
        for (const anim of anims) {
          for (const bm of anim.frames) bm.close();
        }
      }
      animationMap.current.clear();
    };
  }, [urls]);

  const handlePrevious = () => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setSelectedIndex((prev) => Math.min((frames?.length ?? 0) - 1, prev + 1));
  };

  if (error) {
    return <p className="text-sm text-gray-400">{error}</p>;
  }

  if (!frames) {
    return (
      <div className="grid h-auto aspect-video rounded bg-secondary p-2 place-items-center">
        <Spin size="large" />
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
      bitmapMap={bitmapMap}
      animationMap={animationMap}
      selectedIndex={selectedIndex}
      onSelectFrame={setSelectedIndex}
      onPrevious={handlePrevious}
      onNext={handleNext}
    />
  );
};
