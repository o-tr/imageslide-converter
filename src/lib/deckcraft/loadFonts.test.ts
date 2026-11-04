import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("loads only catalogued families and open substitutes used by the PPTX", async () => {
  const { loadPptxFonts } = await import("./loadFonts");
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
  const { loadPptxFonts } = await import("./loadFonts");
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
  const { loadPptxFonts } = await import("./loadFonts");
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

it("shares catalog and font requests between concurrent and later loads", async () => {
  const { loadPptxFonts } = await import("./loadFonts");
  const { loadFontCatalog, loadFontBytes } = await import("./fontResources");
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", '<a:rPr typeface="Roboto"/>');
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  let releaseFont: (() => void) | undefined;
  const waitForFont = new Promise<void>((resolve) => {
    releaseFont = resolve;
  });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/catalog.json"))
      return {
        ok: true,
        json: async () => [{ family: "Roboto", path: "fonts/roboto.ttf" }],
      };
    await waitForFont;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  });
  vi.stubGlobal("fetch", fetchMock);
  const firstProgress: number[][] = [];
  const secondProgress: number[][] = [];
  const first = loadPptxFonts(bytes, (done, total) =>
    firstProgress.push([done, total]),
  );
  const second = loadPptxFonts(bytes, (done, total) =>
    secondProgress.push([done, total]),
  );
  // Editor startup uses the same resource functions as PPTX loading.
  await loadFontCatalog();
  const initialFont = loadFontBytes("fonts/roboto.ttf");
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  releaseFont?.();
  const [firstResult, secondResult, shared] = await Promise.all([
    first,
    second,
    initialFont,
  ]);
  expect(firstResult[0]).toBe(shared);
  expect(secondResult[0]).toBe(shared);
  expect(firstProgress).toEqual([
    [0, 1],
    [1, 1],
  ]);
  expect(secondProgress).toEqual([
    [0, 1],
    [1, 1],
  ]);
  await loadPptxFonts(bytes);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/deckcraft-fonts/catalog.json",
    "/deckcraft-fonts/fonts/roboto.ttf",
  ]);
});

it("retries failed catalog and font downloads", async () => {
  const { loadFontCatalog, loadFontBytes } = await import("./fontResources");
  const counts = new Map<string, number>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const count = (counts.get(url) ?? 0) + 1;
      counts.set(url, count);
      if (count === 1) return { ok: false };
      return {
        ok: true,
        json: async () => [],
        arrayBuffer: async () => new ArrayBuffer(4),
      };
    }),
  );
  await expect(loadFontCatalog()).rejects.toThrow();
  await expect(loadFontCatalog()).resolves.toEqual([]);
  await expect(loadFontBytes("fonts/retry.ttf")).rejects.toThrow();
  await expect(loadFontBytes("fonts/retry.ttf")).resolves.toBeInstanceOf(
    ArrayBuffer,
  );
  expect([...counts.values()]).toEqual([2, 2]);
});
