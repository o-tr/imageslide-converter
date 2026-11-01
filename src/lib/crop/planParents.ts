import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { diff2boundingBox } from "@/lib/crop/diff2boundingBox";
import { mergeOverlapBoundingBox } from "@/lib/crop/mergeOverlapBoundingBox";
import { optimizeBoundingBox } from "@/lib/crop/optimizeBoundingBox";
import { shrinkOverlapBoundingBox } from "@/lib/crop/shrinkOverlapBoundingBox";
import { rgb242diff } from "@/lib/rawImage2Diff/rgb242diff";
import { computeThumbnail } from "./computeThumbnail";
import { computeThumbnailSimilarity } from "./computeThumbnailSimilarity";

/**
 * A dependency forest over a slide sequence. `parents[pos]` is the position of
 * the slide that `pos` is encoded against, or null for a master (keyframe).
 * A parent may have any number of children. `order` lists positions so that
 * every parent precedes its children.
 */
export type ParentPlan = {
  order: number[];
  parents: (number | null)[];
  depths: number[];
  /** Estimated bytes (edge costs without depth penalty). */
  estimatedCost: number;
};

export type PlanParentsOptions = {
  /** Compressed-size estimator for a payload; a cheap one is fine. */
  estimateSize: (payload: Uint8Array) => number;
  thumbnailGridSize?: number;
  /** Candidate parents per slide taken from the thumbnail ranking. */
  neighbors?: number;
  /** Always consider this many slides on each side in sequence order. */
  sequenceNeighbors?: number;
  maxDepth?: number;
  /** Extra cost in bytes per level of dependency chain a slide sits at. */
  depthPenalty?: number;
  /** Cost in bytes per decoded (uncompressed) byte. */
  decodeWeight?: number;
  /** Fixed JSON/metadata cost estimates in bytes. */
  masterOverhead?: number;
  deltaOverhead?: number;
  rectOverhead?: number;
};

/**
 * Cost of encoding `child` as a delta against `parent`, or null when the
 * delta degenerates into a full-frame rectangle (a master is never worse).
 */
export const deltaCost = (
  child: RawImageObjV1,
  parent: RawImageObjV1,
  o: Required<PlanParentsOptions>,
): number | null => {
  const { width, height } = child.rect;
  const stats = { count: 0, stopAt: Number.POSITIVE_INFINITY };
  const diff = rgb242diff(parent, child, stats);
  if (stats.count === 0) return o.deltaOverhead + o.rectOverhead;
  const boxes = optimizeBoundingBox(
    mergeOverlapBoundingBox(
      shrinkOverlapBoundingBox(
        diff2boundingBox(diff, width, height, 0, true, true),
      ),
    ),
    child.rect,
  );
  if (boxes.length === 0) return o.deltaOverhead + o.rectOverhead;
  if (boxes[0].area === width * height) return null;
  let total = 0;
  for (const box of boxes) total += box.width * box.height * 3;
  const payload = new Uint8Array(total);
  let offset = 0;
  for (const box of boxes) {
    const rowBytes = box.width * 3;
    for (let row = 0; row < box.height; row++) {
      const src = ((box.y1 + row) * width + box.x1) * 3;
      payload.set(child.buffer.subarray(src, src + rowBytes), offset);
      offset += rowBytes;
    }
  }
  return (
    o.estimateSize(payload) +
    o.deltaOverhead +
    o.rectOverhead * boxes.length +
    o.decodeWeight * total
  );
};

/**
 * Build a minimum-cost dependency forest. Every slide may either be a master
 * (edge from a virtual root) or a delta against a similar slide anywhere in the
 * deck; Prim's algorithm from the virtual root picks both the parents and the
 * keyframes at once, subject to a depth limit and a per-depth penalty.
 */
