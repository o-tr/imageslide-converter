import { Buffer } from "buffer";
import lz4 from "lz4js";
import { describe, expect, it } from "vitest";
import { mergeLz4Literals } from "./lz4LiteralMerge";
import { compressLz4Search } from "./lz4Search";

function mixedBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let state = 3;
  for (let i = 0; i < length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[i] = state & 7;
    if ((state >>> 5) % 5 && i > 60)
      bytes[i] = bytes[i - (1 + ((state >>> 8) % 30))];
  }
  return bytes;
}

describe("LZ4 literal merging", () => {
  it("removes some matches without changing bytes or exceeding the budget", () => {
    const raw = mixedBytes(2000);
    const encoded = compressLz4Search(raw);
    const limit = encoded.length + 100;
    // Deliberately prefer larger frames to exercise the permitted merge path.
    const merged = mergeLz4Literals(
      encoded,
      raw,
      limit,
      (frame) => -frame.length,
    );
    expect(merged.length).toBeGreaterThan(encoded.length);
    expect(merged.length).toBeLessThanOrEqual(limit);
    expect(
      Buffer.from(lz4.decompress(merged, raw.length)).equals(Buffer.from(raw)),
    ).toBe(true);
  });

  it("leaves an unsupported frame or a candidate over budget untouched", () => {
    const raw = mixedBytes(2000);
    const encoded = compressLz4Search(raw);
    const modifiedHeader = Uint8Array.from(encoded);
    modifiedHeader[4] = 0x60;
    expect(
      mergeLz4Literals(modifiedHeader, raw, encoded.length + 100, () => 0),
    ).toBe(modifiedHeader);
    expect(mergeLz4Literals(encoded, raw, encoded.length - 1, () => 0)).toBe(
      encoded,
    );
  });

  it("preserves bytes across linked blocks and mixed block types", () => {
    const raw = new Uint8Array(4 * 1024 * 1024 + 8192);
    raw.set(mixedBytes(8192), 4 * 1024 * 1024);
    const encoded = lz4.compress(raw);
    const merged = mergeLz4Literals(
      encoded,
      raw,
      encoded.length + 256,
      (frame) => -frame.length,
    );
    expect(merged.length).toBeLessThanOrEqual(encoded.length + 256);
    expect(
      Buffer.from(lz4.decompress(merged, raw.length)).equals(Buffer.from(raw)),
    ).toBe(true);
  }, 30000);
});
