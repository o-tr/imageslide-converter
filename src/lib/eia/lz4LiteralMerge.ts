/** Standard-LZ4 post-processing: turn selected short matches into literals. */

type Match = {
  start: number;
  length: number;
  offset: number;
  rank: number;
  priority: number;
};
type Block = {
  start: number;
  end: number;
  raw: boolean;
  payloadLength: number;
  matches: Match[];
};
export type Lz4DecodeWork = {
  sequences: number;
  copies: number;
  extensions: number;
};

const HEADER = [4, 34, 77, 24, 64, 112, 223];

function parseFrame(
  frame: Uint8Array,
  expectedLength: number,
): Block[] | undefined {
  if (frame.length < 11 || HEADER.some((byte, i) => frame[i] !== byte)) return;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let position = HEADER.length;
  let written = 0;
  const blocks: Block[] = [];
  while (position + 4 <= frame.length) {
    const header = view.getUint32(position, true);
    position += 4;
    if (header === 0)
      return position === frame.length && written === expectedLength
        ? blocks
        : undefined;
    const end = position + (header & 0x7fffffff);
    if (end > frame.length) return;
    const block: Block = {
      start: written,
      end: 0,
      raw: !!(header & 0x80000000),
      payloadLength: end - position,
      matches: [],
    };
    if (block.raw) {
      written += end - position;
      position = end;
    } else {
      let hasLiteralTail = false;
      const readLength = (initial: number): number | undefined => {
        let length = initial;
        if (initial === 15) {
          let extra: number;
          do {
            if (position >= end) return;
            extra = frame[position++];
            length += extra;
          } while (extra === 255);
        }
        return length;
      };
      while (position < end) {
        const token = frame[position++];
        const literal = readLength(token >>> 4);
        if (literal === undefined || position + literal > end) return;
        position += literal;
        written += literal;
        if (position === end) {
          hasLiteralTail = true;
          break;
        }
        if (position + 2 > end) return;
        const offset = view.getUint16(position, true);
        position += 2;
        const matchLength = readLength(token & 15);
        if (matchLength === undefined || offset === 0 || offset > written)
          return;
        const length = matchLength + 4;
        block.matches.push({
          start: written,
          length,
          offset,
          rank: Number.POSITIVE_INFINITY,
          priority: 0,
        });
        written += length;
      }
      if (!hasLiteralTail) return;
    }
    if (written > expectedLength) return;
    block.end = written;
    blocks.push(block);
  }
  return;
}

const lengthBytes = (length: number) =>
  length < 15 ? 0 : Math.floor((length - 15) / 255) + 1;

function encodedBlockLength(block: Block, removeCount: number): number {
  let length = 0;
  let anchor = block.start;
  for (const match of block.matches) {
    if (match.rank < removeCount) continue;
    const literal = match.start - anchor;
    length +=
      1 + lengthBytes(literal) + literal + 2 + lengthBytes(match.length - 4);
    anchor = match.start + match.length;
  }
  const tail = block.end - anchor;
  return length + 1 + lengthBytes(tail) + tail;
}

function currentPayloadLengths(blocks: Block[]): Uint32Array {
  const lengths = new Uint32Array(blocks.length);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    lengths[i] = Math.min(block.payloadLength, block.end - block.start);
  }
  return lengths;
}

