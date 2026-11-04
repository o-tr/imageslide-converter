import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { expect, it } from "vitest";

it("starts the WASM and initial font requests without waiting for either response", async () => {
  const dir = mkdtempSync(join(tmpdir(), "deckcraft-startup-"));
  try {
    const path = join(dir, "index.html");
    const source = readFileSync(
      "vendor/deckcraft/apps/deckcraft-web/index.html",
      "utf8",
    ).replace(
      "</head>",
      `<script type="module">import init, * as bindings from './test.js'; const wasm = await init({ module_or_path: './test_bg.wasm' });</script><link rel="preload" href="./test_bg.wasm" as="fetch"></head>`,
    );
    writeFileSync(path, source);
    const { instrumentDeckcraft } = await import(
      "../../../scripts/instrument-deckcraft.mjs"
    );
    await instrumentDeckcraft(path);
    const html = readFileSync(path, "utf8");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const requests: string[] = [];
    const window = {
      parent: {} as unknown,
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      addEventListener() {},
    };
    window.parent = window;
    const context = createContext({
      window,
      location: {
        href: "https://example.test/deckcraft/index.html",
        origin: "https://example.test",
      },
      URL,
      WebAssembly,
      Map,
      fetch: (url: string) => {
        requests.push(url);
        return new Promise(() => {});
      },
    });
    for (const script of scripts) runInContext(script[1], context);
    expect(requests).toContain("./test_bg.wasm");
    expect(requests).toContain("/deckcraft-fonts/catalog.json");
    expect(html).not.toContain('rel="preload"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
