import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";
import { loadPptxFonts } from "./loadFonts";

afterEach(() => vi.unstubAllGlobals());

it("loads only catalogued families and open substitutes used by the PPTX", async () => {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    '<a:rPr typeface="游明朝"/><a:latin typeface="Roboto"/><a:latin typeface="Noto Sans"/><a:latin typeface="Noto Sans JP"/><a:latin typeface="Proxima Nova"/>',
  );
  zip.file("ppt/theme/theme1.xml", '<a:latin typeface="Calibri"/>');
  const pptx = await zip.generateAsync({ type: "arraybuffer" });
  const entries = [
    { family: "BIZ UDMincho", path: "fonts/mincho.ttf" },
    { family: "Carlito", path: "fonts/carlito.ttf" },
    { family: "Roboto", path: "fonts/roboto.ttf" },
    { family: "Lato", path: "fonts/lato.ttf" },
    { family: "Noto Sans", path: "fonts/noto.ttf" },
    { family: "BIZ UDPGothic", path: "fonts/gothic.ttf" },
    { family: "Montserrat", path: "fonts/montserrat.ttf" },
  ];
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    if (url.endsWith("/catalog"))
      return { ok: true, json: async () => entries };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  });
  expect(await loadPptxFonts(pptx)).toHaveLength(6);
  expect(calls).toContain("/api/deckcraft-fonts/file?path=fonts%2Fmincho.ttf");
  expect(calls).toContain("/api/deckcraft-fonts/file?path=fonts%2Fcarlito.ttf");
  expect(calls).toContain("/api/deckcraft-fonts/file?path=fonts%2Fnoto.ttf");
  expect(calls).toContain("/api/deckcraft-fonts/file?path=fonts%2Fgothic.ttf");
  expect(calls).toContain(
    "/api/deckcraft-fonts/file?path=fonts%2Fmontserrat.ttf",
  );
  expect(calls).not.toContain(
    "/api/deckcraft-fonts/file?path=fonts%2Flato.ttf",
  );
});

it("prefers the exact family over its substitute", async () => {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", '<a:rPr typeface="Noto Sans JP"/>');
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    if (url.endsWith("/catalog"))
      return {
        ok: true,
        json: async () => [
          { family: "Noto Sans JP", path: "fonts/noto-jp.ttf" },
          { family: "BIZ UDPGothic", path: "fonts/biz.ttf" },
        ],
      };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  });
  expect(await loadPptxFonts(bytes)).toHaveLength(1);
  expect(calls).toContain("/api/deckcraft-fonts/file?path=fonts%2Fnoto-jp.ttf");
  expect(calls).not.toContain("/api/deckcraft-fonts/file?path=fonts%2Fbiz.ttf");
});
