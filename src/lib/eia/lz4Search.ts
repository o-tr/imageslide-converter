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
  prefix?: Uint32Array;
  powers?: PowerTable;
  periodHashes?: Uint16Array;
  // An exhaustive search with no emitted match proves the block is empty
  // for any lookahead at higher thresholds and search depths as well.
  emptyProof?: { minimum: number; depth: number };
};

function createMatchContext(
  input: Uint8Array,
  sharedPowers?: PowerTable,
): MatchContext {
  return {
    words: new DataView(input.buffer, input.byteOffset, input.byteLength),
    powers: sharedPowers,
  };
}

function ensureMatchContext(
  input: Uint8Array,
  context: MatchContext,
): { prefix: Uint32Array; powers: PowerTable } {
  if (context.prefix && context.powers)
    return { prefix: context.prefix, powers: context.powers };
  const prefix = new Uint32Array(input.length + 1);
  let powers = context.powers;
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
  context.prefix = prefix;
  context.powers = powers;
  return { prefix, powers };
}

function compressBlock(
  input: Uint8Array,
  searchDepth: number,
  lazy: boolean,
  minimumMatch: number,
  lookahead: number,
  context: MatchContext,
  stats?: { depthLimited: boolean; minimumActive: number },
): Uint8Array | null {
  const end = input.length;
  const { words } = context;
  // Hash hits are verified byte-for-byte.
  const prefix = context.prefix ?? new Uint32Array(0);
  const powers = context.powers;
  const values = powers?.values ?? LOW_POWERS;
  let initialized:
    | ((left: number, right: number, length: number) => boolean)
    | undefined;
  const sameRange = !context.prefix
    ? (left: number, right: number, length: number): boolean => {
        // The first four bytes already match. For at most eight bytes, the
        // last word covers the rest without constructing a hash table.
        if (length <= 8)
          return (
            words.getUint32(left + length - 4, true) ===
            words.getUint32(right + length - 4, true)
          );
        if (!initialized) {
          const built = ensureMatchContext(input, context);
          const p = built.prefix;
          const v = built.powers.values;
          initialized = built.powers.split
            ? (l, r, n) =>
                (p[l + n] - p[r + n]) >>> 0 ===
                Math.imul(
                  p[l] - p[r],
                  n < POWER_STRIDE
                    ? LOW_POWERS[n]
                    : Math.imul(
                        v[n >>> POWER_SHIFT],
                        LOW_POWERS[n & (POWER_STRIDE - 1)],
                      ),
                ) >>>
                  0
            : (l, r, n) =>
                (p[l + n] - p[r + n]) >>> 0 ===
                Math.imul(p[l] - p[r], v[n]) >>> 0;
        }
        return initialized(left, right, length);
      }
    : powers?.split
      ? (left: number, right: number, length: number) => {
          const power =
            length < POWER_STRIDE
              ? LOW_POWERS[length]
              : Math.imul(
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
  // Allocate the compressed block only when a match will actually be emitted.
  let output: Uint8Array | undefined;
  const heads = new Int32Array(WINDOW);
  const previous = new Int32Array(WINDOW);
  let pos = 0;
  let anchor = 0;
  let written = 0;

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
    const target = output as Uint8Array;
    let remaining = value;
    // Long length extensions consist of repeated 255 bytes.
    if (remaining >= 1020) {
      const count = Math.floor(remaining / 255);
      target.fill(255, written, written + count);
      written += count;
      remaining -= count * 255;
    }
    while (remaining >= 255) {
      target[written++] = 255;
      remaining -= 255;
    }
    target[written++] = remaining;
  };

  const findMatch = (at: number) => {
    const hash = hashAt(at);
    let candidate = heads[hash] - 1;
    const lowerBound = Math.max(0, at - 65535);
    // No candidate can be traversed, so neither the match nor the search
    // depth status can change. Avoid reading the target word in this case.
    if (candidate < lowerBound || candidate >= at)
      return { bestLength: 0, bestOffset: 0, hash };
    const targetWord = words.getUint32(at, true);
    const maxLength = end - 5 - at;
    let bestLength = 0;
    let bestOffset = 0;
    let tries = 0;
    for (
      ;
      tries < searchDepth && candidate >= lowerBound && candidate < at;
      tries++
    ) {
      if (
        words.getUint32(candidate, true) === targetWord &&
        // A mismatch here cannot tie or improve the best length already found.
        (bestLength <= 4 ||
          (input[candidate + bestLength - 1] === input[at + bestLength - 1] &&
            sameRange(candidate, at, bestLength)))
      ) {
        let length = 4;
        while (length + 4 <= maxLength) {
          const difference =
            words.getUint32(candidate + length, true) ^
            words.getUint32(at + length, true);
          if (difference !== 0) {
            // Little-endian words place the first differing byte at the
            // least significant set bit of the XOR.
            length += (31 - Math.clz32(difference & -difference)) >>> 3;
            break;
          }
          length += 4;
          // Once a word matches, check three more together to reduce loop
          // overhead for long runs without penalizing the first mismatch.
          if (
            length + 12 <= maxLength &&
            words.getUint32(candidate + length, true) ===
              words.getUint32(at + length, true) &&
            words.getUint32(candidate + length + 4, true) ===
              words.getUint32(at + length + 4, true) &&
            words.getUint32(candidate + length + 8, true) ===
              words.getUint32(at + length + 8, true)
          )
            length += 12;
        }
        while (
          length < maxLength &&
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
            length === maxLength &&
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
    return { bestLength, bestOffset, hash };
  };

  // A postponed match advances one position without changing the index after
  // the first lookahead. That result is valid for the next main iteration.
  let pending: ReturnType<typeof findMatch> | undefined;
  let pendingSecond: ReturnType<typeof findMatch> | undefined;
  let pendingThird: ReturnType<typeof findMatch> | undefined;
  while (pos <= end - 12) {
    // findMatch already computed this position's hash. Reuse it for the
    // insertion; hashes for the remaining matched positions are unchanged.
    const { bestLength, bestOffset, hash } = pending ?? findMatch(pos);
    pending = undefined;
    // Inserting this position changes only its hash chain. The overwritten
    // ring entry is already outside the later position's search window.
    const saved = pendingSecond?.hash !== hash ? pendingSecond : undefined;
    // The third-position result also survives only an unrelated insertion.
    const savedThird = pendingThird?.hash !== hash ? pendingThird : undefined;
    // If we postpone immediately, the third position becomes the second.
    pendingSecond = savedThird;
    pendingThird = undefined;
    previous[pos & 0xffff] = heads[hash];
    heads[hash] = pos + 1;
    // One-byte lazy matching avoids committing to a short match just before
    // a longer one. Both choices use the ordinary LZ4 sequence format.
    let postpone = false;
    // Below the minimum, either decision advances by one byte. A match
    // reaching the last legal match byte cannot be beaten by a later start.
    if (lazy && pos + bestLength < end - 5 && bestLength >= minimumMatch) {
      for (
        let ahead = 1;
        ahead <= lookahead && pos + ahead <= end - 12;
        ahead++
      ) {
        const next =
          ahead === 1 && saved
            ? saved
            : ahead === 2 && savedThird
              ? savedThird
              : findMatch(pos + ahead);
        if (ahead === 1) pending = next;
        if (ahead === 2) pendingSecond = next;
        if (ahead === 3) pendingThird = next;
        if (next.bestLength > bestLength + ahead) {
          postpone = true;
          break;
        }
      }
    }
    if (postpone) {
      pos++;
      continue;
    }
    pending = undefined;
    pendingSecond = undefined;
    pendingThird = undefined;
    if (bestLength < minimumMatch) {
      pos++;
      continue;
    }
    if (stats && bestLength < stats.minimumActive)
      stats.minimumActive = bestLength;
    output ??= new Uint8Array(end + Math.ceil(end / 255) + 32);
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
    // Only the final window can affect later searches.
    if (matchEnd <= end - 12) {
      let next = Math.max(pos + 1, matchEnd - 65535);
      // Offset one repeats a single byte. Fully contained words therefore
      // have the same hash as the matched position; only the final three
      // positions can include bytes beyond the match.
      if (bestOffset === 1) {
        let head = heads[hash];
        for (; next <= matchEnd - 4; next++) {
          previous[next & 0xffff] = head;
          head = next + 1;
        }
        heads[hash] = head;
      } else if (
        bestOffset <= 16383 &&
        matchEnd - next >= Math.max(1024, bestOffset * 4)
      ) {
        // Reuse 16-bit hashes for periodic positions.
        let hashes = context.periodHashes;
        if (!hashes || hashes.length < bestOffset) {
          hashes = new Uint16Array(bestOffset);
          context.periodHashes = hashes;
        }
        for (let i = 0; i < bestOffset; i++) hashes[i] = hashAt(next + i);
        let phase = 0;
        for (; next <= matchEnd - 4; next++) {
          const repeatedHash = hashes[phase];
          previous[next & 0xffff] = heads[repeatedHash];
          heads[repeatedHash] = next + 1;
          if (++phase === bestOffset) phase = 0;
        }
      }
      for (; next < matchEnd; next++) insert(next);
    }
    pos = matchEnd;
    anchor = pos;
  }
  if (!output) return null;
  const tail = end - anchor;
  output[written++] = Math.min(tail, 15) << 4;
  if (tail >= 15) lengthBytes(tail - 15);
  output.set(input.subarray(anchor), written);
  written += tail;
  return output.subarray(0, written);
}

// Without an emitted match, every position is inserted in order. A lazy
// postponement requires a strictly longer future match, which must eventually
// be emitted. Thus an exhaustive empty search proves there is no match at
// the threshold at any position, independently of the lookahead distance.
function compressBlockWithProof(
  raw: Uint8Array,
  depth: number,
  minimum: number,
  lookahead: number,
  context: MatchContext,
  stats: { depthLimited: boolean; minimumActive: number },
): Uint8Array | null {
  const proof = context.emptyProof;
  if (proof && minimum >= proof.minimum && depth >= proof.depth) return null;
  const local = {
    depthLimited: false,
    minimumActive: Number.POSITIVE_INFINITY,
  };
  const compressed = compressBlock(
    raw,
    depth,
    true,
    minimum,
    lookahead,
    context,
    local,
  );
  stats.depthLimited ||= local.depthLimited;
  stats.minimumActive = Math.min(stats.minimumActive, local.minimumActive);
  if (compressed === null && !local.depthLimited) {
    const previous = context.emptyProof;
    if (
      !previous ||
      minimum < previous.minimum ||
      (minimum === previous.minimum && depth < previous.depth)
    )
      context.emptyProof = { minimum, depth };
  }
  return compressed;
}

/** @internal Exposed for encoder invariant tests. */
export function compressLz4Frame(
  input: Uint8Array,
  searchDepth: number,
  lazy: boolean,
  minimumMatch = 4,
  lookahead = 1,
  contexts?: Map<number, MatchContext>,
  stats?: { depthLimited: boolean; minimumActive: number },
  deferContext = false,
  emptyProofs?: Map<number, { minimum: number; depth: number }>,
  maxFrameLength = Number.POSITIVE_INFINITY,
): Uint8Array | null {
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
      context.emptyProof = emptyProofs?.get(start);
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
    let compressed: Uint8Array | null;
    if (deferContext && input.length > BLOCK_SIZE && lazy && stats) {
      compressed = compressBlockWithProof(
        raw,
        searchDepth,
        minimumMatch,
        lookahead,
        context,
        stats,
      );
      if (context.emptyProof) emptyProofs?.set(start, context.emptyProof);
    } else {
      if (!deferContext && !context.prefix) ensureMatchContext(raw, context);
      compressed = compressBlock(
        raw,
        searchDepth,
        lazy,
        minimumMatch,
        lookahead,
        context,
        stats,
      );
    }
    powers = context.powers;
    const payload =
      compressed && compressed.length < raw.length ? compressed : raw;
    const length =
      payload === raw ? (payload.length | 0x80000000) >>> 0 : payload.length;
    total += 4 + payload.length;
    if (total <= maxFrameLength) {
      const size = new Uint8Array(4);
      new DataView(size.buffer).setUint32(0, length, true);
      parts.push(size, payload);
    } else {
      // The frame can no longer fit. Keep collecting search statistics, but
      // release compressed blocks instead of retaining them until the end.
      parts.length = 0;
    }
  }
  // All blocks still had to be searched for their profile statistics, but
  // an oversized candidate cannot be selected. Avoid allocating and copying
  // the complete frame when the caller supplied a hard size limit.
  if (total > maxFrameLength) return null;
  const frame = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    frame.set(part, offset);
    offset += part.length;
  }
  return frame;
}

// Search frames use the original input for every uncompressed block. Retain
// only non-raw bytes when raw blocks dominate, and restore them on demand.
type StoredFrame =
  | { full: Uint8Array; length: number }
  | {
      compact: Uint8Array;
      spans: { out: number; input: number; size: number }[];
      length: number;
    };
function storeFrame(frame: Uint8Array, input: Uint8Array): StoredFrame {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const spans: { out: number; input: number; size: number }[] = [];
  let at = HEADER.length;
  let inputOffset = 0;
  let total = 0;
  while (true) {
    const header = view.getUint32(at, true);
    at += 4;
    if (header === 0) break;
    const size = header & 0x7fffffff;
    if (header & 0x80000000) {
      spans.push({ out: at, input: inputOffset, size });
      total += size;
    }
    inputOffset += Math.min(BLOCK_SIZE, input.length - inputOffset);
    at += size;
  }
  // Avoid packing small frames where allocation costs outweigh savings.
  if (total < 65536) return { full: frame, length: frame.length };
  const compact = new Uint8Array(frame.length - total);
  let from = 0;
  let to = 0;
  for (const span of spans) {
    const length = span.out - from;
    compact.set(frame.subarray(from, span.out), to);
    to += length;
    from = span.out + span.size;
  }
  compact.set(frame.subarray(from), to);
  return { compact, spans, length: frame.length };
}
function restoreFrame(item: StoredFrame, input: Uint8Array): Uint8Array {
  if ("full" in item) return item.full;
  const frame = new Uint8Array(item.length);
  const compact = item.compact;
  let from = 0;
  let to = 0;
  for (const span of item.spans) {
    const n = span.out - to;
    frame.set(compact.subarray(from, from + n), to);
    from += n;
    to += n;
    frame.set(input.subarray(span.input, span.input + span.size), to);
    to += span.size;
  }
  frame.set(compact.subarray(from), to);
  return frame;
}
function requireFrame(frame: Uint8Array | null): Uint8Array {
  if (!frame)
    throw new Error("An unlimited LZ4 frame was unexpectedly rejected");
  return frame;
}

export function compressLz4Search(input: Uint8Array): Uint8Array {
  return requireFrame(compressLz4Frame(input, SEARCH_DEPTH, true));
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

// lz4js may emit a last match fewer than 12 bytes before the block end.
// Check its generated frame before using it as a candidate or size ceiling.
function hasValidBlockEnds(frame: Uint8Array): boolean {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let position = HEADER.length;
  while (true) {
    const block = view.getUint32(position, true);
    position += 4;
    if (block === 0) return true;
    const end = position + (block & 0x7fffffff);
    if (block & 0x80000000) {
      position = end;
      continue;
    }
    let written = 0;
    let lastMatchStart = -1;
    let endedWithLiterals = false;
    const readLength = (initial: number) => {
      let length = initial;
      if (initial === 15) {
        let b: number;
        do {
          b = frame[position++];
          length += b;
        } while (b === 255);
      }
      return length;
    };
    while (position < end) {
      const token = frame[position++];
      const literals = readLength(token >>> 4);
      written += literals;
      position += literals;
      if (position === end) {
        endedWithLiterals = true;
        if (
          lastMatchStart >= 0 &&
          (literals < 5 || written - lastMatchStart < 12)
        )
          return false;
        break;
      }
      position += 2;
      lastMatchStart = written;
      written += readLength(token & 15) + 4;
    }
    if (!endedWithLiterals) return false;
  }
}

/** Favor lower decode work while limiting size growth relative to the compact candidate. */
export function compressLz4Best(input: Uint8Array): Uint8Array {
  const early4Stats = {
    depthLimited: false,
    minimumActive: Number.POSITIVE_INFINITY,
  };
  let fast = lz4.compress(input);
  // The replacement is also the later 64-depth candidate; retain its
  // statistics so the deeper-profile skipping logic can reuse it safely.
  let fallback: Uint8Array | undefined;
  let fallbackContexts: Map<number, MatchContext> | undefined;
  let fallbackProofs:
    | Map<number, { minimum: number; depth: number }>
    | undefined;
  // The search encoder observes the LZ4 last-match and last-literal limits.
  if (!hasValidBlockEnds(fast)) {
    fallbackContexts = new Map();
    fallbackProofs = new Map();
    fallback = requireFrame(
      compressLz4Frame(
        input,
        SEARCH_DEPTH,
        true,
        4,
        1,
        fallbackContexts,
        input.length >= 256 ? early4Stats : undefined,
        // The rejected fast frame still indicates whether matches are sparse.
        fast.length * 10 >= input.length * 9,
        fallbackProofs,
      ),
    );
    fast = fallback;
  }
  const fastWork = decodeWork(fast);
  // Each raw block needs one copy and no sequence dispatch. All candidates
  // use the same block partition, so a compressed block cannot beat this
  // decoder-work lower bound or be chosen by the existing policy.
  if (fastWork.sequences === 0) return fast;
  // Nearly incompressible inputs often never need long-match hash filtering.
  // Defer its large prefix table in that case; eager construction remains
  // faster for the ordinary compressible slide workload.
  const deferContext = fast.length * 10 >= input.length * 9;
  let best = fast;
  // Reuse indices built by the fallback search in the remaining profiles.
  const contexts = fallbackContexts ?? new Map<number, MatchContext>();
  // Keep small empty-block proofs even when the bounded context cache evicts
  // its much larger match indices during multi-block searches.
  const emptyProofs =
    fallbackProofs ?? new Map<number, { minimum: number; depth: number }>();
  // Sequence dispatch is substantially more expensive than a native bulk
  // copy in the measured TypeUdon decoder. Treat this as a heuristic; validate
  // it against the VM when changing either the decoder or these weights.
  const cost = (work: ReturnType<typeof decodeWork>) =>
    16 * work.sequences + 4 * work.copies + work.extensions;
  let bestCost = cost(fastWork);
  const early6Stats = {
    depthLimited: false,
    minimumActive: Number.POSITIVE_INFINITY,
  };
  let early4: Uint8Array | undefined;
  let early6: Uint8Array | undefined;
  for (const [index, makeFrame] of [
    () =>
      compressLz4Frame(
        input,
        16,
        false,
        4,
        1,
        contexts,
        undefined,
        deferContext,
        emptyProofs,
      ),
    () =>
      fallback ??
      compressLz4Frame(
        input,
        SEARCH_DEPTH,
        true,
        4,
        1,
        contexts,
        input.length >= 256 ? early4Stats : undefined,
        deferContext,
        emptyProofs,
      ),
  ].entries()) {
    const searched = requireFrame(makeFrame());
    if (index === 1 && input.length >= 256 && !early4Stats.depthLimited)
      early4 = searched;
    if (searched.length > best.length) continue;
    const candidateCost = cost(decodeWork(searched));
    if (candidateCost < bestCost) {
      best = searched;
      bestCost = candidateCost;
    }
  }
  // Short matches require a separate sequence and often an extra native copy.
  // Allow a small bounded size tradeoff only for a substantial estimated win,
  // and never emit a larger frame than the compliant fast baseline.
  if (input.length >= 256) {
    const speed = requireFrame(
      compressLz4Frame(
        input,
        SEARCH_DEPTH,
        true,
        6,
        1,
        contexts,
        early6Stats,
        deferContext,
        emptyProofs,
      ),
    );
    if (!early6Stats.depthLimited) early6 = speed;
    if (
      speed.length <= fast.length &&
      speed.length * 100 <= best.length * 103 &&
      fitsDecodeSpeedBudget(
        best.length,
        bestCost,
        fast.length,
        speed.length,
        cost(decodeWork(speed)),
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
    let smallerTie: Uint8Array | undefined;
    // Keep up to four distinct size/work pairs for post-processing.
    const portfolio: { stored: StoredFrame; cost: number }[] = [];
    let selectedPortfolio: (typeof portfolio)[number] | undefined;
    let tiePortfolio: (typeof portfolio)[number] | undefined;
    // Exhaustive profiles need no deeper repeats.
    const completeProfiles = new Set<string>();
    // Exhaustive offset-window searches can take minutes on slide-sized
    // images with many similar text fragments. Keep the deep search for
    // small payloads and bound work for larger ones; all candidates remain
    // standard LZ4 and the existing fast-frame size ceiling still applies.
    const profiles: readonly (readonly [number, number, readonly number[]])[] =
      input.length >= 64 * 1024
        ? [
            [64, 1, [8, 12]],
            [64, 4, input.length >= 1024 * 1024 ? [4] : [4, 8]],
          ]
        : [
            [2048, 1, [4, 6, 8, 10, 12]],
            [8192, 1, [4, 6, 8]],
            [512, 4, [4, 6, 8, 10, 12]],
            // Explore the full LZ4 offset window and wider lazy lookahead. Encoder
            // work is deliberately traded for lower decoder work here.
            [65535, 1, [4, 6, 8, 10, 12]],
            [8192, 4, [4, 6, 8, 10, 12]],
            [8192, 8, [4, 6, 8, 10, 12]],
          ];
    for (const [depth, lookahead, matches] of profiles) {
      let previous:
        | { depthLimited: boolean; minimumActive: number }
        | undefined;
      for (const minimumMatch of matches) {
        const profile = `${lookahead}:${minimumMatch}`;
        if (completeProfiles.has(profile)) continue;
        // Raising the threshold below every emitted match preserves output;
        // postponed shorter matches and rejections both advance one byte.
        if (previous && minimumMatch <= previous.minimumActive) {
          if (!previous.depthLimited) completeProfiles.add(profile);
          continue;
        }
        // A 64-depth search that did not exhaust its candidate list is
        // exactly the result of every deeper search for this same profile.
        // Evaluate it in the original candidate order to preserve ties.
        const early =
          depth === 2048 && lookahead === 1
            ? minimumMatch === 4
              ? early4
              : minimumMatch === 6
                ? early6
                : undefined
            : undefined;
        const stats = early
          ? minimumMatch === 4
            ? early4Stats
            : early6Stats
          : { depthLimited: false, minimumActive: Number.POSITIVE_INFINITY };
        previous = stats;
        const candidate =
          early ??
          compressLz4Frame(
            input,
            depth,
            true,
            minimumMatch,
            lookahead,
            contexts,
            stats,
            deferContext,
            emptyProofs,
            sizeLimit,
          );
        if (!stats.depthLimited) completeProfiles.add(profile);
        if (!candidate || candidate.length > sizeLimit) continue;
        const candidateCost = vmCost(decodeWork(candidate));
        let inserted: (typeof portfolio)[number] | undefined;
        if (
          !portfolio.some(
            (v) =>
              v.cost === candidateCost && v.stored.length === candidate.length,
          )
        ) {
          inserted = {
            stored: storeFrame(candidate, input),
            cost: candidateCost,
          };
          portfolio.push(inserted);
          portfolio.sort(
            (a, b) => a.cost - b.cost || a.stored.length - b.stored.length,
          );
          if (portfolio.length > 4 && portfolio.pop() === inserted)
            inserted = undefined;
        }
        if (candidateCost < bestVmCost) {
          best = candidate;
          bestVmCost = candidateCost;
          selectedPortfolio = inserted;
          smallerTie = undefined;
          tiePortfolio = undefined;
        } else if (
          candidateCost === bestVmCost &&
          candidate.length < (smallerTie?.length ?? best.length)
        ) {
          smallerTie = candidate;
          tiePortfolio = inserted;
        }
        // The pre-search best can be reused as an early candidate as well.
        if (inserted && candidate === best) selectedPortfolio = inserted;
        if (inserted && candidate === smallerTie) tiePortfolio = inserted;
      }
      if (depth === 2048 && lookahead === 1) {
        early4 = undefined;
        early6 = undefined;
      }
    }
    // Match indices are no longer used by the literal post-pass. Release
    // references before it allocates its own per-match working state.
    contexts.clear();
    const finish = (frame: Uint8Array) =>
      mergeLz4Literals(
        frame,
        input,
        sizeLimit,
        (candidate) => vmCost(decodeWork(candidate)),
        vmCost,
        {
          linkedBoundary: input.length > BLOCK_SIZE,
          extendMatches: true,
          rawBlocks: true,
        },
      );
    best = finish(best);
    if (smallerTie) {
      // A shorter tied parse can leave different matches for the literal
      // pass. Compare the final results so neither work nor size regresses
      // when the work estimates tie.
      const alternative = finish(smallerTie);
      const originalCost = vmCost(decodeWork(best));
      const alternativeCost = vmCost(decodeWork(alternative));
      if (
        alternativeCost < originalCost ||
        (alternativeCost === originalCost && alternative.length < best.length)
      )
        best = alternative;
    }
    // Only replace the original result when neither size nor work increases.
    let finalCost = vmCost(decodeWork(best));
    for (const item of portfolio) {
      if (item === selectedPortfolio || item === tiePortfolio) continue;
      const post = finish(restoreFrame(item.stored, input));
      const postCost = vmCost(decodeWork(post));
      if (
        post.length <= best.length &&
        // A one-point estimate difference can reverse on the VM when a copy
        // is traded for a length extension. Require a margin at equal size.
        (postCost + 1 < finalCost ||
          (postCost <= finalCost && post.length < best.length))
      ) {
        best = post;
        finalCost = postCost;
      }
    }
  }
  return best;
}
