/** Font resources are shared by editor startup and presentation loading. */
export type FontEntry = { family: string; style?: string; path: string };

let catalogPromise: Promise<FontEntry[]> | undefined;
const fonts = new Map<string, Promise<ArrayBuffer>>();

export function loadFontCatalog(): Promise<FontEntry[]> {
  if (!catalogPromise) {
    const request = fetch("/deckcraft-fonts/catalog.json").then(
      async (response) => {
        if (!response.ok) throw new Error("フォント一覧を取得できませんでした");
        return (await response.json()) as FontEntry[];
      },
    );
    catalogPromise = request;
    request.catch(() => {
      if (catalogPromise === request) catalogPromise = undefined;
    });
  }
  return catalogPromise;
}

export function loadFontBytes(path: string): Promise<ArrayBuffer> {
  const parts = path.split("/");
  if (
    parts[0] !== "fonts" ||
    parts.some(
      (part) => !part || part === "." || part === ".." || part.includes("\\"),
    )
  )
    throw new Error("Invalid font path in catalog");
  const url = `/deckcraft-fonts/${parts.map(encodeURIComponent).join("/")}`;
  let request = fonts.get(url);
  if (!request) {
    request = fetch(url).then(async (response) => {
      if (!response.ok)
        throw new Error(`フォントを読み込めませんでした: ${path}`);
      return response.arrayBuffer();
    });
    fonts.set(url, request);
    const pending = request;
    request.catch(() => {
      if (fonts.get(url) === pending) fonts.delete(url);
    });
  }
  return request;
}
