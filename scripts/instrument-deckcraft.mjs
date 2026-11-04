// Instrument Trunk's generated loader without changing its hashed WASM bundle.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export async function instrumentDeckcraft(path) {
  let html = await readFile(path, "utf8");
  const loader =
    /const wasm = await init\(\{ module_or_path: ('[^']+_bg\.wasm') \}\);/;
  if (!loader.test(html)) throw new Error("Trunk WASM loader not found");
  const jsMatch = html.match(/import init, \* as bindings from '([^']+\.js)';/);
  if (!jsMatch) throw new Error("Trunk JavaScript module not found");
  const manifest = {
    module: jsMatch[1],
    wasm: JSON.parse(html.match(loader)[1].replaceAll("'", '"')),
  };
  await writeFile(
    join(dirname(path), "host-manifest.json"),
    JSON.stringify(manifest),
  );
  const match = html.match(loader);
  const wasmUrl = match[1];
  // Start fetching before the browser waits for the module dependency graph.
  const earlyLoader = `<script>
(() => {
  const wasmUrl = ${wasmUrl};
  const report = (type, detail = {}) => {
    const data = { source: 'deckcraft-poc', type, ...detail };
    window.imageSlideStartup = { ...window.imageSlideStartup, [type]: data };
    if (window.parent !== window) window.parent.postMessage(data, location.origin);
  };
  const cache = window.parent;
  const cacheKey = new URL(wasmUrl, location.href).href;
  cache.imageSlideWasmModules ??= new Map();
  if (!cache.imageSlideWasmModules.has(cacheKey)) {
    const modulePromise = (async () => {
      const response = await fetch(wasmUrl);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const length = Number(response.headers.get('content-length'));
      const total = !response.headers.get('content-encoding') && length > 0 ? length : null;
      let received = 0;
      report('wasm-progress', { received, total });
      if (!response.body) return WebAssembly.compile(await response.arrayBuffer());
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) { controller.close(); return; }
            received += value.byteLength;
            report('wasm-progress', { received, total });
            controller.enqueue(value);
          } catch (error) { controller.error(error); }
        },
        cancel(reason) { return reader.cancel(reason); },
      });
      const monitored = new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
      return monitored.headers.get('content-type')?.split(';')[0].trim() === 'application/wasm' && WebAssembly.compileStreaming
        ? WebAssembly.compileStreaming(monitored)
        : WebAssembly.compile(await monitored.arrayBuffer());
    })();
    cache.imageSlideWasmModules.set(cacheKey, modulePromise);
    modulePromise.catch(() => cache.imageSlideWasmModules.delete(cacheKey));
  }
  window.imageSlideWasmModule = cache.imageSlideWasmModules.get(cacheKey);
  window.imageSlideWasmModule.catch(() => {});
})();
</script>`;
  const moduleTag = '<script type="module">';
  if (!html.includes(moduleTag))
    throw new Error("Trunk module script not found");
  html = html.replace(moduleTag, `${earlyLoader}\n${moduleTag}`);
  html = html.replace(
    loader,
    `let wasm;
try {
  wasm = await init({ module_or_path: await window.imageSlideWasmModule });
  const data = { source: 'deckcraft-poc', type: 'wasm-ready' };
  window.imageSlideStartup = { ...window.imageSlideStartup, [data.type]: data };
  if (window.parent !== window) window.parent.postMessage(data, location.origin);
} catch (error) {
  const data = { source: 'deckcraft-poc', type: 'wasm-error', message: String(error) };
  window.imageSlideStartup = { ...window.imageSlideStartup, [data.type]: data };
  if (window.parent !== window) window.parent.postMessage(data, location.origin);
  const element = document.getElementById('deckcraft_loading');
  if (element) element.textContent = 'DeckCraft failed to start: ' + String(error);
  throw error;
}`,
  );
  const preload = /<link\s+rel="preload"[^>]*href="[^"]+_bg\.wasm"[^>]*>/;
  if (!preload.test(html)) throw new Error("Trunk WASM preload not found");
  html = html.replace(preload, "");
  const fontPromiseStart = "    window.imageSlideInitialFonts = (async () => {";
  if (!html.includes(fontPromiseStart))
    throw new Error("Initial font promise not found");
  html = html.replace(
    fontPromiseStart,
    "    window.imageSlideInitialFonts = window.parent.imageSlideInitialFontsCache ??= (async () => {",
  );
  const fontPromiseEnd = "    })();\n    window.imageSlideQueue = [];";
  if (!html.includes(fontPromiseEnd))
    throw new Error("Initial font promise end not found");
  html = html.replace(
    fontPromiseEnd,
    `    })();
    window.imageSlideInitialFonts.catch(() => { delete window.parent.imageSlideInitialFontsCache; });
    window.imageSlideInitialFonts.then((fonts) => {
      const data = { source: 'deckcraft-poc', type: 'initial-font-progress', completed: fonts.length, total: fonts.length };
      window.imageSlideStartup = { ...window.imageSlideStartup, [data.type]: data };
      if (window.parent !== window) window.parent.postMessage(data, location.origin);
    }, () => {});
    window.imageSlideQueue = [];`,
  );
  const fontStart = "      return Promise.all(selected.map(async (font) => {";
  if (!html.includes(fontStart))
    throw new Error("Initial font loader not found");
  html = html.replace(
    fontStart,
    `      let completed = 0;
      const reportFont = () => {
        const data = { source: 'deckcraft-poc', type: 'initial-font-progress', completed, total: selected.length };
        window.imageSlideStartup = { ...window.imageSlideStartup, [data.type]: data };
        if (window.parent !== window) window.parent.postMessage(data, location.origin);
      };
      reportFont();
      return Promise.all(selected.map(async (font) => {`,
  );
  const fontEnd = "        return new Uint8Array(await result.arrayBuffer());";
  if (!html.includes(fontEnd))
    throw new Error("Initial font response not found");
  html = html.replace(
    fontEnd,
    `        const bytes = new Uint8Array(await result.arrayBuffer());
        completed++;
        reportFont();
        return bytes;`,
  );
  await writeFile(path, html);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await instrumentDeckcraft(process.argv[2]);
}
