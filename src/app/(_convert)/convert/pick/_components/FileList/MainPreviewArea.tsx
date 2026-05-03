"use client";
import type { SelectedFile, SelectedFileAnimation } from "@/_types/file-picker";
import { getAnimationFrameScale } from "@/utils/getAnimationFrameScale";
import { Dropdown, Flex } from "antd";
import TextArea from "antd/es/input/TextArea";
import { type ChangeEvent, type FC, useEffect, useRef } from "react";
import { Preview } from "./Preview";

const FPS_OPTIONS = [1, 2, 5, 8, 10, 12, 15, 20, 24, 30] as const;

interface AnimatedPreviewProps {
  file: SelectedFile;
  onAnimationFpsChange: (animIndex: number, fps: number) => void;
}

const AnimatedPreview: FC<AnimatedPreviewProps> = ({
  file,
  onAnimationFpsChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIndicesRef = useRef<number[]>([]);
  const lastTimesRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !file.animations?.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = file.canvas.width;
    canvas.height = file.canvas.height;

    const animations = file.animations;

    // Preserve frame position across FPS-only changes; reset only when animation count changes
    if (frameIndicesRef.current.length !== animations.length) {
      frameIndicesRef.current = animations.map(() => 0);
    }
    // Always re-sync timing when the RAF loop restarts
    lastTimesRef.current = animations.map(() => -1);

    let rafId: number;

    const draw = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(file.canvas, 0, 0);

      for (let i = 0; i < animations.length; i++) {
        const anim = animations[i];
        const storedFps = anim.fps;
        const targetFps = anim.fpsOverride ?? storedFps;
        if (
          !anim.frames.length ||
          !Number.isFinite(targetFps) ||
          targetFps <= 0
        )
          continue;

        // virtualFrameCount = total frames in EIA output at targetFps
        const virtualFrameCount = anim.fpsOverride
          ? Math.max(
              1,
              Math.round((anim.frames.length / storedFps) * targetFps),
            )
          : anim.frames.length;

        if (lastTimesRef.current[i] < 0) {
          lastTimesRef.current[i] = time;
        } else {
          const interval = 1000 / targetFps;
          const elapsed = time - lastTimesRef.current[i];
          if (elapsed >= interval) {
            frameIndicesRef.current[i] =
              (frameIndicesRef.current[i] + 1) % virtualFrameCount;
            lastTimesRef.current[i] = time - (elapsed % interval);
          }
        }

        // Map virtual index → stored frame index
        const storedIndex = Math.min(
          Math.round((frameIndicesRef.current[i] * storedFps) / targetFps),
          anim.frames.length - 1,
        );
        ctx.drawImage(anim.frames[storedIndex], anim.x, anim.y, anim.w, anim.h);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [file.canvas, file.animations]);

  const buildFpsMenuItems = (
    animIndex: number,
    anim: SelectedFileAnimation,
  ) => {
    const makeItem = (fps: number, isOriginal: boolean) => {
      const scale = getAnimationFrameScale(fps);
      const scaleLabel = scale < 1 ? ` (解像度 ${scale * 100}%)` : "";
      return {
        key: String(fps),
        label: isOriginal
          ? `${fps} fps (オリジナル)${scaleLabel}`
          : fps === 5
            ? `${fps} fps (auto)${scaleLabel}`
            : `${fps} fps${scaleLabel}`,
        onClick: () => onAnimationFpsChange(animIndex, fps),
        style:
          fps === (anim.fpsOverride ?? anim.fps)
            ? { fontWeight: "bold" }
            : undefined,
      };
    };

    const items = FPS_OPTIONS.filter((fps) => fps < anim.fps && fps <= 15).map(
      (fps) => makeItem(fps, false),
    );
    if (anim.fps <= 15) {
      items.push(makeItem(anim.fps, true));
    }
    return items;
  };

  return (
    <>
      <canvas ref={canvasRef} className="w-full h-full" />
      {file.animations?.map((anim, i) => (
        <Dropdown
          key={`${i}-${anim.x}-${anim.y}-${anim.w}-${anim.h}`}
          trigger={["contextMenu"]}
          menu={{ items: buildFpsMenuItems(i, anim) }}
        >
          <div
            className="absolute cursor-context-menu z-10 transition-all duration-150 hover:ring-2 hover:ring-inset hover:ring-blue-500/70 hover:bg-blue-500/10"
            title="右クリックでFPS・解像度を変更"
            style={{
              left: `${(anim.x / file.canvas.width) * 100}%`,
              top: `${(anim.y / file.canvas.height) * 100}%`,
              width: `${(anim.w / file.canvas.width) * 100}%`,
              height: `${(anim.h / file.canvas.height) * 100}%`,
            }}
          />
        </Dropdown>
      ))}
    </>
  );
};

const SkippedAnimationsOverlay: FC<{ file: SelectedFile }> = ({ file }) => {
  if (!file.skippedAnimations?.length) return null;
  return (
    <>
      {file.skippedAnimations.map((anim, i) => (
        <div
          key={`skipped-${i}-${anim.x}-${anim.y}-${anim.w}-${anim.h}`}
          className="absolute group border-2 border-red-500 pointer-events-auto"
          style={{
            left: `${(anim.x / file.canvas.width) * 100}%`,
            top: `${(anim.y / file.canvas.height) * 100}%`,
            width: `${(anim.w / file.canvas.width) * 100}%`,
            height: `${(anim.h / file.canvas.height) * 100}%`,
          }}
        >
          <div className="absolute inset-0 bg-red-500/0 group-hover:bg-red-500/20 transition-colors duration-150" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
            <span className="text-[10px] leading-tight text-red-700 bg-white/90 px-1.5 py-0.5 rounded shadow text-center">
              アニメーションが無効化されました
              <br />
              （重なっています）
            </span>
          </div>
        </div>
      ))}
    </>
  );
};

interface MainPreviewAreaProps {
  file: SelectedFile;
  onNoteChange: (id: string, note: string) => void;
  onAnimationFpsChange: (id: string, animIndex: number, fps: number) => void;
}

export const MainPreviewArea: FC<MainPreviewAreaProps> = ({
  file,
  onNoteChange,
  onAnimationFpsChange,
}) => {
  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onNoteChange(file.id, e.target.value);
  };

  const handleFpsChange = (animIndex: number, fps: number) => {
    onAnimationFpsChange(file.id, animIndex, fps);
  };

  return (
    <Flex vertical gap={16} className={"h-full"}>
      <div className="flex-1 flex items-center justify-center">
        <div
          className={"w-full aspect-video bg-gray-100 rounded overflow-hidden"}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div
              className="relative"
              style={{
                aspectRatio: `${file.canvas.width} / ${file.canvas.height}`,
                maxWidth: "100%",
                maxHeight: "100%",
              }}
            >
              {file.animations?.length ? (
                <AnimatedPreview
                  key={file.id}
                  file={file}
                  onAnimationFpsChange={handleFpsChange}
                />
              ) : (
                <Preview canvas={file.canvas} className={"w-full h-full"} />
              )}
              <SkippedAnimationsOverlay file={file} />
            </div>
          </div>
        </div>
      </div>
      <Flex vertical gap={4} className={""}>
        <span className={"text-sm font-medium"}>スピーカーノート</span>
        <TextArea
          value={file.note ?? ""}
          onChange={onChange}
          placeholder={"クリックしてスピーカーノートを追加できます"}
          autoSize={{ minRows: 4 }}
        />
      </Flex>
    </Flex>
  );
};
