// Deterministic, non-private RGB payloads for the TypeUdon EIA LZ4 probe.
import { writeFile } from "node:fs/promises";
import lz4 from "lz4js";

const [outputPath] = process.argv.slice(2);
if (!outputPath) {
  console.error(
    "Usage: node scripts/generate-eia-lz4-fixtures.mjs <output.json>",
  );
  process.exit(1);
}
const width = 480;
const height = 270;
const byteLength = width * height * 3;
const uniform = new Uint8Array(byteLength);
const gradient = new Uint8Array(byteLength);
const noise = new Uint8Array(byteLength);
const text = new Uint8Array(byteLength);
const sparse = new Uint8Array(byteLength);
let state = 1_234_567;
for (let p = 0; p < byteLength; p += 3) {
  const index = p / 3;
  const x = index % width;
  const y = Math.floor(index / width);
  uniform.set([240, 240, 240], p);
  gradient.set([x % 256, y % 256, (x + y) % 256], p);
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  noise.set([state & 255, (state >>> 8) & 255, (state >>> 16) & 255], p);
  const shade =
    y % 28 < 5 && x > 30 && x < 400 && (x * 7 + y * 13) % 23 < 13 ? 30 : 240;
  text.set([shade, shade, shade], p);
  if (
    (x > 80 && x < 260 && y > 60 && y < 110) ||
    (x > 300 && x < 400 && y > 180 && y < 210)
  ) {
    sparse.set([x % 256, y % 256, (x + y) % 256], p);
  }
}
const cases = [];
for (const [name, raw] of [
  ["uniform", uniform],
  ["gradient", gradient],
  ["noise", noise],
  ["text", text],
  ["sparse", sparse],
]) {
  cases.push({
    Name: name,
    InputHex: Buffer.from(lz4.compress(raw)).toString("hex"),
    RequestedCapacity: raw.length,
    Expected: {
      error: 0,
      resultNull: false,
      ResultHex: Buffer.from(raw).toString("hex"),
    },
  });
}
await writeFile(outputPath, JSON.stringify(cases));
