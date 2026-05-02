import type { TypedWorkerWorker } from "@/_types/lib/worker/typedWorker";
import { setWorkerId } from "@/worker/env";

export const registerInitHandler = (worker: TypedWorkerWorker) => {
  worker.addEventListener("message", (event) => {
    if (event.data.type !== "init") return;
    setWorkerId(event.data.threadId);
    worker.postMessage({
      type: "init",
      requestId: event.data.requestId,
    });
  });
};
