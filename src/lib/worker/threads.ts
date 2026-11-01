import type {
  TypedWorkerClient,
  TypedWorkerWorkerMessage,
} from "@/_types/lib/worker/typedWorker";
import { createId } from "@/lib/createId";
import { registerExecuteHandler } from "@/lib/worker/tasks/execute";

let workerReadyResolve: () => void = () => {};
export const workerReadyPromise: Promise<void> = new Promise((resolve) => {
  workerReadyResolve = resolve;
});

export const threads = Array.from(
  { length: navigator.hardwareConcurrency },
  (_, i) => {
    const worker = (
      typeof window !== "undefined"
        ? new Worker(new URL("../../worker/worker.ts", import.meta.url), {
            type: "module",
          })
        : undefined
    ) as TypedWorkerClient;
    if (!worker) {
      return;
    }
    registerExecuteHandler(worker);
    const requestId = createId();
    worker.postMessage({
      type: "init",
      threadId: i,
      requestId,
    });
    const onMessage = (event: MessageEvent<TypedWorkerWorkerMessage>) => {
      if (event.data.requestId !== requestId) return;
      if (event.data.type !== "init") return;
      worker.removeEventListener("message", onMessage);
      if (!threads[i]) return;
      threads[i].isReady = true;
      const readyCount = threads.filter((thread) => thread?.isReady).length;
      if (readyCount === threads.length) {
        workerReadyResolve();
        console.log("worker ready");
      }
    };

    worker.addEventListener("message", onMessage);
    return {
      id: i,
      worker,
      isReady: false,
      isBusy: false,
    };
  },
).filter(
  (
    thread,
  ): thread is {
    worker: TypedWorkerClient;
    isReady: boolean;
    isBusy: boolean;
    id: number;
  } => !!thread,
);

export const getAvailableThread = async () => {
  await workerReadyPromise;
  const thread = threads.find((thread) => !thread.isBusy);
  if (!thread) {
    return undefined;
  }
  thread.isBusy = true;
  return thread;
};
