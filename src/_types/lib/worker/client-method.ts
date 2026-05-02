export interface TypedWorkerClientMethodMap {
  init: {
    request: TypedWorkerClientMethodInit;
    response: TypedWorkerWorkerResponseInit;
  };
  ping: {
    request: TypedWorkerClientMethodPing;
    response: TypedWorkerWorkerResponsePing;
  };
}
export type TypedWorkerClientMethod =
  TypedWorkerClientMethodMap[keyof TypedWorkerClientMethodMap]["request"];
export type TypedWorkerWorkerResponse =
  TypedWorkerClientMethodMap[keyof TypedWorkerClientMethodMap]["response"];

export type TypedWorkerClientMethodInit = {
  type: "init";
  threadId: number;
  requestId: string;
};

export type TypedWorkerWorkerResponseInit = {
  type: "init";
  requestId: string;
  transfer?: Transferable[];
};

export type TypedWorkerClientMethodPing = {
  type: "ping";
  requestId: string;
};

export type TypedWorkerWorkerResponsePing = {
  type: "ping";
  requestId: string;
  transfer?: Transferable[];
};
