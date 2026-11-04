// Smoke-test the generated WASM bridge in a minimal host, without a renderer.
// Run after build:deckcraft with the local font pack installed.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

class Window {}
class Document {}
let errorSeen;
const errorPromise = new Promise((resolveError) => {
  errorSeen = resolveError;
});
class Element {
  set innerHTML(value) {
    this.content = value;
    errorSeen(value);
  }
}
class HTMLCanvasElement extends Element {
  // Deliberately stop as soon as WebRunner tries to configure the real host canvas.
  style = {
    setProperty() {
      throw new Error("NO_TEST_RENDERER");
    },
  };
}
Object.assign(globalThis, { Window, Document, Element, HTMLCanvasElement });
const host = new Window();
host.document = new Document();
const canvas = new HTMLCanvasElement();
const loading = new Element();
const fontRoot = resolve(
  process.env.DECKCRAFT_FONT_DIR || "public/deckcraft/fonts",
);
const catalog = JSON.parse(
  await readFile(resolve(fontRoot, "catalog.json"), "utf8"),
);
const findFont = (families) => {
  for (const family of families) {
    const matches = catalog.filter(
      (entry) => entry.family.toLowerCase() === family.toLowerCase(),
    );
    if (matches.length)
      return (
        matches.find((entry) => /regular|normal|variable/i.test(entry.style)) ||
        matches[0]
      );
  }
  throw new Error(`Required font missing: ${families.join(" / ")}`);
};
const entries = [
  findFont(["Inter", "Noto Sans"]),
  findFont(["Noto Sans JP", "BIZ UDPGothic"]),
];
const fonts = Promise.all(
  entries.map(
    async (font) =>
      new Uint8Array(await readFile(resolve(fontRoot, font.path))),
  ),
);
let readFonts = false;
let readCanvas = false;

Object.defineProperty(host, "imageSlideInitialFonts", {
  get() {
    readFonts = true;
    return fonts;
  },
});
Object.defineProperty(host, "imageSlideCanvas", {
  get() {
    readCanvas = true;
    return canvas;
  },
});
host.imageSlideLoading = loading;
host.imageSlideHostMarker = () => {};
globalThis.window = host;
// A real rendering context is intentionally absent; fail only if WASM cannot reach the host canvas.
process.on("unhandledRejection", () => {});
const root = resolve("public/deckcraft");
const manifest = JSON.parse(
  await readFile(resolve(root, "host-manifest.json"), "utf8"),
);
const bindings = await import(
  pathToFileURL(resolve(root, manifest.module)).href
);
const bytes = await readFile(resolve(root, manifest.wasm));
await bindings.default({ module_or_path: await WebAssembly.compile(bytes) });
let timeout;
try {
  await Promise.race([
    errorPromise,
    new Promise((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Host startup did not reach the renderer: ${loading.textContent || "no diagnostic"}`,
            ),
          ),
        5000,
      );
    }),
  ]);
} finally {
  clearTimeout(timeout);
}
if (!readFonts || !readCanvas || !loading.content?.includes("NO_TEST_RENDERER"))
  throw new Error("WASM did not reach WebRunner through the host bridge");
console.log(
  "DeckCraft WASM loaded fonts, obtained the host canvas and invoked WebRunner.",
);
