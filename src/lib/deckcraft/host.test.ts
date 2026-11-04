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
