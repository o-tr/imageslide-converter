import type { WorkerResponse } from "@/_types/worker";

type Graph = Extract<WorkerResponse, { type: "compress-graph" }>;
type GraphItem = Extract<WorkerResponse, { type: "compress-graph-item" }>;

/** Collect per-slide worker messages and publish at most once per animation frame. */
export function createGraphProgress(
  publish: (graph: Graph) => void,
  schedule: (callback: () => void) => number = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
) {
  let current: Graph | undefined;
  let frame: number | undefined;
  const cancelFrame = () => {
    if (frame !== undefined) cancel(frame);
    frame = undefined;
  };
  return {
    snapshot(graph: Graph) {
      cancelFrame();
      if (graph.stage === "planned") {
        current = {
          ...graph,
          parents: graph.parents.slice(),
          resolved: graph.resolved?.slice() ?? graph.parents.map(() => false),
        };
        publish(graph);
      } else {
        current = undefined;
        publish(graph);
      }
    },
    item(item: GraphItem) {
      if (
        !current?.resolved ||
        item.index < 0 ||
        item.index >= current.parents.length ||
        !Number.isInteger(item.index)
      )
        return;
      current.parents[item.index] = item.parent;
      current.resolved[item.index] = true;
      if (frame !== undefined) return;
      frame = schedule(() => {
        frame = undefined;
        if (current)
          publish({
            ...current,
            parents: current.parents.slice(),
            resolved: current.resolved?.slice(),
          });
      });
    },
    dispose: cancelFrame,
  };
}
