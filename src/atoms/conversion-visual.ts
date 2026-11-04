import type { WorkerResponse } from "@/_types/worker";
import { atom } from "jotai";

export type ConversionGraph = Extract<
  WorkerResponse,
  { type: "compress-graph" }
>;
export const ConversionVisualAtom = atom<{
  count: number;
  visibleCount: number;
  graph: ConversionGraph | null;
} | null>(null);
