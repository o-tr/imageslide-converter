import { describe, expect, it, vi } from "vitest";
import { createGraphProgress } from "./graphProgress";

describe("graph progress", () => {
  it("batches slide updates and preserves previously published snapshots", () => {
    const publish = vi.fn();
    let callback: (() => void) | undefined;
    const schedule = vi.fn((fn: () => void) => {
      callback = fn;
      return 1;
    });
    const cancel = vi.fn();
    const progress = createGraphProgress(publish, schedule, cancel);
    const initial = {
      type: "compress-graph" as const,
      stage: "planned" as const,
      parents: [null, 0, 1],
      resolved: [false, false, false],
    };
    progress.snapshot(initial);
    progress.item({ type: "compress-graph-item", index: 1, parent: null });
    progress.item({ type: "compress-graph-item", index: 2, parent: 1 });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(initial).toEqual({
      type: "compress-graph",
      stage: "planned",
      parents: [null, 0, 1],
      resolved: [false, false, false],
    });
    callback?.();
    expect(publish).toHaveBeenLastCalledWith({
      type: "compress-graph",
      stage: "planned",
      parents: [null, null, 1],
      resolved: [false, true, true],
    });
    progress.item({ type: "compress-graph-item", index: 0, parent: null });
    expect(publish.mock.calls[1][0].resolved).toEqual([false, true, true]);
  });

  it("cancels a pending batch before publishing the final graph", () => {
    const publish = vi.fn();
    const cancel = vi.fn();
    const progress = createGraphProgress(publish, () => 5, cancel);
    progress.snapshot({
      type: "compress-graph",
      stage: "planned",
      parents: [null],
      resolved: [false],
    });
    progress.item({ type: "compress-graph-item", index: 0, parent: null });
    const final = {
      type: "compress-graph" as const,
      stage: "final" as const,
      parents: [null],
      rawBytes: 10,
      payloadBytes: 5,
    };
    progress.snapshot(final);
    expect(cancel).toHaveBeenCalledWith(5);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith(final);
  });
});
