import type { BoundingBox } from "@/_types/lib/crop";
import { mergeTwoBoundingBox } from "@/lib/crop/mergeTwoBoundingBox";

type Entry = {
  box: BoundingBox;
  order: number;
  initialized: boolean;
  best?: Entry;
  cost: number;
};

// Use the same area formula as mergeTwoBoundingBox without allocating a box
// for every pair that is considered and then discarded.
const extraSpace = (a: BoundingBox, b: BoundingBox): number =>
  (Math.max(a.x2, b.x2) - Math.min(a.x1, b.x1)) *
    (Math.max(a.y2, b.y2) - Math.min(a.y1, b.y1)) -
  (a.area + b.area);

export const mergeBoundingBoxByLimit = (
  boxes: BoundingBox[],
  limit: number,
): BoundingBox[] => {
  const entries: Entry[] = structuredClone(boxes).map((box, order) => ({
    box,
    order,
    initialized: false,
    cost: Number.POSITIVE_INFINITY,
  }));

  // Each active row caches its earliest minimum among later entries. Stable
  // original order preserves the previous nested loops' tie-breaking.
  const recalculate = (index: number) => {
    const entry = entries[index];
    entry.initialized = true;
    entry.best = undefined;
    entry.cost = Number.POSITIVE_INFINITY;
    for (let j = index + 1; j < entries.length; j++) {
      const other = entries[j];
      const cost = extraSpace(entry.box, other.box);
      if (cost < entry.cost) {
        entry.cost = cost;
        entry.best = other;
      }
    }
  };

  let start = Math.max(0, entries.length - 200);
  for (let i = start; i < entries.length; i++) recalculate(i);
  while (entries.length > limit) {
    let best: Entry | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let i = start; i < entries.length; i++) {
      if (entries[i].cost < bestCost) {
        best = entries[i];
        bestCost = best.cost;
      }
    }
    if (!best?.best) break;

    const removed = best.best;
    const removedIndex = entries.indexOf(removed, start);
    best.box = mergeTwoBoundingBox(best.box, removed.box);
    entries.splice(removedIndex, 1);
    start = Math.max(0, entries.length - 200);
    for (let i = start; i < entries.length; i++) {
      const entry = entries[i];
      if (
        !entry.initialized ||
        entry === best ||
        entry.best === best ||
        entry.best === removed
      ) {
        recalculate(i);
      } else if (entry.order < best.order) {
        // All other pairs are unchanged; only the merged box can become the
        // new minimum for an earlier row. Preserve its original tie order.
        const cost = extraSpace(entry.box, best.box);
        if (
          cost < entry.cost ||
          (cost === entry.cost && entry.best && best.order < entry.best.order)
        ) {
          entry.cost = cost;
          entry.best = best;
        }
      }
    }
  }
  return entries.map((entry) => entry.box);
};