function encodeBlocks(
  blocks: Block[],
  input: Uint8Array,
  removeCount: number,
  measuredLengths?: Uint32Array,
): Uint8Array {
  const lengths = measuredLengths ?? new Uint32Array(blocks.length);
  let total = HEADER.length + 4;
  for (let i = 0; i < blocks.length; i++) {
    if (!measuredLengths) {
      const block = blocks[i];
      const rawLength = block.end - block.start;
      const compressedLength = block.raw
        ? rawLength
        : encodedBlockLength(block, removeCount);
      lengths[i] = compressedLength < rawLength ? compressedLength : rawLength;
    }
    total += 4 + lengths[i];
  }

  // Write directly into the final frame; no full-size intermediate buffer or
  // second payload copy is needed for each compressed block.
  const frame = new Uint8Array(total);
  frame.set(HEADER);
  const view = new DataView(frame.buffer);
  let position = HEADER.length;
  const writeLength = (value: number) => {
    let remaining = value;
    while (remaining >= 255) {
      frame[position++] = 255;
      remaining -= 255;
    }
    frame[position++] = remaining;
  };
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const rawLength = block.end - block.start;
    const compressed = !block.raw && lengths[i] < rawLength;
    view.setUint32(
      position,
      compressed ? lengths[i] : (rawLength | 0x80000000) >>> 0,
      true,
    );
    position += 4;
    if (!compressed) {
      frame.set(input.subarray(block.start, block.end), position);
      position += rawLength;
      continue;
    }
    let anchor = block.start;
    for (const match of block.matches) {
      if (match.rank < removeCount) continue;
      const literal = match.start - anchor;
      const matchCode = match.length - 4;
      frame[position++] =
        (Math.min(literal, 15) << 4) | Math.min(matchCode, 15);
      if (literal >= 15) writeLength(literal - 15);
      frame.set(input.subarray(anchor, match.start), position);
      position += literal;
      frame[position++] = match.offset & 255;
      frame[position++] = match.offset >>> 8;
      if (matchCode >= 15) writeLength(matchCode - 15);
      anchor = match.start + match.length;
    }
    const tail = block.end - anchor;
    frame[position++] = Math.min(tail, 15) << 4;
    if (tail >= 15) writeLength(tail - 15);
    frame.set(input.subarray(anchor, block.end), position);
    position += tail;
  }
  return frame;
}

// Binary-search probes only need the encoded size, not the frame bytes. Avoid
// allocating and copying all literals for each probe; final candidates still
// go through encodeBlocks and the caller's normal decoder-cost function.
function measureBlocks(
  blocks: Block[],
  removeCount: number,
  lengths?: Uint32Array,
): number {
  let total = HEADER.length + 4;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const rawLength = block.end - block.start;
    const length = block.raw
      ? rawLength
      : Math.min(encodedBlockLength(block, removeCount), rawLength);
    if (lengths) lengths[i] = length;
    total += 4 + length;
  }
  return total;
}

// The production decoder-cost model counts these operations from an encoded
// frame. Count the same operations directly while considering a candidate so
// only the chosen frame needs to be materialized.
function measureWork(blocks: Block[], removeCount: number): Lz4DecodeWork {
  const result = { sequences: 0, copies: 0, extensions: 0 };
  const lengthBytes = (length: number) =>
    length < 15 ? 0 : Math.floor((length - 15) / 255) + 1;
  for (const block of blocks) {
    if (block.raw) {
      result.copies++;
      continue;
    }
    let length = 0;
    let anchor = block.start;
    let sequences = 0;
    let copies = 0;
    let extensions = 0;
    for (const match of block.matches) {
      if (match.rank < removeCount) continue;
      const literal = match.start - anchor;
      const extra = lengthBytes(literal) + lengthBytes(match.length - 4);
      length += 1 + extra + literal + 2;
      extensions += extra;
      sequences++;
      if (literal) copies++;
      let copied = Math.min(match.offset, match.length);
      copies++;
      while (copied < match.length) {
        copied += Math.min(copied, match.length - copied);
        copies++;
      }
      anchor = match.start + match.length;
    }
    const tail = block.end - anchor;
    const extra = lengthBytes(tail);
    length += 1 + extra + tail;
    if (length >= block.end - block.start) {
      result.copies++;
    } else {
      result.sequences += sequences + 1;
      result.copies += copies + (tail ? 1 : 0);
      result.extensions += extensions + extra;
    }
  }
  return result;
}

/**
 * Spend spare bytes, up to sizeLimit, to remove high-cost short match sequences.
 * Only the internally emitted checksum-free lz4js frame header is accepted.
 */
