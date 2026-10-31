/** Standard-LZ4 post-processing: turn selected short matches into literals. */

type Match = {
  start: number;
  length: number;
  offset: number;
  rank: number;
  priority: number;
};
type Block = { start: number; end: number; raw: boolean; matches: Match[] };

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
      matches: [],
    };
    if (block.raw) {
      written += end - position;
      position = end;
    } else {
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
        if (position === end) break;
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
    }
    if (written > expectedLength) return;
    block.end = written;
    blocks.push(block);
  }
  return;
}

function encodeBlocks(
  blocks: Block[],
  input: Uint8Array,
  removeCount: number,
): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.from(HEADER)];
  let total = HEADER.length + 4;
  for (const block of blocks) {
    const original = input.subarray(block.start, block.end);
    if (block.raw) {
      const header = new Uint8Array(4);
      new DataView(header.buffer).setUint32(
        0,
        (original.length | 0x80000000) >>> 0,
        true,
      );
      parts.push(header, original);
      total += 4 + original.length;
      continue;
    }
    const encoded = new Uint8Array(
      original.length + Math.ceil(original.length / 255) + 32,
    );
    let position = 0;
    let anchor = block.start;
    const writeLength = (value: number) => {
      let remaining = value;
      while (remaining >= 255) {
        encoded[position++] = 255;
        remaining -= 255;
      }
      encoded[position++] = remaining;
    };
    for (const match of block.matches) {
      if (match.rank < removeCount) continue;
      const literal = match.start - anchor;
      const matchCode = match.length - 4;
      encoded[position++] =
        (Math.min(literal, 15) << 4) | Math.min(matchCode, 15);
      if (literal >= 15) writeLength(literal - 15);
      encoded.set(input.subarray(anchor, match.start), position);
      position += literal;
      encoded[position++] = match.offset & 255;
      encoded[position++] = match.offset >>> 8;
      if (matchCode >= 15) writeLength(matchCode - 15);
      anchor = match.start + match.length;
    }
    const tail = block.end - anchor;
    encoded[position++] = Math.min(tail, 15) << 4;
    if (tail >= 15) writeLength(tail - 15);
    encoded.set(input.subarray(anchor, block.end), position);
    position += tail;
    const compressed = position < original.length;
    const payload = compressed ? encoded.subarray(0, position) : original;
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(
      0,
      compressed ? position : (original.length | 0x80000000) >>> 0,
      true,
    );
    parts.push(header, payload);
    total += 4 + payload.length;
  }
  const frame = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    frame.set(part, position);
    position += part.length;
  }
  return frame;
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
): Uint8Array {
  const blocks = parseFrame(frame, input.length);
  if (!blocks || frame.length > sizeLimit) return frame;
  const ranked = blocks
    .flatMap((block) => block.matches)
    .filter((match) => match.length <= 64);
  if (!ranked.length) return frame;
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
    const candidate = encodeBlocks(blocks, input, middle);
    if (candidate.length <= sizeLimit) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let best = frame;
  let bestCost = estimateCost(frame);
  for (
    let count = Math.max(1, low - 2);
    count <= Math.min(ranked.length, low + 2);
    count++
  ) {
    const candidate = encodeBlocks(blocks, input, count);
    if (candidate.length > sizeLimit) continue;
    const cost = estimateCost(candidate);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}
