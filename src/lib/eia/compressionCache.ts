import type { RawImageObjV1CroppedPart } from "@/_types/text-zip/v1";
import { compressLz4Best } from "./lz4Search";
import {
  type Lz4SizeBoundWorkspace,
  lz4FrameSizeLowerBound,
} from "./lz4SizeBound";

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

const MAX_STRONG_CONTENT_INPUT = 64 * 1024;
const MAX_CONTENT_BYTES = 1024 * 1024;
const MAX_CONTENT_ENTRIES = 32;

type ContentEntry = {
  fingerprint: number;
  input?: Uint8Array;
  weakInput?: WeakRef<Uint8Array>;
  length: number;
  retainedBytes: number;
  result: Uint8Array;
};

// Only a prefilter: matching fingerprints are always checked byte-for-byte.
function fingerprint(input: Uint8Array): number {
  let hash = input.length;
  const samples = Math.min(64, input.length);
  for (let i = 0; i < samples; i++) {
    hash = Math.imul(
      hash ^ input[Math.floor((i * input.length) / samples)],
      16777619,
    );
  }
  return hash >>> 0;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  // Distinct views can name the very same immutable byte range.
  if (a.buffer === b.buffer && a.byteOffset === b.byteOffset) return true;
  // Frequent near-identical slides differ near either edge. Check those bytes
  // first, then verify the entire middle before accepting a cache hit.
  const head = Math.min(16, a.length);
  const tail = Math.max(head, a.length - 16);
  for (let i = 0; i < head; i++) if (a[i] !== b[i]) return false;
  for (let i = tail; i < a.length; i++) if (a[i] !== b[i]) return false;
  let i = head;
  if (a.length >= 1024) {
    if (((a.byteOffset ^ b.byteOffset) & 3) === 0) {
      while ((a.byteOffset + i) & 3) {
        if (a[i] !== b[i]) return false;
        i++;
      }
      const n = Math.floor((tail - i) / 4);
      const aWords = new Uint32Array(a.buffer, a.byteOffset + i, n);
      const bWords = new Uint32Array(b.buffer, b.byteOffset + i, n);
      for (let j = 0; j < n; j++) if (aWords[j] !== bWords[j]) return false;
      i += n * 4;
    } else {
      while ((a.byteOffset + i) & 3) {
        if (a[i] !== b[i]) return false;
        i++;
      }
      const n = Math.floor((tail - i) / 4);
      const aWords = new Uint32Array(a.buffer, a.byteOffset + i, n);
      const bWords = new DataView(b.buffer, b.byteOffset + i, n * 4);
      for (let j = 0; j < n; j++) {
        if (aWords[j] !== bWords.getUint32(j * 4, LITTLE_ENDIAN)) return false;
      }
      i += n * 4;
    }
  }
  for (; i < tail; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Per-conversion cache. Inputs and rectangle arrays must stay immutable until
 * the conversion finishes; do not reuse a cache across conversions.
 */
export class EiaCompressionCache {
  private readonly images = new WeakMap<Uint8Array, Uint8Array>();
  private readonly rectangles = new WeakMap<
    RawImageObjV1CroppedPart[],
    Uint8Array
  >();
  private readonly sizeBoundWorkspace: Lz4SizeBoundWorkspace = {};
  private readonly recentContent: ContentEntry[] = [];
  private recentContentBytes = 0;

  constructor(private readonly encode = compressLz4Best) {}

  private findContent(input: Uint8Array, key: number): Uint8Array | undefined {
    let comparisons = 0;
    for (const entry of this.recentContent) {
      if (entry.fingerprint !== key || entry.length !== input.length) continue;
      const previous = entry.input ?? entry.weakInput?.deref();
      if (!previous) continue;
      // Bound the work caused by adversarial sampled-hash collisions. A miss
      // only forfeits reuse; it never changes the compressed data.
      if (comparisons++ >= 4) break;
      if (equalBytes(previous, input)) return entry.result;
    }
  }

  private compressContent(input: Uint8Array): Uint8Array {
    const weak = input.length > MAX_STRONG_CONTENT_INPUT;
    // WeakRef is optional in older browsers; absence merely disables reuse.
    if (weak && typeof WeakRef === "undefined") return this.encode(input);
    const key = fingerprint(input);
    const cached = this.findContent(input, key);
    if (cached) return cached;
    const result = this.encode(input);
    const bytes = (weak ? 0 : input.length) + result.length;
    if (bytes <= MAX_CONTENT_BYTES) {
      while (
        this.recentContent.length >= MAX_CONTENT_ENTRIES ||
        this.recentContentBytes + bytes > MAX_CONTENT_BYTES
      ) {
        const oldest = this.recentContent.shift();
        if (!oldest) break;
        this.recentContentBytes -= oldest.retainedBytes;
      }
      // Copy the view, rather than retaining an arbitrarily large backing buffer.
      const cachedResult =
        result.buffer.byteLength > result.byteLength
          ? Uint8Array.from(result)
          : result;
      this.recentContent.push({
        fingerprint: key,
        input: weak ? undefined : Uint8Array.from(input),
        weakInput: weak ? new WeakRef(input) : undefined,
        length: input.length,
        retainedBytes: bytes,
        result: cachedResult,
      });
      this.recentContentBytes += bytes;
    }
    return result;
  }

  frameSizeLowerBound(input: Uint8Array, stopAt: number): number {
    // The crop comparison only needs a bound for this encoder's actual
    // output. A cached frame gives its exact size without rescanning input.
    const compressed = this.images.get(input);
    if (compressed) return compressed.length;
    // For small targets the bound can often stop after scanning a small
    // prefix, so a full-content comparison would cost more than it saves.
    if (this.recentContent.length > 0 && stopAt * 128 >= input.length) {
      const matching = this.findContent(input, fingerprint(input));
      if (matching) {
        this.images.set(input, matching);
        return matching.length;
      }
    }
    return lz4FrameSizeLowerBound(input, stopAt, this.sizeBoundWorkspace);
  }

  compressImage(input: Uint8Array): Uint8Array {
    const cached = this.images.get(input);
    if (cached) return cached;
    const result = this.compressContent(input);
    this.images.set(input, result);
    return result;
  }

  compressRects(
    rects: RawImageObjV1CroppedPart[],
    payload: Uint8Array | (() => Uint8Array),
  ): Uint8Array {
    const cached = this.rectangles.get(rects);
    if (cached) return cached;
    const result = this.compressContent(
      typeof payload === "function" ? payload() : payload,
    );
    this.rectangles.set(rects, result);
    return result;
  }
}
