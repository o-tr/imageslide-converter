import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("keeps one host instance, starts both downloads and forwards messages", async () => {
  const elements: {
    tag: string;
    style: Record<string, string>;
    dataset: Record<string, string>;
    children: unknown[];
    append: (...items: unknown[]) => void;
    attachShadow: () => unknown;
    setAttribute: () => void;
  }[] = [];
  const makeElement = (tag: string) => {
    const element = {
      tag,
      style: {},
      dataset: {},
      children: [] as unknown[],
      append(...items: unknown[]) {
        this.children.push(...items);
      },
      attachShadow() {
        const shadow = makeElement("shadow");
        this.children.push(shadow);
        return shadow;
      },
      setAttribute() {},
    };
    elements.push(element);
    return element;
  };
  const body = makeElement("body");
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  const fetchMock = vi.fn((_url: string) => new Promise(() => {}));
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { body, createElement: makeElement });
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const { deckcraftHost, sendDeckcraft, onDeckcraftEvent } = await import(
    "./host"
  );
  const first = deckcraftHost();
  expect(deckcraftHost()).toBe(first);
  expect(body.children).toEqual([first.host]);
  expect(elements.filter((element) => element.tag === "canvas")).toHaveLength(
    1,
  );
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    "/deckcraft-fonts/catalog.json",
    "/deckcraft/host-manifest.json",
  ]);
  sendDeckcraft({ type: "open", name: "one.pptx" });
  expect((win.imageSlideNext as () => unknown)()).toEqual({
    type: "open",
    name: "one.pptx",
  });
  const events: unknown[] = [];
  const unsubscribe = onDeckcraftEvent((event) => events.push(event));
  (win.imageSlideSend as (type: string, name: string, bytes: null) => void)(
    "ready",
    "",
    null,
  );
  expect(first.state.ready).toBe(true);
  expect(events).toEqual([
    { type: "ready", name: "", bytes: null, requestId: undefined },
  ]);
  sendDeckcraft({ type: "open", requestId: "old", name: "old.pptx" });
  (win.imageSlideNext as () => unknown)();
  (win.imageSlideSend as (type: string, name: string, bytes: null) => void)(
    "opened",
    "",
    null,
  );
  sendDeckcraft({ type: "open", requestId: "new", name: "new.pptx" });
  (win.imageSlideNext as () => unknown)();
  (win.imageSlideSend as (type: string, name: string, bytes: null) => void)(
    "opened",
    "",
    null,
  );
  expect(
    events.slice(1).map((event) => (event as { requestId?: string }).requestId),
  ).toEqual(["old", "new"]);
  unsubscribe();
});

