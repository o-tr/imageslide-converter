import JSZip from "jszip";

type FontEntry = { family: string; path: string };

// Open substitutes mirrored by DeckCraft's font fallback mapping.
const substitutes: Record<string, string> = {
  "noto sans jp": "BIZ UDPGothic",
  "noto sans cjk jp": "BIZ UDPGothic",
  "proxima nova": "Montserrat",
  "yu mincho": "BIZ UDMincho",
  "yu mincho demibold": "BIZ UDMincho",
  游明朝: "BIZ UDMincho",
  "ms mincho": "BIZ UDMincho",
  "ms pmincho": "BIZ UDMincho",
  "ｍｓ 明朝": "BIZ UDMincho",
  "ｍｓ ｐ明朝": "BIZ UDMincho",
  "yu gothic": "BIZ UDPGothic",
  "yu gothic ui": "BIZ UDPGothic",
  游ゴシック: "BIZ UDPGothic",
  meiryo: "BIZ UDPGothic",
  メイリオ: "BIZ UDPGothic",
  "ms gothic": "BIZ UDPGothic",
  "ms pgothic": "BIZ UDPGothic",
  "ｍｓ ゴシック": "BIZ UDPGothic",
  "ｍｓ ｐゴシック": "BIZ UDPGothic",
  calibri: "Carlito",
  "calibri light": "Carlito",
  cambria: "Caladea",
  "cambria math": "Caladea",
  arial: "Liberation Sans",
  "times new roman": "Liberation Serif",
  "courier new": "Liberation Mono",
  consolas: "Liberation Mono",
  aptos: "Inter",
  "aptos display": "Inter",
};

function fontFileUrl(path: string): string {
  const parts = path.split("/");
  if (
    parts[0] !== "fonts" ||
    parts.some(
      (part) => !part || part === "." || part === ".." || part.includes("\\"),
    )
  )
    throw new Error("Invalid font path in catalog");
  return `/deckcraft-fonts/${parts.map(encodeURIComponent).join("/")}`;
}

/** Load available fonts referenced by a PPTX before DeckCraft opens it. */
export async function loadPptxFonts(
  bytes: ArrayBuffer,
): Promise<ArrayBuffer[]> {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter((entry) =>
    /^ppt\/(slides\/slide\d+|slideMasters\/slideMaster\d+|slideLayouts\/slideLayout\d+|theme\/theme\d+)\.xml$/i.test(
      entry.name,
    ),
  );
  const names = new Set<string>();
  for (const entry of entries) {
    const xml = await entry.async("text");
    for (const match of xml.matchAll(/\btypeface\s*=\s*["']([^"']+)["']/g)) {
      const value = match[1].trim();
      if (value && !value.startsWith("+")) names.add(value.toLowerCase());
    }
  }
  const response = await fetch("/deckcraft-fonts/catalog.json");
  if (!response.ok) throw new Error("フォント一覧を取得できませんでした");
  const catalog: FontEntry[] = await response.json();
  const available = new Set(catalog.map((font) => font.family.toLowerCase()));
  const wanted = new Set(
    [...names]
      .map((name) =>
        available.has(name) ? name : substitutes[name]?.toLowerCase(),
      )
      .filter(Boolean),
  );
  const selected = catalog.filter((font) =>
    wanted.has(font.family.toLowerCase()),
  );
  return Promise.all(
    selected.map(async (font) => {
      const res = await fetch(fontFileUrl(font.path));
      if (!res.ok) throw new Error(`${font.family} の読み込みに失敗しました`);
      return res.arrayBuffer();
    }),
  );
}
