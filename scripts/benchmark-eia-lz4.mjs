// Node 24+: compare encoders using cases extracted by typeudon's EIA probe.
// Case files contain private slide bytes: keep input and output outside git.
import { readFile, writeFile } from "node:fs/promises";
import lz4 from "lz4js";
import { compressLz4Best } from "../src/lib/eia/lz4Search.ts";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error(
    "Usage: node scripts/benchmark-eia-lz4.mjs <cases.json> <output.json>",
  );
  process.exit(1);
}
const cases = JSON.parse(await readFile(inputPath, "utf8"));
const output = [];
for (const item of cases) {
  const raw = Buffer.from(item.Expected.ResultHex, "hex");
  const started = performance.now();
  const encoded = compressLz4Best(raw);
  const elapsed = performance.now() - started;
  if (!Buffer.from(lz4.decompress(encoded, raw.length)).equals(raw)) {
    throw new Error(`LZ4 round-trip failed: ${item.Name}`);
  }
  const original = Buffer.from(item.InputHex, "hex");
  if (!Buffer.from(lz4.decompress(original, raw.length)).equals(raw)) {
    throw new Error(`Original frame did not match: ${item.Name}`);
  }
  output.push(item, {
    ...item,
    Name: `${item.Name}-optimized`,
    InputHex: Buffer.from(encoded).toString("hex"),
  });
  console.log(
    `${item.Name}: ${original.length} -> ${encoded.length} bytes; ${elapsed.toFixed(1)} ms`,
  );
}
await writeFile(outputPath, JSON.stringify(output));