export function mergeLz4Literals(
  frame: Uint8Array,
  input: Uint8Array,
  sizeLimit: number,
  estimateCost: (candidate: Uint8Array) => number,
  estimateWork?: (work: Lz4DecodeWork) => number,
  followUp?: {
    linkedBoundary: boolean;
    extendMatches?: boolean;
    rawBlocks?: boolean;
  },
): Uint8Array {
  const blocks = parseFrame(frame, input.length);
  if (!blocks) return frame;
  if (frame.length > sizeLimit)
    return followUp
      ? mergeZeroFromBlocks(
          blocks,
          frame,
          input,
          estimateCost,
          followUp.linkedBoundary,
          followUp.extendMatches ?? false,
        )
      : frame;
  if (followUp?.rawBlocks && estimateWork) {
    const alternative = chooseRawBlocks(
      blocks,
      frame,
      input,
      sizeLimit,
      estimateWork,
    );
    if (alternative) {
      // Spending the same budget on literals can beat making a whole block
      // raw. Run both paths and keep the lower-cost result within the limit.
      const options = { ...followUp, rawBlocks: false };
      const original = mergeLz4Literals(
        frame,
        input,
        sizeLimit,
        estimateCost,
        estimateWork,
        options,
      );
      const raw = mergeLz4Literals(
        alternative,
        input,
        sizeLimit,
        estimateCost,
        estimateWork,
        options,
      );
      const originalCost = estimateCost(original);
      const rawCost = estimateCost(raw);
      return raw.length <= sizeLimit &&
        (rawCost < originalCost ||
          (rawCost === originalCost && raw.length < original.length))
        ? raw
        : original;
    }
  }
  const ranked = blocks
    .flatMap((block) => block.matches)
    .filter((match) => match.length <= 64);
  if (!ranked.length)
    return followUp
      ? mergeZeroFromBlocks(
          blocks,
          frame,
          input,
          estimateCost,
          followUp.linkedBoundary,
          followUp.extendMatches ?? false,
        )
      : frame;
  for (const match of ranked) {
    let copied = Math.min(match.offset, match.length);
    let copies = 1;
    while (copied < match.length) {
      copied += Math.min(copied, match.length - copied);
      copies++;
    }
    match.priority = (30 + 2 * copies) / Math.max(1, match.length - 3);
  }
  ranked.sort((a, b) => b.priority - a.priority);
  for (const [rank, match] of ranked.entries()) match.rank = rank;

  // Removing another match normally increases size. Check the actual encoded
  // candidates around the boundary as extension-byte transitions can vary.
  let low = 0;
  let high = ranked.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measureBlocks(blocks, middle) <= sizeLimit) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let best = frame;
  let bestCost = estimateCost(frame);
  let bestCount = 0;
  let bestLengths: Uint32Array | undefined;
  for (
    let count = Math.max(1, low - 2);
    count <= Math.min(ranked.length, low + 2);
    count++
  ) {
    const lengths = new Uint32Array(blocks.length);
    if (measureBlocks(blocks, count, lengths) > sizeLimit) continue;
    const candidate = estimateWork
      ? undefined
      : encodeBlocks(blocks, input, count, lengths);
    const cost = estimateWork
      ? estimateWork(measureWork(blocks, count))
      : estimateCost(candidate ?? encodeBlocks(blocks, input, count, lengths));
    if (cost < bestCost) {
      if (candidate) best = candidate;
      bestCount = count;
      bestLengths = lengths;
      bestCost = cost;
    }
  }
  const selected =
    estimateWork && bestCount
      ? encodeBlocks(blocks, input, bestCount, bestLengths)
      : best;
  if (!followUp) return selected;
  // Reuse the parsed matches for the follow-up pass. An encoded candidate can
  // switch an incompressible block to raw, so inspect the selected headers and
  // discard matches from such blocks before applying any further rewrites.
  if (!prepareSelectedBlocks(blocks, selected, bestCount))
    return optimizeLz4Matches(
      selected,
      input,
      estimateCost,
      followUp.linkedBoundary,
      followUp.extendMatches ?? false,
    );
  return mergeZeroFromBlocks(
    blocks,
    selected,
    input,
    estimateCost,
    followUp.linkedBoundary,
    followUp.extendMatches ?? false,
  );
}

function chooseRawBlocks(
  blocks: Block[],
  frame: Uint8Array,
  input: Uint8Array,
  sizeLimit: number,
  estimateWork: (work: Lz4DecodeWork) => number,
): Uint8Array | undefined {
  let remaining = sizeLimit - frame.length;
  // Avoid scanning match work or allocating another frame when no whole
  // block fits in the remaining budget.
  if (
    !blocks.some(
      (b) => !b.raw && b.end - b.start - b.payloadLength <= remaining,
    )
  )
    return;
  let cost = estimateWork(measureWork(blocks, 0));
  let selected = false;
  for (;;) {
    let best: Block | undefined;
    let bestCost = cost;
    let bestRatio = 0;
    for (const block of blocks) {
      if (block.raw) continue;
      const extra = block.end - block.start - block.payloadLength;
      if (extra < 0 || extra > remaining) continue;
      block.raw = true;
      const candidateCost = estimateWork(measureWork(blocks, 0));
      block.raw = false;
      const ratio = (cost - candidateCost) / Math.max(1, extra);
      if (candidateCost < cost && ratio > bestRatio) {
        best = block;
        bestCost = candidateCost;
        bestRatio = ratio;
      }
    }
    if (!best) break;
    remaining -= best.end - best.start - best.payloadLength;
    best.raw = true;
    best.payloadLength = best.end - best.start;
    cost = bestCost;
    selected = true;
  }
  return selected
    ? encodeBlocks(blocks, input, 0, currentPayloadLengths(blocks))
    : undefined;
}

