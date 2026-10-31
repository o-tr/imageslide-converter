export type Lz4SizeBoundWorkspace = { seen?: Uint32Array };

/**
 * A conservative lower bound for a standard LZ4 frame with no external
 * dictionary. With a finite stopAt, the scan can stop once it reaches the
 * target or proves that the complete scan cannot reach it.
 */
export function lz4FrameSizeLowerBound(
  input: Uint8Array,
  stopAt = Number.POSITIVE_INFINITY,
  workspace?: Lz4SizeBoundWorkspace,
): number {
  const size = input.length;
  const finiteTarget = Number.isFinite(stopAt);
  const expansionBound = Math.ceil(size / 255);
  if (expansionBound >= stopAt || size < 4) return expansionBound;

  // If a four-byte sequence has no earlier occurrence inside the LZ4 window,
  // it cannot lie inside a match except in its last three bytes. Literal bytes
  // cost one byte each, while a match costs at least its token and two-byte
  // offset; those three bytes cover the at most three remaining positions.
  // Counting only absent hashes is conservative: collisions can make this
  // bound smaller, but cannot make it exceed the number of unique sequences.
  const bits = Math.max(8, Math.min(18, Math.ceil(Math.log2(size))));
  const slots = 1 << bits;
  let seen = workspace?.seen;
  if (!seen || seen.length < slots) {
    seen = new Uint32Array(slots);
    if (workspace) workspace.seen = seen;
  } else {
    // A previous call may have stopped early; clear every slot that this
    // input can address before reusing the table.
    seen.fill(0, 0, slots);
  }
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const shift = 32 - bits;
  let unique = 0;
  // With L literal bytes, M matches and E other encoded bytes, U <= L + 3M,
  // frame size S >= L + 3M + E, and decoded size N <= L + 19M + 255E.
  // Eliminating L, M and E gives S >= U + ceil((3N - 19U) / 765).
  const boundFor = (count: number) =>
    Math.max(
      expansionBound,
      count + Math.ceil(Math.max(0, 3 * size - 19 * count) / 765),
    );
  for (let i = 0; i + 4 <= size; i++) {
    const hash = Math.imul(view.getUint32(i, true), 2654435761) >>> shift;
    const previous = seen[hash];
    if (previous === 0 || i + 1 - previous > 65535) {
      unique++;
      // The combined bound grows monotonically with unique. Check it only
      // periodically to keep the per-byte scan cheap.
      if ((unique & 255) === 0 && boundFor(unique) >= stopAt)
        return boundFor(unique);
    }
    seen[hash] = i + 1;
    if (
      (i & 4095) === 0 &&
      finiteTarget &&
      boundFor(unique + size - 4 - i) < stopAt
    )
      return boundFor(unique);
  }
  return boundFor(unique);
}
