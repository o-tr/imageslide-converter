import type { WorkerResponse } from "@/_types/worker";
import { useEffect, useRef } from "react";

type Graph = Extract<WorkerResponse, { type: "compress-graph" }>;

export function RelationCanvas({
  count,
  graph,
  visibleCount = count,
}: { count: number; graph: Graph | null; visibleCount?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(graph);
  const visible = useRef(visibleCount);
  latest.current = graph;
  visible.current = visibleCount;
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    let frame = 0;
    let positions: { x: number; y: number }[] = [];
    const opacity: number[] = [];
    const draw = (time: number) => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (
        element.width !== Math.round(width * dpr) ||
        element.height !== Math.round(height * dpr)
      ) {
        element.width = Math.round(width * dpr);
        element.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.max(60, Math.min(width, height) * 0.4);
      const data = latest.current;
      const ready = (i: number) =>
        data?.stage === "final" || !!data?.resolved?.[i];
      positions = Array.from({ length: count }, (_, i) => {
        const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
        const targetRadius = ready(i)
          ? radius * (0.24 + (i % 4) * 0.12)
          : radius;
        const target = {
          x: cx + Math.cos(angle) * targetRadius,
          y: cy + Math.sin(angle) * targetRadius,
        };
        const old = positions[i] ?? {
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        };
        return {
          x: old.x + (target.x - old.x) * 0.035,
          y: old.y + (target.y - old.y) * 0.035,
        };
      });
      context.lineWidth = 1.3;
      data?.parents.forEach((parent, i) => {
        if (parent === null || !ready(i) || !positions[parent]) return;
        context.beginPath();
        context.moveTo(positions[parent].x, positions[parent].y);
        context.lineTo(positions[i].x, positions[i].y);
        context.strokeStyle = "rgba(45, 212, 191, 0.46)";
        context.stroke();
      });
      positions.forEach((point, i) => {
        if (i >= visible.current) return;
        opacity[i] = Math.min(1, (opacity[i] ?? 0) + 0.04);
        context.globalAlpha = opacity[i];
        const active = ready(i);
        const size = Math.max(5, Math.min(12, 110 / Math.sqrt(count)));
        context.beginPath();
        context.arc(
          point.x,
          point.y,
          size + (active ? 2 * Math.sin(time / 650 + i) : 0),
          0,
          Math.PI * 2,
        );
        context.fillStyle = active
          ? data?.parents[i] === null
            ? "rgba(129, 140, 248, .9)"
            : "rgba(45, 212, 191, .9)"
          : "rgba(148, 163, 184, .45)";
        context.fill();
        if (count <= 70) {
          context.font = "11px sans-serif";
          context.fillStyle = "rgba(148, 163, 184, .95)";
          context.textAlign = "center";
          context.fillText(String(i + 1), point.x, point.y - size - 5);
        }
      });
      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [count]);
  return <canvas ref={canvas} className="absolute inset-0 h-full w-full" />;
}