function prepareSelectedBlocks(
  blocks: Block[],
  frame: Uint8Array,
  removeCount: number,
): boolean {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let position = HEADER.length;
  for (const block of blocks) {
    if (position + 4 > frame.length) return false;
    const header = view.getUint32(position, true);
    if (header === 0) return false;
    position += 4 + (header & 0x7fffffff);
    if (position > frame.length) return false;
    block.raw = !!(header & 0x80000000);
    block.payloadLength = header & 0x7fffffff;
    const matches = block.matches;
    let kept = 0;
    if (!block.raw) {
      for (const match of matches) {
        if (match.rank < removeCount) continue;
        match.rank = Number.POSITIVE_INFINITY;
        matches[kept++] = match;
      }
    }
    matches.length = kept;
  }
  return position + 4 === frame.length && view.getUint32(position, true) === 0;
}

function mergeZeroFromBlocks(
  blocks: Block[],
  frame: Uint8Array,
  input: Uint8Array,
  estimateCost: (candidate: Uint8Array) => number,
  includeLinkedBoundary: boolean,
  extendMatches: boolean,
): Uint8Array {
  const lengthBytes = (length: number) =>
    length < 15 ? 0 : Math.floor((length - 15) / 255) + 1;
  let removed = 0;

  for (const block of blocks) {
    const matches = block.matches;
    if (block.raw || !matches.some((match) => match.length === 4)) continue;
    const previous = new Int32Array(matches.length);
    const next = new Int32Array(matches.length);
    for (let i = 0; i < matches.length; i++) {
      previous[i] = i - 1;
      next[i] = i + 1;
    }
    let i = 0;
    while (i < matches.length) {
      const match = matches[i];
      const before = previous[i];
      const after = next[i];
      // Combining two literal lengths can save at most one extension byte.
      // A match longer than four bytes therefore always increases the frame
      // when converted to literals, even after its own extension is removed.
      if (match.length !== 4) {
        i = after;
        continue;
      }
      const left =
        match.start -
        (before >= 0
          ? matches[before].start + matches[before].length
          : block.start);
      const right =
        (after < matches.length ? matches[after].start : block.end) -
        (match.start + match.length);
      const merged = left + match.length + right;
      const oldExtra = lengthBytes(left) + lengthBytes(right);
      const newExtra = lengthBytes(merged);
      const sizeDelta = 1 - oldExtra + newExtra;
      if (sizeDelta === 0) {
        match.rank = 0;
        removed++;
        if (before >= 0) next[before] = after;
        if (after < matches.length) previous[after] = before;
        // A removal can make its preceding match free as well.
        i = before >= 0 ? before : after;
      } else {
        i = after;
      }
    }
  }
  const extended =
    extendMatches &&
    extendMatchesBackward(blocks, input, includeLinkedBoundary);
  const linked =
    includeLinkedBoundary && shiftLinkedBoundaries(blocks, input, 1);
  if (!removed && !extended && !linked) return frame;
  const candidate = encodeBlocks(
    blocks,
    input,
    1,
    currentPayloadLengths(blocks),
  );
  if (candidate.length > frame.length) return frame;
  const candidateCost = estimateCost(candidate);
  const originalCost = estimateCost(frame);
  return candidateCost < originalCost ||
    (candidateCost === originalCost && candidate.length < frame.length)
    ? candidate
    : frame;
}

function optimizeLz4Matches(
  frame: Uint8Array,
  input: Uint8Array,
  estimateCost: (candidate: Uint8Array) => number,
  includeLinkedBoundary = false,
  extendMatches = false,
): Uint8Array {
  const blocks = parseFrame(frame, input.length);
  return blocks
    ? mergeZeroFromBlocks(
        blocks,
        frame,
        input,
        estimateCost,
        includeLinkedBoundary,
        extendMatches,
      )
    : frame;
}

