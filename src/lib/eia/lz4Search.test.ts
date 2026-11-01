import { Buffer } from "buffer";
import { createHash } from "node:crypto";
import lz4 from "lz4js";
import { describe, expect, it } from "vitest";
import {
  compressLz4Best,
  compressLz4Frame,
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

// Independent test reader for the LZ4 block-end constraints.
function frameHasValidEnds(frame: Uint8Array): boolean {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let position = 7;
  while (true) {
    const header = view.getUint32(position, true);
    position += 4;
    if (header === 0) return true;
    const end = position + (header & 0x7fffffff);
    if (header & 0x80000000) {
      position = end;
      continue;
    }
    let produced = 0;
    let lastMatch = -1;
    let ended = false;
    const readLength = (base: number) => {
      let size = base;
      if (base === 15) {
        let byte: number;
        do {
          byte = frame[position++];
          size += byte;
        } while (byte === 255);
      }
      return size;
    };
    while (position < end) {
      const token = frame[position++];
      const literals = readLength(token >>> 4);
      position += literals;
      produced += literals;
      if (position === end) {
        if (lastMatch >= 0 && (literals < 5 || produced - lastMatch < 12))
          return false;
        ended = true;
        break;
      }
      position += 2;
      lastMatch = produced;
      produced += readLength(token & 15) + 4;
    }
    if (!ended) return false;
  }
}

function portfolioFixture(lastSample: number): Uint8Array {
  let state = 761;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  let data = new Uint8Array();
  for (let sample = 0; sample <= lastSample; sample++) {
    data = new Uint8Array(256 + (random() % 3000));
    for (let i = 0; i < data.length; i++) {
      const value = random();
      data[i] =
        sample % 5 === 0
          ? value >>> 24
          : sample % 5 === 1
            ? i % 127
            : sample % 5 === 2
              ? i % 300 < 230
                ? i % 67
                : value >>> 24
              : sample % 5 === 3
                ? value % 7
                : i % 17
                  ? 0
                  : value >>> 24;
    }
  }
  return data;
}

describe("LZ4 search encoder", () => {
  it("considers post-processed alternatives without increasing frame size", () => {
    const data = portfolioFixture(113);
    const frame = compressLz4Best(data);
    expect(frame.length).toBe(530);
    expect(createHash("sha256").update(frame).digest("hex")).toBe(
      "23e2cc70c78e65a61747ea01dc8be3497fd242303b945fcbe9219a25ec0456b5",
    );
    expect(Buffer.from(lz4.decompress(frame))).toEqual(Buffer.from(data));
  });

  it("rejects fast frames whose last match starts too close to the end", () => {
    const data = portfolioFixture(23);
    const lastMatchDistance = (frame: Uint8Array): number => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const header = view.getUint32(7, true);
      if (header & 0x80000000) return Number.POSITIVE_INFINITY;
      const end = 11 + header;
      let pos = 11;
      let written = 0;
      let last = -1;
      const length = (initial: number) => {
        let value = initial;
        if (initial === 15) {
          let extra: number;
          do {
            extra = frame[pos++];
            value += extra;
          } while (extra === 255);
        }
        return value;
      };
      while (pos < end) {
        const token = frame[pos++];
        const literal = length(token >>> 4);
        pos += literal;
        written += literal;
        if (pos === end) {
          expect(literal).toBeGreaterThanOrEqual(5);
          break;
        }
        pos += 2;
        last = written;
        written += length(token & 15) + 4;
      }
      return last < 0 ? Number.POSITIVE_INFINITY : written - last;
    };
    expect(lastMatchDistance(lz4.compress(data))).toBeLessThan(12);
    const frame = compressLz4Best(data);
    expect(lastMatchDistance(frame)).toBeGreaterThanOrEqual(12);
    expect(Buffer.from(lz4.decompress(frame))).toEqual(Buffer.from(data));
  });

  it("avoids a marginal same-size choice that costs more VM instructions", () => {
    const data = portfolioFixture(2078);
    const frame = compressLz4Best(data);
    expect(frame.length).toBe(769);
    expect(createHash("sha256").update(frame).digest("hex")).toBe(
      "fe9d741a406620c71277533894cb705462f1201e2ae3fb8088ee85db3df7c0a5",
    );
    expect(Buffer.from(lz4.decompress(frame))).toEqual(Buffer.from(data));
  });

  it("preserves periodic searches as their hash workspace grows and is reused", () => {
    let x = 1741;
    const random = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return x >>> 0;
    };
    const parts = [8, 64, 512, 8192, 8, 512, 8192].map((period) => {
      const size = Math.max(10000, period * 7);
      const data = new Uint8Array(size);
      const base = Uint8Array.from({ length: period }, () => random() & 255);
      for (let i = 0; i < size; i++) data[i] = base[i % period];
      for (let i = size - 64; i < size; i++) data[i] = random() & 255;
      return data;
    });
    const data = Buffer.concat(parts.map((part) => Buffer.from(part)));
    const frame = compressLz4Search(data);
    expect(createHash("sha256").update(frame).digest("hex")).toBe(
      "e94d093c86f245ac4e21dc3a8533ae876a145c271b4d53faabbad31f774fec77",
    );
    expect(Buffer.from(lz4.decompress(frame))).toEqual(data);
  });

  it("invalidates a third-position lookahead across hash insertions", () => {
    const data = new Uint8Array(8192);
    let x = 725;
    for (let i = 0; i < data.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      const n = x >>> 0;
      data[i] = n % 15 === 0 ? n >>> 24 : 3;
    }
    const frame = compressLz4Frame(data, 4, true, 6, 8);
    expect(
      createHash("sha256")
        .update(frame as Uint8Array)
        .digest("hex"),
    ).toBe("ce8de8a4cd4dab36a43382ce6c6422c579de4750d77e163dd006193c818f63e6");
    expect(Buffer.from(lz4.decompress(frame as Uint8Array))).toEqual(
      Buffer.from(data),
    );
  });

  it("invalidates a cached lookahead when its hash chain changes", () => {
    const data = new Uint8Array(8192);
    let x = 21;
    for (let i = 0; i < data.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      const n = x >>> 0;
      data[i] = n % 15 === 0 ? n >>> 24 : 3;
    }
    const frame = compressLz4Frame(data, 4, true, 6, 4);
    expect(
      createHash("sha256")
        .update(frame as Uint8Array)
        .digest("hex"),
    ).toBe("ea1a82bbc35390fec7bb8150b399b0a8b9d1a1d1306a073f98d6f4d7a69d6809");
    expect(Buffer.from(lz4.decompress(frame as Uint8Array))).toEqual(
      Buffer.from(data),
    );
  });

  it("preserves postponed-lookahead search results", () => {
    const data = new Uint8Array(4000);
    let x = 1;
    for (let i = 0; i < data.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      data[i] =
        i < 300
          ? x & 15
          : x & 7
            ? data[i - 1 - ((x >>> 8) % Math.min(i, 250))]
            : x & 15;
    }
    const stats = {
      depthLimited: false,
      minimumActive: Number.POSITIVE_INFINITY,
    };
    const frame = compressLz4Frame(data, 64, true, 4, 8, undefined, stats);
    expect(
      createHash("sha256")
        .update(frame as Uint8Array)
        .digest("hex"),
    ).toBe("37b1ae0139a1076ec8afcdc917ea3edd7fb35b8bf4e2ffb64905eed756d98488");
    expect(stats).toEqual({ depthLimited: true, minimumActive: 4 });
    expect(Buffer.from(lz4.decompress(frame as Uint8Array))).toEqual(
      Buffer.from(data),
    );
  });

  it("preserves search statistics when a multi-block candidate exceeds its size limit", () => {
    const data = randomBytes(4 * 1024 * 1024 + 65536, 901);
    for (let i = 0; i < data.length; i += 128)
      data.fill(42, i, Math.min(i + 96, data.length));
    const makeStats = () => ({
      depthLimited: false,
      minimumActive: Number.POSITIVE_INFINITY,
    });
    const referenceStats = makeStats();
    const frame = compressLz4Frame(
      data,
      16,
      true,
      4,
      1,
      undefined,
      referenceStats,
      true,
    );
    expect(frame).not.toBeNull();
    if (!frame) throw new Error("Expected a frame");
    for (const limit of [0, frame.length - 1, frame.length]) {
      const stats = makeStats();
      const result = compressLz4Frame(
        data,
        16,
        true,
        4,
        1,
        undefined,
        stats,
        true,
        undefined,
        limit,
      );
      expect(stats).toEqual(referenceStats);
      if (limit < frame.length) expect(result).toBeNull();
      else expect(result).toEqual(frame);
    }
    expect(Buffer.from(lz4.decompress(frame, data.length))).toEqual(
      Buffer.from(data),
    );
  }, 30000);

  it("preserves short-match output when hash table creation is deferred", () => {
    const blockSize = 4 * 1024 * 1024;
    const data = new Uint8Array(blockSize + 65536);
    let state = 901;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
    for (let i = 0; i < data.length; i++) data[i] = random() & 255;
    for (let i = blockSize; i < data.length; i++) data[i] = random() % 16;
    const frame = compressLz4Best(data);
    expect(createHash("sha256").update(frame).digest("hex")).toBe(
      "4542b4839490ac83a952ba515e3908743f3b6d87c7d140bf417ca9b6e1428ab8",
    );
    expect(
      Buffer.from(lz4.decompress(frame, data.length)).equals(Buffer.from(data)),
    ).toBe(true);
  }, 30000);

  it("round-trips a raw trailing block after a compressed block", () => {
    const blockSize = 4 * 1024 * 1024;
    const backing = new Uint8Array(blockSize + 65536 + 3);
    const data = backing.subarray(3);
    data.set(randomBytes(65536, 1881), blockSize);
    const frame = compressLz4Best(data);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const first = view.getUint32(7, true);
    const second = view.getUint32(11 + (first & 0x7fffffff), true);
    expect(first & 0x80000000).toBe(0);
    expect(second >>> 31).toBe(1);
    expect(Buffer.from(lz4.decompress(frame))).toEqual(Buffer.from(data));
  }, 30000);

  it("preserves output after empty block contexts are evicted", () => {
    const rawLength = 3 * 4 * 1024 * 1024;
    const data = new Uint8Array(rawLength + 65536);
    let state = 901;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
    for (let i = 0; i < data.length; i++) data[i] = random() & 255;
    for (let i = rawLength; i < data.length; i++) {
      data[i] = random() % 4;
      if (i > rawLength + 64 && random() % 3)
        data[i] = data[i - 1 - (random() % 64)];
    }
    const frame = compressLz4Best(data);
    expect(createHash("sha256").update(frame).digest("hex")).toBe(
      "7de2082ccf7a8bb43b91859cd1a6c13bc5ce6938b5c2a2f934b30eec11706601",
    );
    expect(
      Buffer.from(lz4.decompress(frame, data.length)).equals(Buffer.from(data)),
    ).toBe(true);
  }, 30000);

  it("retains fallback empty-block proofs after context eviction", () => {
    const blockSize = 4 * 1024 * 1024;
    const prefixLength = 3 * blockSize;
    const tail = portfolioFixture(23);
    const data = new Uint8Array(prefixLength + tail.length);
    // A de Bruijn prefix has no repeated four-byte sequences.
    const sequence = new Uint8Array(5);
    let position = 0;
    const generate = (depth: number, period: number): void => {
      if (position >= prefixLength) return;
      if (depth > 4) {
        if (4 % period === 0) {
          for (let i = 1; i <= period && position < prefixLength; i++) {
            data[position++] = sequence[i];
          }
        }
        return;
      }
      sequence[depth] = sequence[depth - period];
      generate(depth + 1, period);
      for (
        let value = sequence[depth - period] + 1;
        value < 256 && position < prefixLength;
        value++
      ) {
        sequence[depth] = value;
        generate(depth + 1, depth);
      }
    };
    generate(1, 1);
    data.set(tail, prefixLength);
    expect(frameHasValidEnds(lz4.compress(data))).toBe(false);

    const contexts = new Map();
    const proofs = new Map<number, { minimum: number; depth: number }>();
    const stats = {
      depthLimited: false,
      minimumActive: Number.POSITIVE_INFINITY,
    };
    const frame = compressLz4Frame(
      data,
      64,
      true,
      4,
      1,
      contexts,
      stats,
      true,
      proofs,
    );
    for (let i = 0; i < 3; i++) {
      expect(proofs.get(i * blockSize)).toEqual({ minimum: 4, depth: 64 });
    }
    expect(contexts.has(0)).toBe(false);
    expect(frame).not.toBeNull();
    const encoded = compressLz4Best(data);
    expect(createHash("sha256").update(encoded).digest("hex")).toBe(
      "d555382456cee0da04d40ce3a97d326a7a40d008fe9ac389474a724f5dcb85c7",
    );
    expect(frameHasValidEnds(encoded)).toBe(true);
    expect(Buffer.from(lz4.decompress(encoded)).equals(Buffer.from(data))).toBe(
      true,
    );
  }, 30000);

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
      "f705dd69899e63f5309760c4e7e665af2b1d5cfa85c4cfe3e02f7108f7377117",
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

  it("finds the first differing byte at every word boundary", () => {
    const hash = createHash("sha256");
    for (let n = 0; n < 128; n++) {
      const length = 4 + (n % 32);
      const shift = n % 4;
      const data = new Uint8Array(128);
      let state = n + 1;
      for (let i = 0; i < data.length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        data[i] = state & 255;
      }
      const source = shift + 1;
      const target = 64 + shift;
      data.set(data.subarray(source, source + length), target);
      data[target + length] ^= 0x80;
      const frame = compressLz4Search(data);
      hash.update(frame);
      expect(Buffer.from(lz4.decompress(frame, data.length))).toEqual(
        Buffer.from(data),
      );
    }
    expect(hash.digest("hex")).toBe(
      "3b9aa17bd3293d32a12dfa8d808179843a48c3e1972131696d4d2fa374520f1c",
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
    ).toBe("a170f6ef639dd5cc131bfb91f2800c083b91c537d9f147593a0319bacfccd3fa");
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
  it("preserves search output after a match longer than the offset window", () => {
    const data = new Uint8Array(220_000);
    let state = 42;
    for (let i = 200_000; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state & 255;
      if (i > 200_064 && (state >>> 0) % 3)
        data[i] = data[i - 1 - ((state >>> 8) % 64)];
    }
    const frame = compressLz4Search(data);
    expect(createHash("sha256").update(frame).digest("hex")).toBe(
      "f0cf545a87f0bd7985547315a7797f61d449b3bdeaf4aada3ceeed2e481d7bc1",
    );
    expect(
      Buffer.from(lz4.decompress(frame, data.length)).equals(Buffer.from(data)),
    ).toBe(true);
  });
  it("preserves short-period search output across long matches", () => {
    const cases = [
      [2, "89a032762ee7801571b50613f720743a8a4478b9151efa153ec464914d5ae7d3"],
      [3, "7bf5fe90dbbc7f21874c6743e205ffce4323d801d721b05e877986eca003c640"],
      [4, "316ba41c1e3ddef9813e66ff40c83e87c020106403e1d191e5f1b52697189bf0"],
      [5, "900be70fd59df4537ac31ff9a631c638d96ce339d92d39392c73109ff7303fd4"],
      [8, "d0631d347d6039199bfdb94bdceaf4eed73a88fa341b52b8639328223af71e4e"],
      [16, "42d912f641d996fe94a2c6b744e7dfb5f64e4909e617b632946064376c68de76"],
      [17, "c6123020bfd4493e1a766bb33ed65a5030540493b58747faf271715e6eb52c35"],
    ] as const;
    for (const [period, digest] of cases) {
      const data = new Uint8Array(160_000);
      let state = 42;
      for (let i = 0; i < 140_000; i++) data[i] = (i % period) * 41 + 1;
      for (let i = 140_000; i < data.length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        data[i] = state & 255;
        if (i > 140_064 && (state >>> 0) % 3)
          data[i] = data[i - 1 - ((state >>> 8) % 64)];
      }
      const frame = compressLz4Search(data);
      expect(createHash("sha256").update(frame).digest("hex")).toBe(digest);
      expect(
        Buffer.from(lz4.decompress(frame, data.length)).equals(
          Buffer.from(data),
        ),
      ).toBe(true);
    }
  });
  it("preserves output for longer repeated patterns and the cache limit", () => {
    const cases = [
      [17, "964fb17ebe83767f7a43ab8c13ad9379f51316aab9fbffa3af2c9a12e5896b26"],
      [64, "6d55f70ac8733510b0309c2770447ca4a2c1b2afd932b3147301a6b49ce2142e"],
      [512, "fdd5f8a4ef26e1207422fa31a59b9ca2641aa4f149e568483fcd497675b183f0"],
      [
        4096,
        "d5c3d4c8f93e1eb52bdf5fb7dc15055c7eab0c2c18e1a30684fed48765cb06bd",
      ],
      [
        4097,
        "4ceb42078882c14a108c7ce386d915fd0edc886996d3ba8e4e20cb4837709fea",
      ],
      [
        5760,
        "e6c6e99ce9afa91cd119f8e41177c4c1bca6e7e74336f7340b810b05dec31f19",
      ],
      [
        7680,
        "4bac428a7ed48e974a3136a78a165d4d7eb75c27b3607b7fa6eab6c8388d0d44",
      ],
      [
        11520,
        "15c525b8f57b96c2308bb45db940f50709b5caa51111a76177b326b7a8400766",
      ],
      [
        16383,
        "c4de20247bd8002d1c61995176bbc01cb0fa7f4242ed3d251dcc4c1c3d6cb950",
      ],
      [
        16384,
        "1d34ec692800affb1ac0171e7fc7ea0dbe864d61bf1c3f08fc04f0b8b26ecc9f",
      ],
    ] as const;
    for (const [period, digest] of cases) {
      let state = 42;
      const random = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
      };
      const data = new Uint8Array(160_000);
      for (let i = 0; i < period; i++) data[i] = random() & 255;
      for (let i = period; i < 140_000; i++) data[i] = data[i - period];
      for (let i = 140_000; i < data.length; i++) data[i] = random() & 255;
      const frame = compressLz4Search(data);
      expect(createHash("sha256").update(frame).digest("hex")).toBe(digest);
      expect(
        Buffer.from(lz4.decompress(frame, data.length)).equals(
          Buffer.from(data),
        ),
      ).toBe(true);
    }
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
        expect(frameHasValidEnds(best)).toBe(true);
        const fast = lz4.compress(data);
        const baseline = frameHasValidEnds(fast) ? fast : encoded;
        expect(best.length).toBeLessThanOrEqual(baseline.length);
      }
    }
  }, 30000);

  it.each([60 * 1024, 1024 * 1024])(
    "keeps a %i-byte slide payload compatible and no larger than the fast frame",
    (size) => {
      const data = new Uint8Array(size);
      const pattern = randomBytes(4096, 31);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 8192 < 4096 ? pattern[i % 4096] : 255;
      }
      const encoded = compressLz4Best(data);
      expect(Buffer.from(lz4.decompress(encoded, data.length))).toEqual(
        Buffer.from(data),
      );
      expect(frameHasValidEnds(encoded)).toBe(true);
      expect(encoded.length).toBeLessThanOrEqual(lz4.compress(data).length);
    },
  );

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
