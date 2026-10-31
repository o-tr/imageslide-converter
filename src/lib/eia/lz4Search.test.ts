import { Buffer } from "buffer";
import { createHash } from "node:crypto";
import lz4 from "lz4js";
import { describe, expect, it } from "vitest";
import {
  compressLz4Best,
  compressLz4Search,
  fitsDecodeSpeedBudget,
} from "./lz4Search";

function randomBytes(length: number, seed: number) {
  const bytes = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[i] = state & 255;
  }
  return bytes;
}

describe("LZ4 search encoder", () => {
  it("preserves match choices on both sides of the power-table threshold", () => {
    const cases = [
      [
        1048576,
        "12b5c869b4184f9374bef3ae05f8fa9c1bdf7c89cb67202ac90918aa60ff1757",
      ],
      [
        1048577,
        "37ac8aecdafe0ccfd7b337d9edaa08ecd8b72704223f01e97c7c74a34c58e85a",
      ],
    ] as const;
    for (const [size, digest] of cases) {
      const data = new Uint8Array(size);
      let state = 19;
      for (let i = 0; i < size; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        const value = state >>> 0;
        data[i] =
          i > 128 && (value >>> 5) % 5
            ? data[i - 1 - ((value >>> 8) % 128)]
            : value & 15;
      }
      expect(
        createHash("sha256").update(compressLz4Search(data)).digest("hex"),
      ).toBe(digest);
    }
  });

  it("preserves candidate selection when deeper searches are redundant", () => {
    const digests = [
      "9310994f48d5f544eeec35aa1754bf52b44a12a3b0f0a06bc5beb7a7ad336d01",
      "18f1de76e45df841efeaab576aa256eb028597bb79a70f0c7e881a902c8ce338",
      "ef617c896e9f872d6a7f2d9b79d7269a6bc95039e9171ae923757f8f1e5b3166",
    ];
    for (let kind = 0; kind < digests.length; kind++) {
      const data = new Uint8Array(10_000);
      let state = 123;
      for (let i = 0; i < data.length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        data[i] =
          kind === 0
            ? state & 255
            : kind === 1
              ? i % 127
              : i % 499 < 340
                ? i % 127
                : state & 255;
      }
      // Captured before duplicate candidate passes were removed.
      expect(
        createHash("sha256").update(compressLz4Best(data)).digest("hex"),
      ).toBe(digests[kind]);
    }
  });

  it("preserves output with many colliding match prefixes", () => {
    const data = new Uint8Array(6000);
    let state = 789;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = i % 5 === 4 ? (state >>> 0) & 255 : 0;
    }
    expect(
      createHash("sha256").update(compressLz4Best(data)).digest("hex"),
    ).toBe("9ca9135045e36454b2ac8d5df4a937ef3b1bb9edd42f854c0a584faffc7b2457");
  });
  it("preserves the incremental search output across the match-window boundary", () => {
    const data = new Uint8Array(180_000);
    let state = 819;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const value = state >>> 0;
      data[i] = value & 255;
      if (i > 66_000 && value % 5 !== 0)
        data[i] = data[i - 1 - (value % 65_000)];
    }
    // Digest captured from the incremental-index implementation.
    expect(
      createHash("sha256").update(compressLz4Search(data)).digest("hex"),
    ).toBe("80355d174fa4799e7797c67e309d9ca83e50ec8b6be3b290cd2ff8e51228b309");
  });
  it("limits the faster candidate's size and requires a substantial cost reduction", () => {
    expect(fitsDecodeSpeedBudget(1000, 1000, 1100, 1030, 900)).toBe(true);
    expect(fitsDecodeSpeedBudget(1000, 1000, 1100, 1031, 900)).toBe(false);
    expect(fitsDecodeSpeedBudget(1000, 1000, 1029, 1030, 900)).toBe(false);
    expect(fitsDecodeSpeedBudget(1000, 1000, 1100, 1030, 901)).toBe(false);
  });
  it("prefers equivalent matches that need fewer overlapping copies", () => {
    const data = new Uint8Array(2000);
    let state = 3;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state & 7;
      if ((state >>> 5) % 5 && i > 60)
        data[i] = data[i - (1 + ((state >>> 8) % 30))];
    }
    const encoded = compressLz4Search(data);
    expect(
      Buffer.from(lz4.decompress(encoded, data.length)).equals(
        Buffer.from(data),
      ),
    ).toBe(true);
    // The old nearest-offset choice needs 450 bulk copies for this fixture.
    let position = 11;
    const end =
      11 + new DataView(encoded.buffer, encoded.byteOffset).getUint32(7, true);
    let copies = 0;
    const length = (initial: number) => {
      let total = initial;
      if (initial === 15) {
        let extra: number;
        do {
          extra = encoded[position++];
          total += extra;
        } while (extra === 255);
      }
      return total;
    };
    while (position < end) {
      const token = encoded[position++];
      const literals = length(token >>> 4);
      if (literals) copies++;
      position += literals;
      if (position === end) break;
      const offset = encoded[position] | (encoded[position + 1] << 8);
      position += 2;
      const match = length(token & 15) + 4;
      let written = Math.min(offset, match);
      copies++;
      while (written < match) {
        written += Math.min(written, match - written);
        copies++;
      }
    }
    expect(encoded.length).toBeLessThanOrEqual(1694);
    expect(copies).toBeLessThan(450);
  });

  it("compresses repeated runs mixed with changing data better than the fast encoder", () => {
    const data = randomBytes(10_000, 1);
    for (let i = 0; i < data.length; i++) {
      if (i % 499 < 340) data[i] = i % 127;
    }
    const encoded = compressLz4Best(data);
    expect(encoded.length).toBeLessThan(lz4.compress(data).length);
    expect(
      Buffer.from(lz4.decompress(encoded, data.length)).equals(
        Buffer.from(data),
      ),
    ).toBe(true);
  });

  it("round-trips boundaries, random data and overlapping matches through lz4js", () => {
    const sizes = [0, 1, 4, 12, 13, 19, 255, 270, 1024, 65535, 65536, 131072];
    for (const size of sizes) {
      const random = randomBytes(size, size + 1);
      for (const data of [
        random,
        new Uint8Array(size).fill(7),
        Uint8Array.from(random, (_, i) => i % 3),
      ]) {
        const encoded = compressLz4Search(data);
        expect(Buffer.from(lz4.decompress(encoded, data.length))).toEqual(
          Buffer.from(data),
        );
        const best = compressLz4Best(data);
        expect(Buffer.from(lz4.decompress(best, data.length))).toEqual(
          Buffer.from(data),
        );
        expect(best.length).toBeLessThanOrEqual(lz4.compress(data).length);
      }
    }
  }, 30000);

  it("writes independent valid blocks inside a compatible multi-block frame", () => {
    const data = randomBytes(4 * 1024 * 1024 + 1024, 42);
    data.set(data.subarray(0, 1024), 4 * 1024 * 1024);
    const encoded = compressLz4Search(data);
    expect(createHash("sha256").update(encoded).digest("hex")).toBe(
      "0a7678830ea12b3c580c940bc24943260e4172d025c51665c472d230aa07284a",
    );
    expect(
      Buffer.from(lz4.decompress(encoded, data.length)).equals(
        Buffer.from(data),
      ),
    ).toBe(true);
  });
});
