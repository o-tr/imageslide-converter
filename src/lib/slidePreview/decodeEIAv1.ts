import type { EIAFileV1Cropped, EIAManifestV1 } from "@/_types/eia/v1";
import type { SlideFrame } from "@/_types/slide-preview";
import lz4 from "lz4js";
import { rgb24ToImageData, rgba32ToImageData } from "./rawImage2ImageData";

const base64ToUint8Array = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const isRgb24 = (format: string): boolean => format.startsWith("RGB24");

const lz4Decompress = (
  compressed: Uint8Array,
  uncompressedSize: number,
  frameName: string,
): Uint8Array => {
  const raw = lz4.decompress(compressed, uncompressedSize);
  if (!raw || !(raw as ArrayLike<number>).length)
    throw new Error(`lz4 decompression failed for frame "${frameName}"`);
  return new Uint8Array(raw as ArrayLike<number>);
};

const rawToImageData = (
  data: Uint8Array,
  width: number,
  height: number,
  format: string,
): ImageData => {
  if (format === "RGBA32") return rgba32ToImageData(data, width, height);
  if (isRgb24(format)) return rgb24ToImageData(data, width, height);
  throw new Error(`Unsupported image format: "${format}"`);
};

const applyRects = (
  baseBuffer: Uint8Array,
  decompressed: Uint8Array,
  item: EIAFileV1Cropped,
  baseWidth: number,
): Uint8Array => {
  const bpp =
    item.f === "RGBA32"
      ? 4
      : isRgb24(item.f)
        ? 3
        : (() => {
            throw new Error(`Unsupported format in applyRects: "${item.f}"`);
          })();
  const result = new Uint8Array(baseBuffer);
  for (const rect of item.r) {
    const rectData = decompressed.subarray(rect.s, rect.s + rect.l);
    const expectedBytes = rect.h * rect.w * bpp;
    if (rectData.length < expectedBytes)
      throw new Error(
        `Rect data too small: got ${rectData.length}, expected ${expectedBytes} for rect at (${rect.x},${rect.y})`,
      );
    for (let j = 0; j < rect.h; j++) {
      const srcOffset = j * rect.w * bpp;
      const dstOffset = ((rect.y + j) * baseWidth + rect.x) * bpp;
      result.set(
        rectData.subarray(srcOffset, srcOffset + rect.w * bpp),
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
  if (dollarPos >= uint8.length) {
    throw new Error("EIA file is malformed: manifest delimiter '$' not found");
  }

  const manifest: EIAManifestV1 = JSON.parse(
    textDecoder.decode(uint8.subarray(4, dollarPos)),
  );
  if (manifest.v !== 1)
    throw new Error(`Unsupported EIA version: ${manifest.v}`);
  if (manifest.c !== "lz4" && manifest.c !== "lz4-base64")
    throw new Error(`Unsupported compression: ${manifest.c}`);
  const dataOffset = dollarPos + 1;

  // Decode the data section once, typed by compression method
  const binarySection =
    manifest.c === "lz4" ? uint8.subarray(dataOffset) : null;
  const textSection =
    manifest.c === "lz4-base64"
      ? textDecoder.decode(uint8.subarray(dataOffset))
      : null;

  const frameBuffers = new Map<string, Uint8Array>();
  const frames: SlideFrame[] = [];

  for (const item of manifest.i) {
    let decompressed: Uint8Array;

    if (binarySection !== null) {
      const compressed = binarySection.subarray(item.s, item.s + item.l);
      decompressed = lz4Decompress(compressed, item.u, item.n);
    } else if (textSection !== null) {
      const b64 = textSection.substring(item.s, item.s + item.l);
      const compressed = base64ToUint8Array(b64);
      decompressed = lz4Decompress(compressed, item.u, item.n);
    } else {
      throw new Error(`Unsupported compression: ${manifest.c}`);
    }

    let rawBuffer: Uint8Array;
    if (item.t === "m") {
      rawBuffer = decompressed;
    } else {
      const baseBuffer = frameBuffers.get(item.b);
      if (!baseBuffer) throw new Error(`Base frame "${item.b}" not found`);
      const baseItem = manifest.i.find((f) => f.n === item.b);
      if (!baseItem)
        throw new Error(`Base frame "${item.b}" not found in manifest`);
      if (baseItem.w !== item.w || baseItem.h !== item.h)
        throw new Error(
          `Cropped frame "${item.n}" dimensions (${item.w}×${item.h}) ` +
            `differ from base "${item.b}" (${baseItem.w}×${baseItem.h})`,
        );
      if (baseItem.f !== item.f)
        throw new Error(
          `Cropped frame "${item.n}" format "${item.f}" ` +
            `differs from base "${item.b}" format "${baseItem.f}"`,
        );
      rawBuffer = applyRects(baseBuffer, decompressed, item, baseItem.w);
    }

    frameBuffers.set(item.n, rawBuffer);

    const index = Number(item.n);
    if (!Number.isFinite(index))
      throw new Error(`Non-numeric frame name: "${item.n}"`);

    frames.push({
      index,
      width: item.w,
      height: item.h,
      imageData: rawToImageData(rawBuffer, item.w, item.h, item.f),
    });
  }

  return frames.sort((a, b) => a.index - b.index);
};
