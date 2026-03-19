import type { EIAFileV1Cropped, EIAManifestV1 } from "@/_types/eia/v1";
import lz4 from "lz4js";
import { rgb24ToImageData, rgba32ToImageData } from "./rawImage2ImageData";
import type { SlideFrame } from "./types";

const base64ToUint8Array = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const rawToImageData = (
  data: Uint8Array,
  width: number,
  height: number,
  format: string,
): ImageData => {
  if (format === "RGBA32") return rgba32ToImageData(data, width, height);
  return rgb24ToImageData(data, width, height);
};

const applyRects = (
  baseBuffer: Uint8Array,
  decompressed: Uint8Array,
  item: EIAFileV1Cropped,
): Uint8Array => {
  const result = new Uint8Array(baseBuffer);
  for (const rect of item.r) {
    const rectData = decompressed.subarray(rect.s, rect.s + rect.l);
    for (let j = 0; j < rect.h; j++) {
      const srcOffset = j * rect.w * 3;
      const dstOffset = ((rect.y + j) * item.w + rect.x) * 3;
      result.set(
        rectData.subarray(srcOffset, srcOffset + rect.w * 3),
        dstOffset,
      );
    }
  }
  return result;
};

export const decodeEIAv1 = (buffer: ArrayBuffer): SlideFrame[] => {
  const uint8 = new Uint8Array(buffer);
  const textDecoder = new TextDecoder();

  // Find '$' (byte 36) that ends the manifest header
  let dollarPos = 4; // skip "EIA^"
  while (dollarPos < uint8.length && uint8[dollarPos] !== 36) dollarPos++;

  const manifest: EIAManifestV1 = JSON.parse(
    textDecoder.decode(uint8.subarray(4, dollarPos)),
  );
  if (manifest.v !== 1)
    throw new Error(`Unsupported EIA version: ${manifest.v}`);
  const dataOffset = dollarPos + 1;

  // Decode the data section once, typed by compression method
  const binarySection =
    manifest.c === "lz4" ? uint8.subarray(dataOffset) : null;
  const textSection =
    manifest.c === "lz4-base64"
      ? textDecoder.decode(uint8.subarray(dataOffset))
      : null;

  // Map from item name → full reconstructed raw pixel buffer
  const frameBuffers = new Map<string, Uint8Array>();

  for (const item of manifest.i) {
    let decompressed: Uint8Array;

    if (binarySection !== null) {
      const compressed = binarySection.subarray(item.s, item.s + item.l);
      decompressed = new Uint8Array(
        lz4.decompress(compressed, item.u) as ArrayLike<number>,
      );
    } else if (textSection !== null) {
      const b64 = textSection.substring(item.s, item.s + item.l);
      const compressed = base64ToUint8Array(b64);
      decompressed = new Uint8Array(
        lz4.decompress(compressed, item.u) as ArrayLike<number>,
      );
    } else {
      throw new Error(`Unsupported compression: ${manifest.c}`);
    }

    let rawBuffer: Uint8Array;
    if (item.t === "m") {
      rawBuffer = decompressed;
    } else {
      const baseBuffer = frameBuffers.get(item.b);
      if (!baseBuffer) throw new Error(`Base frame "${item.b}" not found`);
      rawBuffer = applyRects(baseBuffer, decompressed, item);
    }

    frameBuffers.set(item.n, rawBuffer);
  }

  const frames: SlideFrame[] = manifest.i.flatMap((item) => {
    const raw = frameBuffers.get(item.n);
    if (!raw) return [];
    return [
      {
        index: Number(item.n),
        width: item.w,
        height: item.h,
        imageData: rawToImageData(raw, item.w, item.h, item.f),
      },
    ];
  });

  return frames.sort((a, b) => a.index - b.index);
};
