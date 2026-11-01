import { Buffer } from "buffer";
import { createHash } from "node:crypto";
import lz4 from "lz4js";
import { describe, expect, it } from "vitest";
import {
  mergeLinkedBoundaryMatches,
  mergeLz4Literals,
  mergeZeroCostMatches,
} from "./lz4LiteralMerge";
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

function decoderWork(frame: Uint8Array) {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let position = 7;
  let sequences = 0;
  let copies = 0;
  let extensions = 0;
  for (;;) {
    const block = view.getUint32(position, true);
    position += 4;
    if (!block) break;
    const end = position + (block & 0x7fffffff);
    if (block & 0x80000000) {
      copies++;
      position = end;
      continue;
    }
    const readLength = (initial: number) => {
      let value = initial;
      if (initial === 15) {
        let extra: number;
        do {
          extra = frame[position++];
          value += extra;
          extensions++;
        } while (extra === 255);
      }
      return value;
    };
    while (position < end) {
      sequences++;
      const token = frame[position++];
      const literals = readLength(token >>> 4);
      if (literals) copies++;
      position += literals;
      if (position === end) break;
      const offset = view.getUint16(position, true);
      position += 2;
      const length = readLength(token & 15) + 4;
      let copied = Math.min(offset, length);
      copies++;
      while (copied < length) {
        copied += Math.min(copied, length - copied);
        copies++;
      }
    }
  }
  return { sequences, copies, extensions };
}

function decoderCost(frame: Uint8Array): number {
  const work = decoderWork(frame);
  return 30 * work.sequences + 2 * work.copies + work.extensions;
}

