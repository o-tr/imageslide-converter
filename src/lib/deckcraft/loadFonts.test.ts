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
    if (url.endsWith("/catalog.json"))
      return { ok: true, json: async () => entries };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  });
  const progress: number[][] = [];
  expect(
    await loadPptxFonts(pptx, (done, total) => progress.push([done, total])),
  ).toHaveLength(6);
  expect(progress).toEqual(Array.from({ length: 7 }, (_, done) => [done, 6]));
  expect(calls).toContain("/deckcraft-fonts/fonts/mincho.ttf");
  expect(calls).toContain("/deckcraft-fonts/fonts/carlito.ttf");
  expect(calls).toContain("/deckcraft-fonts/fonts/noto.ttf");
  expect(calls).toContain("/deckcraft-fonts/fonts/gothic.ttf");
  expect(calls).toContain("/deckcraft-fonts/fonts/montserrat.ttf");
  expect(calls).not.toContain("/deckcraft-fonts/fonts/lato.ttf");
});

it("prefers the exact family over its substitute", async () => {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", '<a:rPr typeface="Noto Sans JP"/>');
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    if (url.endsWith("/catalog.json"))
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
  expect(calls).toContain("/deckcraft-fonts/fonts/noto-jp.ttf");
  expect(calls).not.toContain("/deckcraft-fonts/fonts/biz.ttf");
});

it("rejects catalog paths that escape the public font directory", async () => {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", '<a:rPr typeface="Roboto"/>');
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => [{ family: "Roboto", path: "fonts/../../private.ttf" }],
  }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(loadPptxFonts(bytes)).rejects.toThrow("Invalid font path");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