it("initializes the host module with the downloaded and compiled WASM", async () => {
  const makeElement = () => ({
    style: {},
    dataset: {},
    append() {},
    attachShadow() {
      return makeElement();
    },
    setAttribute() {},
  });
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    body: makeElement(),
    createElement: makeElement,
  });
  vi.stubGlobal("location", { origin: "https://example.test" });
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
    },
  );
  const initialized = vi.fn((_value: unknown) => {
    (win.imageSlideSend as (type: string, name: string, bytes: null) => void)(
      "ready",
      "",
      null,
    );
  });
  vi.stubGlobal("__deckcraftTestInit", initialized);
  const moduleUrl = `data:text/javascript,${encodeURIComponent("export default async function(value) { globalThis.__deckcraftTestInit(value); }")}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/deckcraft-fonts/catalog.json") return new Promise(() => {});
      if (url === "/deckcraft/host-manifest.json")
        return Response.json({ module: moduleUrl, wasm: "./test_bg.wasm" });
      if (url === "https://example.test/deckcraft/test_bg.wasm")
        return new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), {
          headers: {
            "content-type": "application/wasm",
            "content-length": "8",
          },
        });
      throw new Error(`Unexpected request ${url}`);
    }),
  );
  const { deckcraftHost } = await import("./host");
  const instance = deckcraftHost();
  await vi.waitFor(() => expect(initialized).toHaveBeenCalledOnce());
  expect(initialized.mock.calls[0][0]).toEqual({
    module_or_path: expect.any(WebAssembly.Module),
  });
  await vi.waitFor(() =>
    expect(instance.state.startup.get("wasm-ready")).toBeDefined(),
  );
  expect(instance.state.startup.get("wasm-progress")).toMatchObject({
    received: 8,
    total: 8,
  });
  expect(instance.state.ready).toBe(true);
  expect(deckcraftHost()).toBe(instance);
});

it("reports a missing host build without claiming the editor is ready", async () => {
  const makeElement = () => ({
    style: {},
    dataset: {},
    append() {},
    attachShadow() {
      return makeElement();
    },
    setAttribute() {},
  });
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    body: makeElement(),
    createElement: makeElement,
  });
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/deckcraft-fonts/catalog.json") return new Promise(() => {});
      return new Response(null, { status: 404 });
    }),
  );
  const { deckcraftHost, onDeckcraftEvent } = await import("./host");
  const events: unknown[] = [];
  const unsubscribe = onDeckcraftEvent((event) => events.push(event));
  const host = deckcraftHost();
  await vi.waitFor(() =>
    expect(host.state.startup.get("wasm-error")).toMatchObject({
      message: expect.stringContaining("ビルドが見つかりません"),
    }),
  );
  expect(host.state.ready).toBe(false);
  expect(events).toContainEqual(host.state.startup.get("wasm-error"));
  unsubscribe();
});

it("retries a failed startup for the next session and reuses the successful host", async () => {
  const removed = vi.fn();
  const disconnected = vi.fn();
  const makeElement = () => ({
    style: {},
    dataset: {},
    append() {},
    remove: removed,
    attachShadow() {
      return makeElement();
    },
    setAttribute() {},
  });
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    body: makeElement(),
    createElement: makeElement,
  });
  vi.stubGlobal("location", { origin: "https://example.test" });
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect = disconnected;
    },
  );
  const initialized = vi.fn((_value: unknown) => {
    (win.imageSlideSend as (type: string, name: string, bytes: null) => void)(
      "ready",
      "",
      null,
    );
  });
  vi.stubGlobal("__deckcraftRetryInit", initialized);
  const moduleUrl = `data:text/javascript,${encodeURIComponent("export default async function(value) { globalThis.__deckcraftRetryInit(value); }\n//")}`;
  let attempts = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/deckcraft-fonts/catalog.json") return new Promise(() => {});
    if (url === "/deckcraft/host-manifest.json") {
      attempts++;
      return attempts === 1
        ? new Response(null, { status: 503 })
        : Response.json({ module: moduleUrl, wasm: "./test_bg.wasm" });
    }
    if (url === "https://example.test/deckcraft/test_bg.wasm")
      return new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), {
        headers: { "content-type": "application/wasm" },
      });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const { prepareDeckcraftHost, deckcraftHost } = await import("./host");
  const first = prepareDeckcraftHost();
  await vi.waitFor(() => expect(first.state.failed).toBe(true));
  const second = prepareDeckcraftHost();
  expect(second).not.toBe(first);
  expect(removed).toHaveBeenCalledOnce();
  expect(disconnected).toHaveBeenCalledOnce();
  await vi.waitFor(() => {
    expect(second.state.startup.get("wasm-error")).toBeUndefined();
    expect(second.state.ready).toBe(true);
  });
  expect(initialized).toHaveBeenCalledOnce();
  expect(attempts).toBe(2);
  expect(prepareDeckcraftHost()).toBe(second);
  expect(deckcraftHost()).toBe(second);
});

it("reinitializes the WASM module after an editor startup failure", async () => {
  type FakeElement = {
    id?: string;
    textContent?: string;
    style: object;
    dataset: object;
    append: () => void;
    remove: () => void;
    attachShadow: () => FakeElement;
    setAttribute: () => void;
  };
  const elements: FakeElement[] = [];
  const callbacks: (() => void)[] = [];
  const makeElement = (): FakeElement => {
    const element: FakeElement = {
      style: {},
      dataset: {},
      append() {},
      remove() {},
      attachShadow() {
        return makeElement();
      },
      setAttribute() {},
    };
    elements.push(element);
    return element;
  };
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    body: makeElement(),
    createElement: makeElement,
  });
  vi.stubGlobal("location", { origin: "https://example.test" });
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  let starts = 0;
  vi.stubGlobal("__deckcraftModuleRetry", () => {
    starts++;
    if (starts === 1) {
      const loading = elements.find((element) => element.id === "loading");
      if (!loading) throw new Error("loading element not found");
      loading.textContent = "DeckCraft failed to start: test";
      callbacks[0]();
    } else {
      (win.imageSlideSend as (type: string, name: string, bytes: null) => void)(
        "ready",
        "",
        null,
      );
    }
  });
  const moduleUrl = `data:text/javascript,${encodeURIComponent("let started = false; export default async function() { if (!started) { started = true; await window.imageSlideInitialFonts; globalThis.__deckcraftModuleRetry(); } }\n//")}`;
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      if (url === "/deckcraft-fonts/catalog.json")
        return Response.json([
          { family: "Inter", path: "fonts/inter.ttf" },
          { family: "Noto Sans JP", path: "fonts/jp.ttf" },
        ]);
      if (url.startsWith("/deckcraft-fonts/fonts/"))
        return new Response(new Uint8Array([1]));
      if (url === "/deckcraft/host-manifest.json")
        return Response.json({ module: moduleUrl, wasm: "./test_bg.wasm" });
      if (url === "https://example.test/deckcraft/test_bg.wasm")
        return new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), {
          headers: { "content-type": "application/wasm" },
        });
      throw new Error(`Unexpected request ${url}`);
    }),
  );
  const { prepareDeckcraftHost } = await import("./host");
  const first = prepareDeckcraftHost();
  await vi.waitFor(() => expect(first.state.failed).toBe(true));
  const second = prepareDeckcraftHost();
  await vi.waitFor(() => expect(second.state.ready).toBe(true));
  expect(starts).toBe(2);
  expect(
    requests.filter((url) => url === "/deckcraft-fonts/catalog.json"),
  ).toHaveLength(2);
  expect(
    requests.filter((url) => url === "/deckcraft-fonts/fonts/inter.ttf"),
  ).toHaveLength(2);
  expect(
    requests.filter((url) => url === "/deckcraft-fonts/fonts/jp.ttf"),
  ).toHaveLength(2);
});

it("does not start an abandoned attempt after its manifest arrives late", async () => {
  type FakeElement = {
    id?: string;
    textContent?: string;
    style: object;
    dataset: object;
    append: () => void;
    remove: () => void;
    attachShadow: () => FakeElement;
    setAttribute: () => void;
  };
  const elements: FakeElement[] = [];
  const callbacks: (() => void)[] = [];
  const makeElement = (): FakeElement => {
    const element: FakeElement = {
      style: {},
      dataset: {},
      append() {},
      remove() {},
      attachShadow() {
        return makeElement();
      },
      setAttribute() {},
    };
    elements.push(element);
    return element;
  };
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    body: makeElement(),
    createElement: makeElement,
  });
  vi.stubGlobal("location", { origin: "https://example.test" });
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const initialized = vi.fn(() =>
    (win.imageSlideSend as (type: string, name: string, bytes: null) => void)(
      "ready",
      "",
      null,
    ),
  );
  vi.stubGlobal("__deckcraftLateInit", initialized);
  const moduleUrl = `data:text/javascript,${encodeURIComponent("export default async function() { globalThis.__deckcraftLateInit(); }\n//")}`;
  let resolveFirst: (response: Response) => void = () => {};
  const firstManifest = new Promise<Response>((resolve) => {
    resolveFirst = resolve;
  });
  let manifests = 0;
  const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => {
    if (url === "/deckcraft-fonts/catalog.json") return new Promise(() => {});
    if (url === "/deckcraft/host-manifest.json") {
      manifests++;
      return manifests === 1
        ? firstManifest
        : Response.json({ module: moduleUrl, wasm: "./test_bg.wasm" });
    }
    if (url === "https://example.test/deckcraft/test_bg.wasm")
      return new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), {
        headers: { "content-type": "application/wasm" },
      });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const { prepareDeckcraftHost } = await import("./host");
  const first = prepareDeckcraftHost();
  const loading = elements.find((element) => element.id === "loading");
  if (!loading) throw new Error("loading element not found");
  loading.textContent = "DeckCraft failed to start: test";
  callbacks[0]();
  expect(first.state.failed).toBe(true);
  const second = prepareDeckcraftHost();
  resolveFirst(Response.json({ module: moduleUrl, wasm: "./test_bg.wasm" }));
  await vi.waitFor(() => expect(second.state.ready).toBe(true));
  expect(initialized).toHaveBeenCalledOnce();
  expect(
    fetchMock.mock.calls.filter(([url]) => url.endsWith("test_bg.wasm")),
  ).toHaveLength(1);
  expect(
    fetchMock.mock.calls.find(
      ([url]) => url === "/deckcraft/host-manifest.json",
    )?.[1]?.signal?.aborted,
  ).toBe(true);
});
