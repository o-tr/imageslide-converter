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
  it("preserves mixed multi-block output when empty searches are reused", () => {
    const blockSize = 4 * 1024 * 1024;
    const backing = new Uint8Array(blockSize + 8192 + 5);
    const data = backing.subarray(1, blockSize + 8193);
    let state = 901;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
    for (let i = 0; i < data.length; i++) data[i] = random() & 255;
    for (let i = blockSize; i < data.length; i++) {
      data[i] = random() % 4;
      if (i > blockSize + 64 && random() % 3)
        data[i] = data[i - 1 - (random() % 64)];
    }
    const frame = compressLz4Best(data);
    expect(createHash("sha256").update(frame).digest("hex")).toBe(
      "1087544d87ede0d0c1fb3d38545c00b08a5573f5ca930b7c5a8255278286ba29",
    );
    expect(
      Buffer.from(lz4.decompress(frame, data.length)).equals(Buffer.from(data)),
    ).toBe(true);
  });

  it("retains the existing raw-block choice even when deeper search is smaller", () => {
    const data = randomBytes(32768, 19);
    for (let i = 400; i < data.length - 20; i += 70)
      data.copyWithin(i, i - 350, i - 346);
    const fast = lz4.compress(data);
    expect(
      new DataView(fast.buffer, fast.byteOffset).getUint32(7, true) >>> 31,
    ).toBe(1);
    expect(compressLz4Search(data).length).toBeLessThan(fast.length);
    expect(compressLz4Best(data)).toEqual(fast);
  });

  it("keeps raw multi-block frames byte-for-byte", () => {
    const data = randomBytes(4 * 1024 * 1024 + 65536, 901);
    const fast = lz4.compress(data);
    const view = new DataView(fast.buffer, fast.byteOffset, fast.byteLength);
    const first = view.getUint32(7, true);
    expect(first >>> 31).toBe(1);
    expect(view.getUint32(11 + (first & 0x7fffffff), true) >>> 31).toBe(1);
    const output = compressLz4Best(data);
    expect(Buffer.from(output).equals(Buffer.from(fast))).toBe(true);
    expect(
      Buffer.from(lz4.decompress(output, data.length)).equals(
        Buffer.from(data),
      ),
    ).toBe(true);
  });

  it("chooses a lower-work result from a smaller tied parse", () => {
    let state = 8347;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
    let input = new Uint8Array();
    for (let n = 0; n <= 353; n++) {
      input = new Uint8Array(256 + (random() % 2800));
      for (let i = 0; i < input.length; i++) {
        input[i] = random() % (((n % 4) + 1) * 4);
        if (i > 60 && random() % 3) input[i] = input[i - 1 - (random() % 60)];
      }
    }
    const encoded = compressLz4Best(input);
    expect(encoded.length).toBe(469);
    expect(createHash("sha256").update(encoded).digest("hex")).toBe(
      "5a8ddb0930cfc72174d6da631ab6c44ffb5045f336622c9a10fea30fba35c44e",
    );
    expect(Buffer.from(lz4.decompress(encoded, input.length))).toEqual(
      Buffer.from(input),
    );
  });

  it("preserves long literal and match extension bytes", () => {
    const hash = createHash("sha256");
    for (const length of [
      15, 16, 18, 19, 20, 254, 255, 256, 269, 270, 271, 1020, 1021, 1038, 1039,
      1040, 1041, 2048, 65536,
    ]) {
      const data = new Uint8Array(length);
      const encoded = compressLz4Search(data);
      hash.update(encoded);
      expect(Buffer.from(lz4.decompress(encoded, data.length))).toEqual(
        Buffer.from(data),
      );
    }
    expect(hash.digest("hex")).toBe(
      "d96c190435edff09e9352839d47b45d375de150772a4adc5cff67d2355e461dd",
    );
    const input = new Uint8Array(8192);
    let state = 321;
    for (let i = 0; i < input.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      input[i] = state >>> 24;
    }
    input.copyWithin(8000, 30, 130);
    const encoded = compressLz4Search(input);
    expect(createHash("sha256").update(encoded).digest("hex")).toBe(
      "11c4a2f8f0591620a5fa10c70c7cea1016f1c3bc1258db1a4c5695c38cb06de4",
    );
    expect(Buffer.from(lz4.decompress(encoded, input.length))).toEqual(
      Buffer.from(input),
    );
  });

  it("preserves full-encoder output when a match reaches the legal tail", () => {
    const hashes = [
      "3468cffe381b00a8494b10a6dab72081f8740ad77860fff553ca5f32f724fc3c",
      "e2f3761f4b5dac88eabcac3fe54825e38cec1e7070be03edffad95061e40ec87",
      "3417663cfc33c1b6ef5a3403cfabf2b328d077deaac882bcbffbc7ab63cb8f1e",
    ];
    for (let kind = 0; kind < hashes.length; kind++) {
      const data = new Uint8Array(16384);
      for (let i = 0; i < data.length; i++) {
        data[i] =
          kind === 0
            ? 0
            : kind === 1
              ? i % 29
              : i < 8192
                ? (i * 73 + (i >> 3)) & 255
                : 42;
      }
      const encoded = compressLz4Best(data);
      expect(createHash("sha256").update(encoded).digest("hex")).toBe(
        hashes[kind],
      );
      expect(Buffer.from(lz4.decompress(encoded, data.length))).toEqual(
        Buffer.from(data),
      );
    }
  });

  it("preserves match choices around the last searchable position", () => {
    const hash = createHash("sha256");
    for (let tail = 0; tail <= 16; tail++) {
      const data = new Uint8Array(8192);
      for (let i = 0; i < data.length; i++) data[i] = i % 73;
      for (let i = 0; i < tail; i++)
        data[data.length - 1 - i] = (i * 37 + 131) & 255;
      hash.update(compressLz4Search(data));
    }
    expect(hash.digest("hex")).toBe(
      "37f4f2926f940ef6e18e3f4f7ce657c5bdcd6db4f247510cdcc3395b8897da0a",
    );
  });

  it("preserves output when a deferred match table becomes necessary", () => {
    const data = new Uint8Array(262144);
    let state = 77;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state >>> 24;
    }
    data.copyWithin(120000, 100000, 106000);
    data.copyWithin(140000, 100000, 106000);
    // The fast frame remains above 90% of the input, while multiple repeated
    // ranges require a long-match comparison during the deeper search.
    expect(lz4.compress(data).length * 10).toBeGreaterThanOrEqual(
      data.length * 9,
    );
    expect(
      createHash("sha256").update(compressLz4Best(data)).digest("hex"),
    ).toBe("874ad9e8d0fab4af899e460ce1e81480552821f6b50f568a434192e8a61a6019");
  });

  it("preserves output when minimum-match profiles are equivalent", () => {
    const digests = [
      "b177bfcb6e7a78a6e6486004d0fd0d283a9e4808c23f8744316b244f5924dd19",
      "60cd8b605a6b76e8971797d74ba308424c50c1a5b909614429691aab8de2c2fb",
      "8042260bb39d474a5ecafe844e38f3b71298ad5609bfde34177bc28baaf2a753",
    ];
    for (let kind = 0; kind < digests.length; kind++) {
      const data = new Uint8Array(8192);
      let state = 307;
      for (let i = 0; i < data.length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        data[i] = state >>> 24;
      }
      if (kind) {
        for (let length = 4; length <= 12; length++) {
          const source = 300 + length * 80;
          data.copyWithin(
            4096 + length * 240,
            source,
            source + length + (kind === 2 ? 20 : 0),
          );
        }
      }
      expect(
        createHash("sha256").update(compressLz4Best(data)).digest("hex"),
      ).toBe(digests[kind]);
    }
  });

  it("preserves match choices across four- and sixteen-byte boundaries", () => {
    const data = new Uint8Array(16384);
    let state = 54321;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state >>> 24;
    }
    for (let length = 4; length <= 40; length++) {
      const source = 100 + length * 70;
      data.copyWithin(8192 + length * 120, source, source + length);
    }
    expect(
      createHash("sha256").update(compressLz4Search(data)).digest("hex"),
    ).toBe("7c8504ad0ab3c581315bbbe1fccc73c78a4fd710fcbe65a0d836579c018f64c5");
  });

  it("preserves results for unaligned input views", () => {
    const data = randomBytes(4096, 123);
    for (let i = 64; i < data.length; i++) {
      if (i % 5 !== 0) data[i] = data[i - 61];
    }
    const expected = compressLz4Best(data);
    for (let offset = 1; offset <= 3; offset++) {
      const storage = new Uint8Array(data.length + offset + 4);
      storage.set(data, offset);
      const view = storage.subarray(offset, offset + data.length);
      expect(compressLz4Best(view)).toEqual(expected);
      expect(Buffer.from(lz4.decompress(expected, view.length))).toEqual(
        Buffer.from(view),
      );
    }
  });

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
