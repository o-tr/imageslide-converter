/**
 * LZ4 frame encoder with a bounded hash-chain match search.
 *
 * The frame layout and match encoding follow lz4js 0.2.0 (ISC, John Chadwick).
 * Each 4 MiB block is independently encoded; the frame remains compatible with
 * lz4js's linked-block frame header and existing EIA readers.
 */
import lz4 from "lz4js";
import { mergeLz4Literals } from "./lz4LiteralMerge.ts";

const BLOCK_SIZE = 4 * 1024 * 1024;
const WINDOW = 65536;
const SEARCH_DEPTH = 64;
const HEADER = [4, 34, 77, 24, 64, 112, 223];
const POWER_SHIFT = 11;
const POWER_STRIDE = 1 << POWER_SHIFT;
const FULL_POWER_LIMIT = 1024 * 1024;
const LOW_POWERS = new Uint32Array(POWER_STRIDE);
LOW_POWERS[0] = 1;
for (let i = 1; i < LOW_POWERS.length; i++) {
  LOW_POWERS[i] = Math.imul(LOW_POWERS[i - 1], 257) >>> 0;
}

type PowerTable = {
  maxLength: number;
  values: Uint32Array;
  split: boolean;
};

type MatchContext = {
  words: DataView;
  prefix: Uint32Array;
  powers: PowerTable;
};

function createMatchContext(
  input: Uint8Array,
  sharedPowers?: PowerTable,
): MatchContext {
  const prefix = new Uint32Array(input.length + 1);
  let powers = sharedPowers;
  let newFull: Uint32Array | undefined;
  if (!powers || powers.maxLength < input.length) {
    if (input.length <= FULL_POWER_LIMIT) {
      newFull = new Uint32Array(input.length + 1);
      newFull[0] = 1;
      powers = { maxLength: input.length, values: newFull, split: false };
    } else {
      // 257^n = 257^(q * 2048) * 257^r (mod 2^32). Storing the
      // quotient and remainder tables needs about 16 KiB for a 4 MiB block.
      const high = new Uint32Array((input.length >>> POWER_SHIFT) + 1);
      high[0] = 1;
      const stride = Math.imul(LOW_POWERS[POWER_STRIDE - 1], 257) >>> 0;
      for (let i = 1; i < high.length; i++) {
        high[i] = Math.imul(high[i - 1], stride) >>> 0;
      }
      powers = { maxLength: input.length, values: high, split: true };
    }
  }
  for (let i = 0; i < input.length; i++) {
    prefix[i + 1] = (Math.imul(prefix[i], 257) + input[i]) >>> 0;
    if (newFull) newFull[i + 1] = Math.imul(newFull[i], 257) >>> 0;
  }
  return {
    words: new DataView(input.buffer, input.byteOffset, input.byteLength),
    prefix,
    powers,
  };
}