/** Remove additional short matches when merging them costs no encoded bytes. */
export function mergeZeroCostMatches(
  frame: Uint8Array,
  input: Uint8Array,
  estimateCost: (candidate: Uint8Array) => number,
  includeLinkedBoundary = false,
): Uint8Array {
  return optimizeLz4Matches(frame, input, estimateCost, includeLinkedBoundary);
}

// Extend a match backwards into its preceding literals when the bytes agree.
// The match end stays fixed, so every later offset and match remains valid.
function extendMatchesBackward(
  blocks: Block[],
  input: Uint8Array,
  allowCrossBlock: boolean,
): boolean {
  const lengthBytes = (length: number) =>
    length < 15 ? 0 : Math.floor((length - 15) / 255) + 1;
  let changed = false;
  for (const block of blocks) {
    if (block.raw) continue;
    let anchor = block.start;
    const sourceLimit = allowCrossBlock ? 0 : block.start;
    for (const match of block.matches) {
      if (match.rank < 1) continue;
      const literals = match.start - anchor;
      const lastLiteral = match.start - 1;
      const previousByte = lastLiteral - match.offset;
      if (
        literals === 0 ||
        previousByte < sourceLimit ||
        input[lastLiteral] !== input[previousByte]
      ) {
        anchor = match.start + match.length;
        continue;
      }
      const originalLength = match.length;
      const originalExtra =
        lengthBytes(literals) + lengthBytes(originalLength - 4);
      let capacity = match.offset;
      let copies = 1;
      while (capacity < originalLength) {
        capacity *= 2;
        copies++;
      }
      const originalCopies = copies;
      let bestLength = 0;
      let bestCostDelta = 0;
      let bestSizeDelta = 0;
      for (let length = 1; length <= literals; length++) {
        const target = match.start - length;
        const source = target - match.offset;
        if (source < sourceLimit || input[target] !== input[source]) break;
        const matchLength = originalLength + length;
        if (matchLength > capacity) {
          capacity *= 2;
          copies++;
        }
        const extraDelta =
          lengthBytes(literals - length) +
          lengthBytes(matchLength - 4) -
          originalExtra;
        const copyDelta =
          copies -
          originalCopies +
          (literals - length > 0 ? 1 : 0) -
          (literals > 0 ? 1 : 0);
        const costDelta = 2 * copyDelta + extraDelta;
        const sizeDelta = -length + extraDelta;
        if (
          sizeDelta <= 0 &&
          extraDelta <= 0 &&
          copyDelta <= 0 &&
          (costDelta < bestCostDelta ||
            (costDelta === bestCostDelta && sizeDelta < bestSizeDelta))
        ) {
          bestLength = length;
          bestCostDelta = costDelta;
          bestSizeDelta = sizeDelta;
        }
      }
      if (bestLength) {
        match.start -= bestLength;
        match.length += bestLength;
        block.payloadLength += bestSizeDelta;
        changed = true;
      }
      anchor = match.start + match.length;
    }
  }
  return changed;
}

function shiftLinkedBoundaries(
  blocks: Block[],
  input: Uint8Array,
  removeCount: number,
): boolean {
  let changed = false;
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const match = block.matches.find((item) => item.rank >= removeCount);
    if (
      !block.raw &&
      match &&
      block.start > 0 &&
      match.start === block.start + 1 &&
      match.offset === 1 &&
      // Crossing a match-length extension boundary can add VM work even
      // though removing the literal saves a native copy.
      lengthBytes(match.length - 3) === lengthBytes(match.length - 4) &&
      input[block.start - 1] === input[block.start]
    ) {
      block.payloadLength +=
        -1 + lengthBytes(match.length - 3) - lengthBytes(match.length - 4);
      match.start--;
      match.length++;
      changed = true;
    }
  }
  return changed;
}

/** Reuse the previous block's last byte for an equivalent offset-one match. */
export function mergeLinkedBoundaryMatches(
  frame: Uint8Array,
  input: Uint8Array,
  estimateCost: (candidate: Uint8Array) => number,
): Uint8Array {
  const blocks = parseFrame(frame, input.length);
  if (!blocks || !shiftLinkedBoundaries(blocks, input, 0)) return frame;
  const candidate = encodeBlocks(
    blocks,
    input,
    0,
    currentPayloadLengths(blocks),
  );
  return candidate.length <= frame.length &&
    estimateCost(candidate) < estimateCost(frame)
    ? candidate
    : frame;
}
