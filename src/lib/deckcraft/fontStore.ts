import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export type FontEntry = { family: string; style: string; path: string };

export function fontRoot(): string {
  return path.resolve(
    process.env.DECKCRAFT_FONT_DIR ||
      path.join(process.cwd(), "public/deckcraft/fonts"),
  );
}

export async function fontCatalog(): Promise<FontEntry[]> {
  const parsed: unknown = JSON.parse(
    await readFile(path.join(fontRoot(), "catalog.json"), "utf8"),
  );
  if (!Array.isArray(parsed)) throw new Error("Invalid font catalog");
  return parsed.filter(
    (entry): entry is FontEntry =>
      entry &&
      typeof entry.family === "string" &&
      typeof entry.style === "string" &&
      typeof entry.path === "string" &&
      entry.path.startsWith("fonts/") &&
      !entry.path.includes("..") &&
      /\.(ttf|otf)$/i.test(entry.path),
  );
}

export async function fontBytes(
  relativePath: string,
): Promise<Uint8Array | null> {
  const catalog = await fontCatalog();
  if (!catalog.some((entry) => entry.path === relativePath)) return null;
  const root = await realpath(fontRoot());
  const file = await realpath(path.join(root, relativePath));
  if (!file.startsWith(`${root}${path.sep}`)) return null;
  const info = await stat(file);
  if (!info.isFile() || info.size > 64 * 1024 * 1024) return null;
  return readFile(file);
}