function compressBlock(
  input: Uint8Array,
  searchDepth: number,
  lazy: boolean,
  minimumMatch: number,
  lookahead: number,
  context: MatchContext,
  stats?: { depthLimited: boolean },
): Uint8Array | null {
  const end = input.length;
  const { words, prefix, powers } = context;
  // Hash mismatches prove a prefix differs; hash matches are still checked
  // byte-for-byte, so collisions cannot change the compressed output.
  // Comparing the difference of the two hashes needs one multiplication
  // rather than calculating each hash separately, modulo 2^32.
  const values = powers.values;
  const sameRange = powers.split
    ? (left: number, right: number, length: number) => {
        const power = Math.imul(
          values[length >>> POWER_SHIFT],
          LOW_POWERS[length & (POWER_STRIDE - 1)],
        );
        return (
          (prefix[left + length] - prefix[right + length]) >>> 0 ===
          Math.imul(prefix[left] - prefix[right], power) >>> 0
        );
      }
    : (left: number, right: number, length: number) =>
        (prefix[left + length] - prefix[right + length]) >>> 0 ===
        Math.imul(prefix[left] - prefix[right], values[length]) >>> 0;
  const output = new Uint8Array(end + Math.ceil(end / 255) + 32);
  const heads = new Int32Array(WINDOW);
  const previous = new Int32Array(WINDOW);
  let pos = 0;
  let anchor = 0;
  let written = 0;
  let matches = 0;

  const hashAt = (at: number) => {
    const word =
      (input[at] |
        (input[at + 1] << 8) |
        (input[at + 2] << 16) |
        (input[at + 3] << 24)) >>>
      0;
    return (Math.imul(word, 2654435761) >>> 16) & 0xffff;
  };
  const insert = (at: number) => {
    const hash = hashAt(at);
    previous[at & 0xffff] = heads[hash];
    heads[hash] = at + 1;
  };
  const lengthBytes = (value: number) => {
    let remaining = value;
    while (remaining >= 255) {
      output[written++] = 255;
      remaining -= 255;
    }
    output[written++] = remaining;
  };

  const findMatch = (at: number) => {
    let candidate = heads[hashAt(at)] - 1;
    let bestLength = 0;
    let bestOffset = 0;
    const lowerBound = Math.max(0, at - 65535);
    let tries = 0;
    for (
      ;
      tries < searchDepth && candidate >= lowerBound && candidate < at;
      tries++
    ) {
      if (
        input[candidate] === input[at] &&
        input[candidate + 1] === input[at + 1] &&
        input[candidate + 2] === input[at + 2] &&
        input[candidate + 3] === input[at + 3] &&
        // A mismatch here cannot tie or improve the best length already found.
        (bestLength <= 4 ||
          (input[candidate + bestLength - 1] === input[at + bestLength - 1] &&
            sameRange(candidate, at, bestLength)))
      ) {
        let length = 4;
        while (
          at + length + 4 <= end - 5 &&
          words.getUint32(candidate + length, true) ===
            words.getUint32(at + length, true)
        )
          length += 4;
        while (
          at + length < end - 5 &&
          input[candidate + length] === input[at + length]
        )
          length++;
        // Equal-length matches cost the same number of LZ4 bytes. Prefer a
        // larger offset: the decoder needs fewer overlapping prefix copies.
        if (
          length > bestLength ||
          (length === bestLength && at - candidate > bestOffset)
        ) {
          bestLength = length;
          bestOffset = at - candidate;
          // Once one native copy is possible, further matches cannot improve
          // this full-length match. Bound work for exceptionally long runs.
          if (
            at + length === end - 5 &&
            (bestOffset >= bestLength || bestLength > 65535)
          )
            break;
        }
      }
      const next = previous[candidate & 0xffff] - 1;
      if (next >= candidate) break;
      candidate = next;
    }
    // A larger search depth can only change this match if there was another
    // candidate inside the window when this search exhausted its budget.
    if (
      stats &&
      tries === searchDepth &&
      candidate >= lowerBound &&
      candidate < at
    )
      stats.depthLimited = true;
    return { bestLength, bestOffset };
  };

  while (pos <= end - 12) {
    const { bestLength, bestOffset } = findMatch(pos);
    insert(pos);
    // One-byte lazy matching avoids committing to a short match just before
    // a longer one. Both choices use the ordinary LZ4 sequence format.
    let postpone = false;
    if (lazy && bestLength >= (lookahead === 1 ? 4 : minimumMatch)) {
      for (
        let ahead = 1;
        ahead <= lookahead && pos + ahead <= end - 12;
        ahead++
      ) {
        if (findMatch(pos + ahead).bestLength > bestLength + ahead) {
          postpone = true;
          break;
        }
      }
    }
    if (postpone) {
      pos++;
      continue;
    }
    if (bestLength < minimumMatch) {
      pos++;
      continue;
    }
    const literalLength = pos - anchor;
    const matchCode = bestLength - 4;
    output[written++] =
      (Math.min(literalLength, 15) << 4) | Math.min(matchCode, 15);
    if (literalLength >= 15) lengthBytes(literalLength - 15);
    output.set(input.subarray(anchor, pos), written);
    written += literalLength;
    output[written++] = bestOffset & 255;
    output[written++] = bestOffset >>> 8;
    if (matchCode >= 15) lengthBytes(matchCode - 15);
    const matchEnd = pos + bestLength;
    // Add positions covered by a match to the search index for later matches.
    for (let next = pos + 1; next < matchEnd && next <= end - 4; next++)
      insert(next);
    pos = matchEnd;
    anchor = pos;
    matches++;
  }
  if (!matches) return null;
  const tail = end - anchor;
  output[written++] = Math.min(tail, 15) << 4;
  if (tail >= 15) lengthBytes(tail - 15);
  output.set(input.subarray(anchor), written);
  written += tail;
  return output.subarray(0, written);
}