describe("LZ4 literal merging", () => {
  it("compares a raw-block candidate with literal merging inside the budget", () => {
    const data = new Uint8Array(2048);
    let state = 81;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state >>> 24;
    }
    data.copyWithin(1500, 1000, 1200);
    const frame = compressLz4Search(data);
    const work = (value: ReturnType<typeof decoderWork>) =>
      30 * value.sequences + 2 * value.copies + value.extensions;
    const options = { linkedBoundary: false, rawBlocks: true };
    const selected = mergeLz4Literals(
      frame,
      data,
      data.length + 15,
      decoderCost,
      work,
      options,
    );
    expect(
      new DataView(selected.buffer, selected.byteOffset).getUint32(7, true) >>>
        31,
    ).toBe(1);
    expect(decoderCost(selected)).toBeLessThan(decoderCost(frame));
    expect(selected.length).toBeLessThanOrEqual(data.length + 15);
    expect(Buffer.from(lz4.decompress(selected, data.length))).toEqual(
      Buffer.from(data),
    );
    const limited = mergeLz4Literals(
      frame,
      data,
      frame.length,
      decoderCost,
      work,
      options,
    );
    expect(limited.length).toBeLessThanOrEqual(frame.length);
    expect(Buffer.from(lz4.decompress(limited, data.length))).toEqual(
      Buffer.from(data),
    );
  });

  it("keeps a following linked block valid when the first block becomes raw", () => {
    const blockSize = 4 * 1024 * 1024;
    const data = new Uint8Array(blockSize + 8192);
    let state = 109;
    for (let i = 0; i < blockSize; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state >>> 24;
    }
    data.copyWithin(3_000_000, 2_980_000, 2_997_500);
    data.set(mixedBytes(8192), blockSize);
    const frame = compressLz4Search(data);
    const header = new DataView(frame.buffer, frame.byteOffset).getUint32(
      7,
      true,
    );
    expect(header >>> 31).toBe(0);
    const gap = blockSize - header;
    const limit = frame.length + gap + 100;
    const work = (value: ReturnType<typeof decoderWork>) => value.extensions;
    const cost = (value: Uint8Array) => work(decoderWork(value));
    const baseline = mergeLz4Literals(frame, data, limit, cost, work, {
      linkedBoundary: true,
      extendMatches: true,
    });
    const result = mergeLz4Literals(frame, data, limit, cost, work, {
      linkedBoundary: true,
      extendMatches: true,
      rawBlocks: true,
    });
    expect(
      new DataView(result.buffer, result.byteOffset).getUint32(7, true) >>> 31,
    ).toBe(1);
    expect(result.length).toBeLessThanOrEqual(limit);
    expect(cost(result)).toBeLessThanOrEqual(cost(baseline));
    expect(Buffer.from(lz4.decompress(result, data.length))).toEqual(
      Buffer.from(data),
    );
  }, 30000);

  it("extends a match backwards to reduce literals without increasing work", () => {
    // First sequence: 16 literals and a four-byte offset-eight match. The
    // second match and five-byte tail keep this a valid compressed block.
    const data = Buffer.from(`ABCDEFGHABCDEFGHABCD${"ABCD".repeat(5)}12345`);
    const frame = Uint8Array.from([
      4,
      34,
      77,
      24,
      64,
      112,
      223,
      30,
      0,
      0,
      0,
      0xf0,
      1,
      ...Buffer.from("ABCDEFGHABCDEFGH"),
      8,
      0,
      0x0f,
      4,
      0,
      1,
      0x50,
      ...Buffer.from("12345"),
      0,
      0,
      0,
      0,
    ]);
    expect(Buffer.from(lz4.decompress(frame, data.length))).toEqual(data);
    const result = mergeLz4Literals(
      frame,
      data,
      frame.length,
      decoderCost,
      undefined,
      { linkedBoundary: false, extendMatches: true },
    );
    expect(result.length).toBeLessThan(frame.length);
    expect(decoderCost(result)).toBeLessThanOrEqual(decoderCost(frame));
    expect(Buffer.from(lz4.decompress(result, data.length))).toEqual(data);
  });

  it("does not trade additional extension bytes for fewer literal copies", () => {
    const initial = Buffer.from("ABCD".repeat(4));
    const tail = Buffer.from("12345");
    const payload = Uint8Array.from([
      0xff,
      1,
      ...initial,
      4,
      0,
      1,
      0x1e,
      65,
      4,
      0,
      0x50,
      ...tail,
    ]);
    const size = Buffer.alloc(4);
    size.writeUInt32LE(payload.length);
    const frame = Buffer.concat([
      Buffer.from([4, 34, 77, 24, 64, 112, 223]),
      size,
      payload,
      Buffer.alloc(4),
    ]);
    const data = Buffer.from(`${"ABCD".repeat(13)}ABC12345`);
    const result = mergeLz4Literals(
      frame,
      data,
      frame.length,
      decoderCost,
      undefined,
      {
        linkedBoundary: false,
        extendMatches: true,
      },
    );
    const before = decoderWork(frame);
    const after = decoderWork(result);
    expect(result.length).toBeLessThan(frame.length);
    expect(after.extensions).toBeLessThan(before.extensions);
    expect(after.copies).toBeLessThanOrEqual(before.copies);
    expect(Buffer.from(lz4.decompress(result, data.length))).toEqual(data);
  });

  it("reuses a matching byte at the boundary of linked blocks", () => {
    // Eight raw bytes followed by a linked block with one literal, an
    // offset-one match of nine bytes, and the required five-byte literal tail.
    const data = new Uint8Array(23).fill(73);
    const frame = Uint8Array.from([
      4, 34, 77, 24, 64, 112, 223, 8, 0, 0, 128, 73, 73, 73, 73, 73, 73, 73, 73,
      10, 0, 0, 0, 0x15, 73, 1, 0, 0x50, 73, 73, 73, 73, 73, 0, 0, 0, 0,
    ]);
    const merged = mergeLinkedBoundaryMatches(frame, data, decoderCost);
    expect(
      Buffer.from(mergeZeroCostMatches(frame, data, decoderCost, true)),
    ).toEqual(Buffer.from(merged));
    expect(merged.length).toBeLessThan(frame.length);
    expect(decoderCost(merged)).toBeLessThan(decoderCost(frame));
    expect(Buffer.from(lz4.decompress(merged, data.length))).toEqual(
      Buffer.from(data),
    );
    expect(mergeLinkedBoundaryMatches(frame, data, () => 0)).toBe(frame);
    const changed = Uint8Array.from(data);
    changed[7] ^= 1;
    const changedFrame = Uint8Array.from(frame);
    changedFrame[18] ^= 1;
    expect(mergeLinkedBoundaryMatches(changedFrame, changed, decoderCost)).toBe(
      changedFrame,
    );
    // Extending a length-18 match would introduce an extension byte. Do not
    // trade additional VM work for removing the one-byte literal.
    const extensionFrame = Uint8Array.from(frame);
    extensionFrame[23] = 0x1e;
    const extensionData = new Uint8Array(32).fill(73);
    expect(
      mergeLinkedBoundaryMatches(extensionFrame, extensionData, decoderCost),
    ).toBe(extensionFrame);
  }, 30000);

  it("removes free matches without increasing size or decoder work", () => {
    const data = new Uint8Array(5000);
    let state = 1;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const value = state >>> 0;
      data[i] = i > 30 && value % 5 ? data[i - 1 - (value % 30)] : value & 7;
    }
    const frame = compressLz4Search(data);
    const merged = mergeZeroCostMatches(frame, data, decoderCost);
    expect(merged.length).toBeLessThanOrEqual(frame.length);
    expect(decoderCost(merged)).toBeLessThan(decoderCost(frame));
    expect(Buffer.from(lz4.decompress(merged, data.length))).toEqual(
      Buffer.from(data),
    );
    expect(mergeZeroCostMatches(frame, data, () => 0)).toBe(frame);
  });

  it("preserves free-match decoding across raw and compressed blocks", () => {
    const data = new Uint8Array(4 * 1024 * 1024 + 8192);
    let state = 17;
    for (let i = 0; i < 4 * 1024 * 1024; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state & 255;
    }
    data.set(mixedBytes(8192), 4 * 1024 * 1024);
    const frame = compressLz4Search(data);
    const merged = mergeZeroCostMatches(frame, data, decoderCost);
    expect(merged.length).toBeLessThanOrEqual(frame.length);
    expect(decoderCost(merged)).toBeLessThanOrEqual(decoderCost(frame));
    expect(Buffer.from(lz4.decompress(merged, data.length))).toEqual(
      Buffer.from(data),
    );
    const limit = frame.length + 1000;
    const preferLarger = (value: Uint8Array) => -value.length;
    const selected = mergeLz4Literals(frame, data, limit, preferLarger);
    const sequential = mergeZeroCostMatches(selected, data, preferLarger, true);
    const combined = mergeLz4Literals(
      frame,
      data,
      limit,
      preferLarger,
      undefined,
      { linkedBoundary: true },
    );
    expect(Buffer.from(combined)).toEqual(Buffer.from(sequential));
  }, 30000);

  it("chooses the same candidate when decoder work is measured without encoding", () => {
    for (const raw of [
      mixedBytes(12_000),
      new Uint8Array(4 * 1024 * 1024 + 8192),
    ]) {
      if (raw.length > 12_000) raw.set(mixedBytes(8192), 4 * 1024 * 1024);
      const frame = compressLz4Search(raw);
      for (const extra of [0, 1, 15, 255, 1200]) {
        const limit = frame.length + extra;
        const reference = mergeLz4Literals(frame, raw, limit, decoderCost);
        const measured = mergeLz4Literals(
          frame,
          raw,
          limit,
          decoderCost,
          (work) => 30 * work.sequences + 2 * work.copies + work.extensions,
        );
        expect(Buffer.from(measured)).toEqual(Buffer.from(reference));
        const sequential = mergeZeroCostMatches(
          measured,
          raw,
          decoderCost,
          true,
        );
        const combined = mergeLz4Literals(
          frame,
          raw,
          limit,
          decoderCost,
          (work) => 30 * work.sequences + 2 * work.copies + work.extensions,
          { linkedBoundary: true },
        );
        expect(Buffer.from(combined)).toEqual(Buffer.from(sequential));
      }
    }
  }, 30000);

  it("preserves the selected frame at literal-length and budget boundaries", () => {
    const raw = mixedBytes(12_000);
    const frame = compressLz4Search(raw);
    const expected = [
      [0, "553740ba5611351cc3f4d1b76675c5c2cb0d25000aaee947baf428b3cdad8bca"],
      [1, "da4eff7842e2b31026d68ba79dca54550673132e10b48ab706dd2800170d4a85"],
      [14, "af10a161d96763508b41faed6124d22fc39b88ef1e790ba0a8b1197be9c4020d"],
      [15, "b107832cd8094cb76202c2fd0168defeb0f0d72789b9d6fa7f3056128dce27f4"],
      [254, "40b5fa4e3b3b328235339785e1062ff05197370c785984302d11ded96da5e958"],
      [255, "d4dd21070945ee86b349cc8b5d248e7ed58bbd7cecf2c35439a3a35faeacd21c"],
      [510, "97b59e2ca3de9c61d7b11e10f8ea517c7a7519f32b8fb6d5c0488be2509f975a"],
      [
        1200,
        "a1cd18becbe896ec11cc8535ef21a3ba19ff456ab3cd588a009e38dcf9ce001a",
      ],
    ] as const;
    for (const [extra, digest] of expected) {
      const result = mergeLz4Literals(
        frame,
        raw,
        frame.length + extra,
        (value) => -value.length,
      );
      expect(createHash("sha256").update(result).digest("hex")).toBe(digest);
    }
  });

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
