import type { RawImageObjV1CroppedPart } from "@/_types/text-zip/v1";
import { compressLz4Best } from "./lz4Search";

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

  constructor(private readonly encode = compressLz4Best) {}

  compressImage(input: Uint8Array): Uint8Array {
    const cached = this.images.get(input);
    if (cached) return cached;
    const result = this.encode(input);
    this.images.set(input, result);
    return result;
  }

  compressRects(
    rects: RawImageObjV1CroppedPart[],
    payload: Uint8Array,
  ): Uint8Array {
    const cached = this.rectangles.get(rects);
    if (cached) return cached;
    const result = this.encode(payload);
    this.rectangles.set(rects, result);
    return result;
  }
}