function compressLz4Frame(
  input: Uint8Array,
  searchDepth: number,
  lazy: boolean,
  minimumMatch = 4,
  lookahead = 1,
  contexts?: Map<number, MatchContext>,
  stats?: { depthLimited: boolean },
): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.from(HEADER)];
  let total = HEADER.length + 4;
  let powers = contexts?.values().next().value?.powers;
  for (let start = 0; start < input.length; start += BLOCK_SIZE) {
    const raw = input.subarray(
      start,
      Math.min(start + BLOCK_SIZE, input.length),
    );
    let context = contexts?.get(start);
    if (!context) {
      context = createMatchContext(raw, powers);
      if (contexts) {
        // Two 4 MiB contexts cover a typical full-HD slide while keeping
        // temporary memory bounded for much larger inputs.
        if (contexts.size >= 2) {
          const oldest = contexts.keys().next().value;
          if (oldest !== undefined) contexts.delete(oldest);
        }
        contexts.set(start, context);
      }
    }
    powers = context.powers;
    const compressed = compressBlock(
      raw,
      searchDepth,
      lazy,
      minimumMatch,
      lookahead,
      context,
      stats,
    );
    const payload =
      compressed && compressed.length < raw.length ? compressed : raw;
    const length =
      payload === raw ? (payload.length | 0x80000000) >>> 0 : payload.length;
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, length, true);
    parts.push(size, payload);
    total += 4 + payload.length;
  }
  const frame = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    frame.set(part, offset);
    offset += part.length;
  }
  return frame;
}

export function compressLz4Search(input: Uint8Array): Uint8Array {
  return compressLz4Frame(input, SEARCH_DEPTH, true);
}

// Compare the operations used by the TypeUdon decoder. This is a conservative
// filter, not a substitute for measuring native extern work or Unity frame time.
function decodeWork(frame: Uint8Array) {
  let position = HEADER.length;
  let sequences = 0;
  let copies = 0;
  let extensions = 0;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  while (true) {
    const block = view.getUint32(position, true);
    position += 4;
    if (block === 0) break;
    const end = position + (block & 0x7fffffff);
    if (block & 0x80000000) {
      copies++;
      position = end;
      continue;
    }
    const readLength = (initial: number) => {
      let length = initial;
      if (initial === 15) {
        let extra: number;
        do {
          extra = frame[position++];
          length += extra;
          extensions++;
        } while (extra === 255);
      }
      return length;
    };
    while (position < end) {
      sequences++;
      const token = frame[position++];
      const literal = readLength(token >>> 4);
      if (literal > 0) copies++;
      position += literal;
      if (position === end) break;
      const offset = frame[position] | (frame[position + 1] << 8);
      position += 2;
      const match = readLength(token & 15) + 4;
      let copied = Math.min(offset, match);
      copies++;
      while (copied < match) {
        copied += Math.min(copied, match - copied);
        copies++;
      }
    }
  }
  return { sequences, copies, extensions };
}

/** Select a faster-decoding candidate only inside the documented size budget. */
export function fitsDecodeSpeedBudget(
  compactLength: number,
  compactCost: number,
  fastLength: number,
  candidateLength: number,
  candidateCost: number,
): boolean {
  return (
    candidateLength <= fastLength &&
    candidateLength * 100 <= compactLength * 103 &&
    candidateCost * 10 <= compactCost * 9
  );
}

