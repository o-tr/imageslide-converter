import type { TypedWorkerWorker } from "@/_types/lib/worker/typedWorker";
import { registerInitHandler } from "@/worker/tasks/init";
import { registerPingHandler } from "@/worker/tasks/ping";

const worker = self as unknown as TypedWorkerWorker;

registerInitHandler(worker);
registerPingHandler(worker);
