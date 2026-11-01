import type {
  TypedWorkerClientMessage,
  TypedWorkerClientMethodMap,
  TypedWorkerClientResponseExecute,
  TypedWorkerWorker,
  TypedWorkerWorkerResponse,
} from "@/_types/lib/worker";
import { createId } from "@/lib/createId";

const worker = this as unknown as TypedWorkerWorker;

export const executeClientTask = async <
  T extends keyof TypedWorkerClientMethodMap,
>(
  message: TypedWorkerClientMethodMap[T]["request"],
  transfer?: Transferable[],
): Promise<TypedWorkerClientMethodMap[T]["response"]> => {
  let resolve: (value: TypedWorkerWorkerResponse) => void;
  const executeTaskId = createId();
  const promise = new Promise<TypedWorkerWorkerResponse>((_resolve) => {
    resolve = _resolve;
  });
  const onMessage = ({ data }: MessageEvent<TypedWorkerClientMessage>) => {
    if (
      !((data): data is TypedWorkerClientResponseExecute =>
        data.requestId === executeTaskId)(data)
    )
      return;
    worker.removeEventListener("message", onMessage);
    resolve(data.result);
  };
  worker.addEventListener("message", onMessage);
  worker.postMessage(
    {
      type: "execute",
      task: message,
      requestId: executeTaskId,
      transfer,
    },
    transfer,
  );
  return promise;
};