/** Favor lower decode work while limiting size growth relative to the compact candidate. */
export function compressLz4Best(input: Uint8Array): Uint8Array {
  const fast = lz4.compress(input);
  let best = fast;
  const contexts = new Map<number, MatchContext>();
  // Sequence dispatch is substantially more expensive than a native bulk
  // copy in the measured TypeUdon decoder. Treat this as a heuristic; validate
  // it against the VM when changing either the decoder or these weights.
  const cost = (work: ReturnType<typeof decodeWork>) =>
    16 * work.sequences + 4 * work.copies + work.extensions;
  let bestCost = cost(decodeWork(best));
  for (const makeFrame of [
    () => compressLz4Frame(input, 16, false, 4, 1, contexts),
    () => compressLz4Frame(input, SEARCH_DEPTH, true, 4, 1, contexts),
  ]) {
    const searched = makeFrame();
    if (searched.length > best.length) continue;
    const candidateCost = cost(decodeWork(searched));
    if (candidateCost < bestCost) {
      best = searched;
      bestCost = candidateCost;
    }
  }
  // Short matches require a separate sequence and often an extra native copy.
  // Allow a small bounded size tradeoff only for a substantial estimated win,
  // and never emit a larger frame than the original lz4js fast encoder.
  if (input.length >= 256) {
    const speed = compressLz4Frame(input, SEARCH_DEPTH, true, 6, 1, contexts);
    const speedCost = cost(decodeWork(speed));
    if (
      fitsDecodeSpeedBudget(
        best.length,
        bestCost,
        fast.length,
        speed.length,
        speedCost,
      )
    ) {
      best = speed;
    }
  }
  // Spend more encoder work exploring independent standard-LZ4 parses. The
  // previous result is the hard size ceiling, so this stage can trade bytes
  // between candidates but never make the existing output larger.
  if (input.length >= 256) {
    const sizeLimit = best.length;
    // Calibrated against the TypeUdon decoder: sequence dispatch dominates
    // native copy calls. Keep the original scoring above to preserve the
    // existing candidate's size ceiling.
    const vmCost = (work: ReturnType<typeof decodeWork>) =>
      30 * work.sequences + 2 * work.copies + work.extensions;
    let bestVmCost = vmCost(decodeWork(best));
    // Once a profile has traversed every candidate within the window at
    // every search position, increasing only its depth produces the same
    // frame. Skip those duplicate passes without approximating the result.
    const completeProfiles = new Set<string>();
    for (const [depth, lookahead, matches] of [
      [2048, 1, [4, 6, 8, 10, 12]],
      [8192, 1, [4, 6, 8]],
      [512, 4, [4, 6, 8, 10, 12]],
      // Explore the full LZ4 offset window and wider lazy lookahead. Encoder
      // work is deliberately traded for lower decoder work here.
      [65535, 1, [4, 6, 8, 10, 12]],
      [8192, 4, [4, 6, 8, 10, 12]],
      [8192, 8, [4, 6, 8, 10, 12]],
    ] as const) {
      for (const minimumMatch of matches) {
        const profile = `${lookahead}:${minimumMatch}`;
        if (completeProfiles.has(profile)) continue;
        const stats = { depthLimited: false };
        const candidate = compressLz4Frame(
          input,
          depth,
          true,
          minimumMatch,
          lookahead,
          contexts,
          stats,
        );
        if (!stats.depthLimited) completeProfiles.add(profile);
        if (candidate.length > sizeLimit) continue;
        const candidateCost = vmCost(decodeWork(candidate));
        if (candidateCost < bestVmCost) {
          best = candidate;
          bestVmCost = candidateCost;
        }
      }
    }
    // Match indices are no longer used by the literal post-pass. Release
    // references before it allocates its own per-match working state.
    contexts.clear();
    best = mergeLz4Literals(
      best,
      input,
      sizeLimit,
      (candidate) => vmCost(decodeWork(candidate)),
      vmCost,
      { linkedBoundary: input.length > BLOCK_SIZE, extendMatches: true },
    );
  }
  return best;
}
