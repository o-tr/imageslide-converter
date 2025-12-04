export interface TypedWorkerClientMethodMap {
  init: {
    request: TypedWorkerClientMethodInit;
    response: TypedWorkerWorkerResponseInit;
  };
  ping: {
    request: TypedWorkerClientMethodPing;
    response: TypedWorkerWorkerResponsePing;
  };
  "convert-dxt1": {
    request: TypedWorkerClientMethodConvertDXT1;
    response: TypedWorkerWorkerResponseConvertDXT1;
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

export type TypedWorkerClientMethodConvertDXT1 = {
  type: "convert-dxt1";
  requestId: string;
  bitmap: ImageBitmap;
};

export type TypedWorkerWorkerResponseConvertDXT1 = {
  type: "convert-dxt1";
  requestId: string;
  buffer: ArrayBufferLike;
  width: number;
  height: number;
  transfer?: Transferable[];
};
