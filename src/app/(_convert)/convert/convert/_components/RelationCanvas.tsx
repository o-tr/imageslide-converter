import type { WorkerResponse } from "@/_types/worker";
import { useEffect, useRef } from "react";
import {
  descendantOutwardForce,
  labelRepulsion,
  nodeRepulsion,
  relationAncestry,
  relationGroups,
  relationTargets,
} from "./relationLayout";

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
    const velocities: { x: number; y: number }[] = [];
    let previousGraph: Graph | null = null;
    let previousWidth = 0;
    let previousHeight = 0;
    let previousLabelWidth = 0;
    let previousLabelHeight = 0;
    let targets: ReturnType<typeof relationTargets> = [];
    let groups: number[][] = [];
    let ancestry: ReturnType<typeof relationAncestry> = [];
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
      const label = document
        .querySelector("[data-relation-label]")
        ?.getBoundingClientRect();
      const canvasRect = label ? element.getBoundingClientRect() : null;
      const labelWidth = label?.width ?? 440;
      const labelHeight = label?.height ?? 230;
      const ready = (i: number) =>
        data?.stage === "final" || !!data?.resolved?.[i];
      if (
        data !== previousGraph ||
        width !== previousWidth ||
        height !== previousHeight ||
        labelWidth !== previousLabelWidth ||
        labelHeight !== previousLabelHeight
      ) {
        targets = data
          ? relationTargets(
              data.parents,
              data.parents.map((_, i) => ready(i)),
              width,
              height,
            )
          : [];
        groups = data
          ? relationGroups(
              data.parents,
              data.parents.map((_, i) => ready(i)),
            )
          : [];
        ancestry = data
          ? relationAncestry(
              data.parents,
              data.parents.map((_, i) => ready(i)),
            )
          : [];
        previousGraph = data;
        previousWidth = width;
        previousHeight = height;
        previousLabelWidth = labelWidth;
        previousLabelHeight = labelHeight;
      }
      const current = Array.from({ length: count }, (_, i) => {
        const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
        return (
          positions[i] ?? {
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
          }
        );
      });
      const forces = current.map(() => ({ x: 0, y: 0 }));
      // Only compare nodes in nearby cells, keeping the simulation responsive for large decks.
      const cells = new Map<string, number[]>();
      const cellSize = 120;
      for (let i = 0; i < Math.min(count, visible.current); i++) {
        const point = current[i];
        const column = Math.floor(point.x / cellSize);
        const row = Math.floor(point.y / cellSize);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            for (const other of cells.get(`${column + dx},${row + dy}`) ?? []) {
              const force = nodeRepulsion(
                point,
                current[other],
                (i + other * 7) * 2.4,
                {
                  directlyLinked:
                    !!data &&
                    ready(i) &&
                    ready(other) &&
                    (data.parents[i] === other || data.parents[other] === i),
                  bothKeyframes:
                    !!data &&
                    ready(i) &&
                    ready(other) &&
                    data.parents[i] === null &&
                    data.parents[other] === null,
                },
              );
              forces[i].x += force.x;
              forces[i].y += force.y;
              forces[other].x -= force.x;
              forces[other].y -= force.y;
            }
          }
        const key = `${column},${row}`;
        const cell = cells.get(key) ?? [];
        cell.push(i);
        cells.set(key, cell);
      }
      data?.parents.forEach((parent, i) => {
        if (parent === null || !ready(i) || !ready(parent) || !current[parent])
          return;
        const dx = current[parent].x - current[i].x;
        const dy = current[parent].y - current[i].y;
        const distance = Math.hypot(dx, dy);
        if (distance < 0.001) return;
        const pull = (distance - 65) * 0.015;
        forces[i].x += (dx / distance) * pull;
        forces[i].y += (dy / distance) * pull;
        forces[parent].x -= (dx / distance) * pull;
        forces[parent].y -= (dy / distance) * pull;
      });
      ancestry.forEach((item, i) => {
        if (!item || item.depth === 0 || !current[item.root]) return;
        const force = descendantOutwardForce(
          current[item.root],
          current[i],
          item.depth,
          (i / Math.max(count, 1)) * Math.PI * 2,
        );
        forces[i].x += force.x;
        forces[i].y += force.y;
      });
      if (label && canvasRect) {
        const labelBounds = {
          left: label.left - canvasRect.left,
          top: label.top - canvasRect.top,
          right: label.right - canvasRect.left,
          bottom: label.bottom - canvasRect.top,
        };
        groups.forEach((group, groupIndex) => {
          if (!group.length) return;
          const center = group.reduce(
            (sum, index) => ({
              x: sum.x + current[index].x / group.length,
              y: sum.y + current[index].y / group.length,
            }),
            { x: 0, y: 0 },
          );
          const angle =
            (groupIndex / Math.max(groups.length, 1)) * Math.PI * 2 -
            Math.PI / 2;
          const force = labelRepulsion(center, labelBounds, angle);
          for (const index of group) {
            forces[index].x += force.x;
            forces[index].y += force.y;
          }
        });
      }
      positions = current.map((old, i) => {
        const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
        const target = targets[i] ?? {
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        };
        const velocity = velocities[i] ?? { x: 0, y: 0 };
        velocity.x =
          (velocity.x + (target.x - old.x) * 0.002 + forces[i].x) * 0.78;
        velocity.y =
          (velocity.y + (target.y - old.y) * 0.002 + forces[i].y) * 0.78;
        // Cap motion so a large change in the graph does not pull nodes abruptly.
        const speed = Math.hypot(velocity.x, velocity.y);
        const maxSpeed = 1.8;
        if (speed > maxSpeed) {
          velocity.x *= maxSpeed / speed;
          velocity.y *= maxSpeed / speed;
        }
        velocities[i] = velocity;
        return {
          x: Math.max(12, Math.min(width - 12, old.x + velocity.x)),
          y: Math.max(12, Math.min(height - 12, old.y + velocity.y)),
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
