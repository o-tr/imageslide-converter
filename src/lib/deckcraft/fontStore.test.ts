import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { fontBytes, fontCatalog } from "./fontStore";

let root = "";
afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
});

it("serves only catalogued files that remain inside the font volume", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "imageslide-fonts-"));
  await mkdir(path.join(root, "fonts"));
  await writeFile(path.join(root, "fonts/good.ttf"), "font");
  await symlink("/etc/passwd", path.join(root, "fonts/escape.ttf"));
  await writeFile(
    path.join(root, "catalog.json"),
    JSON.stringify([
      { family: "Good", style: "Regular", path: "fonts/good.ttf" },
      { family: "Escape", style: "Regular", path: "fonts/escape.ttf" },
      {
        family: "Traversal",
        style: "Regular",
        path: "fonts/../../etc/passwd.ttf",
      },
    ]),
  );
  vi.stubEnv("DECKCRAFT_FONT_DIR", root);
  expect(await fontCatalog()).toHaveLength(2);
  expect(Buffer.from((await fontBytes("fonts/good.ttf")) ?? [])).toEqual(
    Buffer.from("font"),
  );
  expect(await fontBytes("fonts/escape.ttf")).toBeNull();
  expect(await fontBytes("fonts/../../etc/passwd.ttf")).toBeNull();
  expect(await fontBytes("fonts/unknown.ttf")).toBeNull();
});
