import type { RawImageObjV1CroppedPart } from "@/_types/text-zip/v1";
import { compressLz4Best } from "./lz4Search";
import {
  type Lz4SizeBoundWorkspace,
  lz4FrameSizeLowerBound,
} from "./lz4SizeBound";

const MAX_CONTENT_INPUT = 64 * 1024;
const MAX_CONTENT_BYTES = 1024 * 1024;
const MAX_CONTENT_ENTRIES = 32;

type ContentEntry = {
  fingerprint: number;
  input: Uint8Array;
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

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
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

  private compressContent(input: Uint8Array): Uint8Array {
    if (input.length > MAX_CONTENT_INPUT) return this.encode(input);
    const key = fingerprint(input);
    let comparisons = 0;
    for (const entry of this.recentContent) {
      if (entry.fingerprint !== key || entry.input.length !== input.length)
        continue;
      // Bound the work caused by adversarial sampled-hash collisions. A miss
      // only forfeits reuse; it never changes the compressed data.
      if (comparisons++ >= 4) break;
      if (equalBytes(entry.input, input)) return entry.result;
    }
    const result = this.encode(input);
    const bytes = input.length + result.length;
    if (bytes <= MAX_CONTENT_BYTES) {
      while (
        this.recentContent.length >= MAX_CONTENT_ENTRIES ||
        this.recentContentBytes + bytes > MAX_CONTENT_BYTES
      ) {
        const oldest = this.recentContent.shift();
        if (!oldest) break;
        this.recentContentBytes -= oldest.input.length + oldest.result.length;
      }
      // Copy the view, rather than retaining an arbitrarily large backing buffer.
      const cachedResult =
        result.buffer.byteLength > result.byteLength
          ? Uint8Array.from(result)
          : result;
      this.recentContent.push({
        fingerprint: key,
        input: Uint8Array.from(input),
        result: cachedResult,
      });
      this.recentContentBytes += bytes;
    }
    return result;
  }

  frameSizeLowerBound(input: Uint8Array, stopAt: number): number {
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
