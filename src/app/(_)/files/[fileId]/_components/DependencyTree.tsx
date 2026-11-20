"use client";
import type { SlideFrameMeta } from "@/_types/slide-preview";
import {
  type FC,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type BitmapMap = { current: Map<number, ImageBitmap> };

const TREE_THUMB_HEIGHT = 144;

const TreeThumbnail: FC<{ frame: SlideFrameMeta; bitmapMap: BitmapMap }> = ({
  frame,
  bitmapMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = Math.round((TREE_THUMB_HEIGHT * frame.width) / frame.height);
  useEffect(() => {
    const canvas = canvasRef.current;
    const bitmap = bitmapMap.current.get(frame.index);
    const ctx = canvas?.getContext("2d");
    if (!canvas || !bitmap || !ctx) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(TREE_THUMB_HEIGHT * dpr);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }, [frame.index, width, bitmapMap]);
  return (
    <span
      className="relative shrink-0"
      style={{ width, height: TREE_THUMB_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        style={{ width, height: TREE_THUMB_HEIGHT }}
        className="rounded border border-border"
      />
      {frame.dependency?.rects?.map((r) => (
        <span
          key={`${r.x},${r.y},${r.w},${r.h}`}
          className="pointer-events-none absolute border border-red-500 bg-red-500/20"
          style={{
            left: `${(r.x / frame.width) * 100}%`,
            // Rect coords are in the stored bottom-up space; flip for display.
            top: `${((frame.height - r.y - r.h) / frame.height) * 100}%`,
            width: `${(r.w / frame.width) * 100}%`,
            height: `${(r.h / frame.height) * 100}%`,
          }}
        />
      ))}
    </span>
  );
};

type TreeNode = {
  frame: SlideFrameMeta;
  children: TreeNode[];
};

const buildForest = (frames: SlideFrameMeta[]): TreeNode[] => {
  const nodes = new Map<number, TreeNode>();
  for (const frame of frames) nodes.set(frame.index, { frame, children: [] });
  const roots: TreeNode[] = [];
  for (const frame of frames) {
    const node = nodes.get(frame.index);
    if (!node) continue;
    const baseIndex = frame.dependency?.baseIndex;
    const parent = baseIndex !== undefined ? nodes.get(baseIndex) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
};

const LINE = "bg-muted-foreground/60";

const NodeView: FC<{
  node: TreeNode;
  bitmapMap: BitmapMap;
  selectedIndex: number;
  onSelectFrame: (index: number) => void;
}> = ({ node, bitmapMap, selectedIndex, onSelectFrame }) => {
  const { frame } = node;
  const dep = frame.dependency;
  const selected = frame.index === selectedIndex;
  return (
    <div className="flex flex-col items-center">
      <div
        className={`flex flex-col items-center gap-1 rounded border-2 p-2 text-sm ${selected ? "border-blue-500 bg-blue-500/10" : "border-transparent"}`}
      >
        <button
          type="button"
          onClick={() => onSelectFrame(frame.index)}
          className="flex cursor-pointer flex-col items-center gap-1"
        >
          <TreeThumbnail frame={frame} bitmapMap={bitmapMap} />
          <span className="font-semibold">スライド {frame.index + 1}</span>
        </button>
        <div className="flex flex-wrap justify-center gap-1">
          <span
            className={`rounded px-1 text-xs ${dep?.kind === "cropped" ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-green-500/20 text-green-700 dark:text-green-300"}`}
          >
            {dep?.kind === "cropped"
              ? `差分 (${dep.rectCount} 領域)`
              : "マスター"}
          </span>
          {dep?.animations?.map((a) => (
            <span
              key={`${a.id}-${a.x}-${a.y}`}
              className="rounded bg-purple-500/20 px-1 text-xs text-purple-700 dark:text-purple-300"
              title={`位置 (${a.x},${a.y}) ${a.w}×${a.h}`}
            >
              アニメ {a.id} ({a.frameCount}f / {a.fps}fps)
            </span>
          ))}
        </div>
        {dep?.rects && dep.rects.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              差分領域 ({dep.rects.length}・原点は左下)
            </summary>
            <ul className="font-mono">
              {dep.rects.map((r) => (
                <li key={`${r.x},${r.y},${r.w},${r.h}`}>
                  ({r.x}, {r.y}) {r.w}×{r.h}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {node.children.length > 0 && (
        <>
          <span className={`h-4 w-px ${LINE}`} />
          <div className="flex items-start">
            {node.children.map((child, i) => {
              const n = node.children.length;
              return (
                <div
                  key={child.frame.index}
                  className="relative flex flex-col items-center px-2 pt-4"
                >
                  {/* horizontal bar segment + vertical drop to the child */}
                  {n > 1 && (
                    <span
                      className={`absolute top-0 h-px ${LINE} ${i === 0 ? "left-1/2 right-0" : i === n - 1 ? "left-0 right-1/2" : "left-0 right-0"}`}
                    />
                  )}
                  <span className={`absolute top-0 h-4 w-px ${LINE}`} />
                  <NodeView
                    node={child}
                    bitmapMap={bitmapMap}
                    selectedIndex={selectedIndex}
                    onSelectFrame={onSelectFrame}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

const MIN_SCALE = 0.2;
const MAX_SCALE = 2;
const DRAG_THRESHOLD = 4;

type View = { x: number; y: number; scale: number };
const INITIAL_VIEW: View = { x: 16, y: 16, scale: 1 };

/** Mermaid-like canvas: drag to pan, wheel to zoom. */
const PanZoomCanvas: FC<{ children: ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [dragging, setDragging] = useState(false);
  const movedRef = useRef(false);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  // Native non-passive listener so the page does not scroll while zooming.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(
        e.clientX - rect.left,
        e.clientY - rect.top,
        Math.exp(-e.deltaY * 0.002),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let lastX = startX;
    let lastY = startY;
    movedRef.current = false;
    const onMove = (ev: PointerEvent) => {
      if (
        !movedRef.current &&
        Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD
      )
        return;
      movedRef.current = true;
      setDragging(true);
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const zoomCenter = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    zoomAt(el.clientWidth / 2, el.clientHeight / 2, factor);
  };

  return (
    <div className="relative mt-2">
      <div
        ref={containerRef}
        role="application"
        aria-label="フレーム依存関係ツリー（ドラッグで移動、ホイールで拡大縮小）"
        className={`h-[480px] touch-none select-none overflow-hidden rounded border border-border bg-card text-card-foreground ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onPointerDown}
        // A drag must not be interpreted as a click on a node.
        onClickCapture={(e) => {
          if (movedRef.current) {
            e.stopPropagation();
            e.preventDefault();
            movedRef.current = false;
          }
        }}
      >
        <div
          className="w-max origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {children}
        </div>
      </div>
      <div className="absolute right-2 top-2 flex gap-1">
        <button
          type="button"
          onClick={() => zoomCenter(1.25)}
          className="h-7 w-7 cursor-pointer rounded border border-border bg-card text-card-foreground text-sm shadow-sm"
          aria-label="拡大"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomCenter(0.8)}
          className="h-7 w-7 cursor-pointer rounded border border-border bg-card text-card-foreground text-sm shadow-sm"
          aria-label="縮小"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setView(INITIAL_VIEW)}
          className="h-7 cursor-pointer rounded border border-border bg-card px-2 text-xs text-card-foreground shadow-sm"
        >
          リセット
        </button>
      </div>
    </div>
  );
};

/** Tree view of frame dependencies (master → cropped frames referencing it as base). */
export const DependencyTree: FC<{
  frames: SlideFrameMeta[];
  bitmapMap: BitmapMap;
  selectedIndex: number;
  onSelectFrame: (index: number) => void;
}> = ({ frames, bitmapMap, selectedIndex, onSelectFrame }) => {
  const roots = useMemo(() => buildForest(frames), [frames]);
  // Only meaningful for EIA files that carry dependency info.
  if (!frames.some((f) => f.dependency)) return null;

  return (
    <details className="rounded bg-secondary p-2">
      <summary className="cursor-pointer text-sm font-semibold">
        フレーム依存関係
      </summary>
      <PanZoomCanvas>
        {/* Masters (roots) are laid out side by side in a single row. */}
        <div className="flex items-start gap-12">
          {roots.map((root) => (
            <NodeView
              key={root.frame.index}
              node={root}
              bitmapMap={bitmapMap}
              selectedIndex={selectedIndex}
              onSelectFrame={onSelectFrame}
            />
          ))}
        </div>
      </PanZoomCanvas>
    </details>
  );
};