export const planParents = (
  rawImages: RawImageObjV1[],
  options: PlanParentsOptions,
): ParentPlan => {
  const o: Required<PlanParentsOptions> = {
    thumbnailGridSize: 32,
    neighbors: 4,
    sequenceNeighbors: 1,
    maxDepth: 3,
    depthPenalty: 1500,
    decodeWeight: 0.01,
    masterOverhead: 60,
    deltaOverhead: 70,
    rectOverhead: 40,
    ...options,
  };
  const n = rawImages.length;
  const thumbnails = rawImages.map((image) =>
    computeThumbnail(
      image.buffer,
      image.rect.width,
      image.rect.height,
      o.thumbnailGridSize,
    ),
  );
  const sameSize = (a: number, b: number) =>
    rawImages[a].rect.width === rawImages[b].rect.width &&
    rawImages[a].rect.height === rawImages[b].rect.height;

  const masterCost = rawImages.map(
    (image) =>
      o.estimateSize(image.buffer) +
      o.masterOverhead +
      o.decodeWeight * image.buffer.length,
  );

  // Candidate parents per child, with estimated delta cost.
  const edges: { parent: number; cost: number }[][] = [];
  for (let c = 0; c < n; c++) {
    const ranked: { p: number; sad: number }[] = [];
    for (let p = 0; p < n; p++) {
      if (p === c || !sameSize(p, c)) continue;
      ranked.push({
        p,
        sad: computeThumbnailSimilarity(thumbnails[p], thumbnails[c]),
      });
    }
    ranked.sort((a, b) => a.sad - b.sad);
    const chosen = new Set(ranked.slice(0, o.neighbors).map((r) => r.p));
    for (let d = 1; d <= o.sequenceNeighbors; d++) {
      for (const p of [c - d, c + d]) {
        if (p >= 0 && p < n && sameSize(p, c)) chosen.add(p);
      }
    }
    const list: { parent: number; cost: number }[] = [];
    for (const p of chosen) {
      const cost = deltaCost(rawImages[c], rawImages[p], o);
      if (cost !== null && cost < masterCost[c]) list.push({ parent: p, cost });
    }
    edges.push(list);
  }

  // Prim from the virtual root.
  const inTree = new Array<boolean>(n).fill(false);
  const parents = new Array<number | null>(n).fill(null);
  const depths = new Array<number>(n).fill(0);
  const best = masterCost.map((cost) => ({
    cost,
    parent: null as number | null,
  }));
  const order: number[] = [];
  for (let step = 0; step < n; step++) {
    let pick = -1;
    for (let c = 0; c < n; c++) {
      if (!inTree[c] && (pick < 0 || best[c].cost < best[pick].cost)) pick = c;
    }
    inTree[pick] = true;
    const parent = best[pick].parent;
    parents[pick] = parent;
    depths[pick] = parent === null ? 0 : depths[parent] + 1;
    order.push(pick);
    if (depths[pick] >= o.maxDepth) continue;
    for (let c = 0; c < n; c++) {
      if (inTree[c]) continue;
      for (const edge of edges[c]) {
        if (edge.parent !== pick) continue;
        const cost = edge.cost + o.depthPenalty * (depths[pick] + 1);
        if (cost < best[c].cost) best[c] = { cost, parent: pick };
      }
    }
  }

  // Prim is greedy and can leave cheaper reattachments unused (especially
  // under a depth limit), so improve the forest by local search: move a slide
  // under another candidate parent (or make it a master) while the total cost,
  // including the per-depth penalty of its whole subtree, keeps falling.
  const edgeCost = (c: number, p: number | null) =>
    p === null
      ? masterCost[c]
      : (edges[c].find((e) => e.parent === p)?.cost ??
        Number.POSITIVE_INFINITY);
  const children: number[][] = Array.from({ length: n }, () => []);
  const rebuildChildren = () => {
    for (const list of children) list.length = 0;
    for (let c = 0; c < n; c++) {
      const p = parents[c];
      if (p !== null) children[p].push(c);
    }
  };
  const subtree = (root: number) => {
    const nodes = [root];
    const heights = new Map<number, number>([[root, 0]]);
    for (let k = 0; k < nodes.length; k++) {
      for (const child of children[nodes[k]]) {
        heights.set(child, (heights.get(nodes[k]) as number) + 1);
        nodes.push(child);
      }
    }
    return { nodes, height: Math.max(...heights.values()) };
  };
  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    rebuildChildren();
    for (let c = 0; c < n; c++) {
      const { nodes, height } = subtree(c);
      const inSub = new Set(nodes);
      const oldCost =
        edgeCost(c, parents[c]) + o.depthPenalty * depths[c] * nodes.length;
      let bestMove: { p: number | null; cost: number } | null = null;
      const options: (number | null)[] = [
        null,
        ...edges[c].map((e) => e.parent),
      ];
      for (const p of options) {
        if (p === parents[c] || (p !== null && inSub.has(p))) continue;
        const depth = p === null ? 0 : depths[p] + 1;
        if (depth + height > o.maxDepth) continue;
        const cost = edgeCost(c, p) + o.depthPenalty * depth * nodes.length;
        if (cost < (bestMove?.cost ?? oldCost) - 1e-9) bestMove = { p, cost };
      }
      if (bestMove) {
        parents[c] = bestMove.p;
        const base = bestMove.p === null ? 0 : depths[bestMove.p] + 1;
        const shift = base - depths[c];
        for (const node of nodes) depths[node] += shift;
        rebuildChildren();
        improved = true;
      }
    }
    if (!improved) break;
  }
  // Re-derive a parents-first order (local search may have reordered ancestry).
  const finalOrder: number[] = [];
  rebuildChildren();
  const stack = parents.flatMap((p, c) => (p === null ? [c] : []));
  while (stack.length > 0) {
    const c = stack.shift() as number;
    finalOrder.push(c);
    stack.push(...children[c]);
  }
  let estimatedCost = 0;
  for (let c = 0; c < n; c++) estimatedCost += edgeCost(c, parents[c]);
  return { order: finalOrder, parents, depths, estimatedCost };
};
