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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !file.animations?.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = file.canvas.width;
    canvas.height = file.canvas.height;

    const animations = file.animations;
    const frameIndices = animations.map(() => 0);
    const lastTimes = animations.map(() => -1);
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

        if (lastTimes[i] < 0) {
          lastTimes[i] = time;
        } else {
          const interval = 1000 / targetFps;
          const elapsed = time - lastTimes[i];
          if (elapsed >= interval) {
            frameIndices[i] = (frameIndices[i] + 1) % virtualFrameCount;
            lastTimes[i] = time - (elapsed % interval);
          }
        }

        // Map virtual index → stored frame index
        const storedIndex = Math.min(
          Math.round((frameIndices[i] * storedFps) / targetFps),
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
          fps === (anim.fpsOverride ?? null)
            ? { fontWeight: "bold" }
            : undefined,
      };
    };

    const effectiveFps = Math.min(anim.fps, 15);
    const items = FPS_OPTIONS.filter(
      (fps) => fps <= effectiveFps && fps !== effectiveFps,
    ).map((fps) => makeItem(fps, false));
    items.push(makeItem(effectiveFps, true));
    return items;
  };

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full object-contain" />
      {file.animations?.map((anim, i) => (
        <Dropdown
          key={`${anim.x}-${anim.y}-${anim.w}-${anim.h}`}
          trigger={["contextMenu"]}
          menu={{ items: buildFpsMenuItems(i, anim) }}
        >
          <div
            className="absolute cursor-context-menu transition-all duration-150 hover:ring-2 hover:ring-inset hover:ring-blue-500/70 hover:bg-blue-500/10"
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
    </div>
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
          {file.animations?.length ? (
            <AnimatedPreview
              file={file}
              onAnimationFpsChange={handleFpsChange}
            />
          ) : (
            <Preview canvas={file.canvas} className={"w-full h-full"} />
          )}
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
