import {
  clearFontResources,
  loadFontBytes,
  loadFontCatalog,
} from "./fontResources";

/** One DeckCraft instance lives in the host window for the lifetime of the page. */
export type StartupEvent = {
  type: string;
  name?: string;
  bytes?: Uint8Array | null;
  bitmap?: ImageBitmap;
  received?: number;
  total?: number | null;
  completed?: number;
  message?: string;
  requestId?: string;
};
type DeckcraftWindow = Window & {
  imageSlideHostMarker?: () => void;
  imageSlideCanvas?: HTMLCanvasElement;
  imageSlideLoading?: HTMLElement;
  imageSlideInitialFonts?: Promise<Uint8Array[]>;
  imageSlideNext?: () => unknown;
  imageSlideSend?: (
    type: string,
    name: string,
    bytes: Uint8Array | null,
  ) => void;
};

const eventName = "imageslide-deckcraft";
let runtime: ReturnType<typeof createRuntime> | undefined;
let generation = 0;

export function deckcraftHost() {
  runtime ??= createRuntime();
  return runtime;
}

/** Start a fresh runtime only when a new editor session follows a startup failure. */
export function prepareDeckcraftHost() {
  if (runtime?.state.failed) {
    runtime.dispose();
    runtime = undefined;
    clearFontResources();
  }
  return deckcraftHost();
}

export function sendDeckcraft(data: Record<string, unknown>) {
  deckcraftHost().queue.push(data);
}

export function onDeckcraftEvent(handler: (data: StartupEvent) => void) {
  const listener = (event: Event) =>
    handler((event as CustomEvent<StartupEvent>).detail);
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}

function createRuntime() {
  const attempt = ++generation;
  const controller = new AbortController();
  let disposed = false;
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    visibility: "hidden",
    pointerEvents: "none",
    zIndex: "1",
  });
  host.dataset.deckcraftHost = "";
  document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent =
    ":host{display:block;overflow:hidden} canvas{width:100%;height:100%;display:block;outline:none} #loading{display:none}";
  const canvas = document.createElement("canvas");
  canvas.id = "deckcraft_canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "DeckCraft スライドエディター");
  const loading = document.createElement("div");
  loading.id = "loading";
  root.append(style, canvas, loading);
  const queue: Record<string, unknown>[] = [];
  let currentRequestId: string | undefined;
  const state = {
    ready: false,
    failed: false,
    wasmModule: undefined as WebAssembly.Module | undefined,
    startup: new Map<string, StartupEvent>(),
  };
  const report = (data: StartupEvent) => {
    if (disposed) return;
    if (data.type === "ready") state.ready = true;
    if (data.type === "wasm-error" && !state.ready) state.failed = true;
    if (
      [
        "wasm-progress",
        "wasm-ready",
        "wasm-error",
        "initial-font-progress",
        "ready",
      ].includes(data.type)
    )
      state.startup.set(data.type, data);
    window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
  };
  const bridge = window as DeckcraftWindow;
  bridge.imageSlideHostMarker = () => {};
  bridge.imageSlideCanvas = canvas;
  bridge.imageSlideLoading = loading;
  bridge.imageSlideNext = () => {
    const event = queue.shift();
    if (event && (event.type === "open" || event.type === "import-images")) {
      currentRequestId =
        typeof event.requestId === "string" ? event.requestId : undefined;
    }
    return event ?? null;
  };
  bridge.imageSlideSend = (type, name, bytes) =>
    report({ type, name, bytes, requestId: currentRequestId });
  const observer = new MutationObserver(() => {
    const text = loading.textContent?.trim();
    if (
      text &&
      /^(?:フォントを読み込めませんでした|必要なフォントを読み込めませんでした|DeckCraft failed to start)/i.test(
        text,
      )
    )
      report({ type: "wasm-error", message: text });
  });
  observer.observe(loading, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  bridge.imageSlideInitialFonts = loadInitialFonts(report);
  // The Rust shell handles this rejection and shows its diagnostic.
  bridge.imageSlideInitialFonts.catch(() => {});
  void startWasm(report, controller.signal, attempt)
    .then((wasm) => {
      if (!disposed) state.wasmModule = wasm;
    })
    .catch((error) =>
      report({
        type: "wasm-error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  return {
    host,
    queue,
    state,
    dispose() {
      disposed = true;
      controller.abort();
      observer.disconnect();
      host.remove();
    },
  };
}

async function loadInitialFonts(report: (data: StartupEvent) => void) {
  const catalog = await loadFontCatalog();
  const select = (families: string[]) => {
    for (const family of families) {
      const matches = catalog.filter(
        (font) => font.family.toLowerCase() === family.toLowerCase(),
      );
      if (matches.length)
        return (
          matches.find((font) =>
            /regular|normal|variable/i.test(font.style ?? ""),
          ) ?? matches[0]
        );
    }
    throw new Error(`必要なフォントがありません: ${families.join(" / ")}`);
  };
  const selected = [
    select(["Inter", "Noto Sans"]),
    select(["Noto Sans JP", "BIZ UDPGothic"]),
  ];
  let completed = 0;
  const progress = () =>
    report({
      type: "initial-font-progress",
      completed,
      total: selected.length,
    });
  progress();
  return Promise.all(
    selected.map(async (font) => {
      const bytes = new Uint8Array(await loadFontBytes(font.path));
      completed++;
      progress();
      return bytes;
    }),
  );
}

async function startWasm(
  report: (data: StartupEvent) => void,
  signal: AbortSignal,
  attempt: number,
) {
  const response = await fetch("/deckcraft/host-manifest.json", {
    cache: "no-store",
    signal,
  });
  if (!response.ok)
    throw new Error(
      "DeckCraft のビルドが見つかりません。pnpm build:deckcraft を実行してください。",
    );
  const manifest: { module: string; wasm: string } = await response.json();
  if (signal.aborted) return;
  const url = (name: string) =>
    new URL(name, `${location.origin}/deckcraft/`).href;
  const moduleUrl = new URL(url(manifest.module));
  // wasm-bindgen initializes once per module. A failed instance needs a fresh module on retry.
  if (attempt > 1)
    moduleUrl.searchParams.set("deckcraft-retry", String(attempt));
  const modulePromise = import(/* @vite-ignore */ moduleUrl.href);
  const wasmPromise = (async () => {
    const result = await fetch(url(manifest.wasm), { signal });
    if (!result.ok)
      throw new Error(`WASM の取得に失敗しました (HTTP ${result.status})`);
    const length = Number(result.headers.get("content-length"));
    const total =
      !result.headers.get("content-encoding") && length > 0 ? length : null;
    let received = 0;
    report({ type: "wasm-progress", received, total });
    if (!result.body) return WebAssembly.compile(await result.arrayBuffer());
    const reader = result.body.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) return controller.close();
          received += chunk.value.byteLength;
          report({ type: "wasm-progress", received, total });
          controller.enqueue(chunk.value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel: (reason) => reader.cancel(reason),
    });
    const monitored = new Response(stream, { headers: result.headers });
    return monitored.headers.get("content-type")?.split(";")[0].trim() ===
      "application/wasm"
      ? WebAssembly.compileStreaming(monitored)
      : WebAssembly.compile(await monitored.arrayBuffer());
  })();
  const [bindings, wasm] = await Promise.all([modulePromise, wasmPromise]);
  if (signal.aborted) return;
  await bindings.default({ module_or_path: wasm });
  report({ type: "wasm-ready" });
  return wasm;
}
