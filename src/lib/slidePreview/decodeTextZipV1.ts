import type { SlideFrame } from "@/_types/slide-preview";
import type {
  ManifestV1,
  ManifestV1ExtensionCropped,
  ManifestV1Item,
} from "@/_types/text-zip/v1";
import type JSZip from "jszip";
import { rgb24ToImageData, rgba32ToImageData } from "./rawImage2ImageData";

const isRgb24 = (format: string): boolean => format.startsWith("RGB24");

const rawToImageData = (data: Uint8Array, item: ManifestV1Item): ImageData => {
  const { width, height } = item.rect;
  if (item.format === "RGBA32") return rgba32ToImageData(data, width, height);
  if (isRgb24(item.format)) return rgb24ToImageData(data, width, height);
  throw new Error(`Unsupported image format: "${item.format}"`);
};

const loadFile = async (zip: JSZip, path: string): Promise<Uint8Array> => {
  const entry = zip.file(path);
  if (!entry) throw new Error(`File "${path}" not found in zip`);
  return entry.async("uint8array");
};

const applyRects = async (
  baseBuffer: Uint8Array,
  rects: ManifestV1ExtensionCropped["rects"],
  zip: JSZip,
  width: number,
  format: string,
): Promise<Uint8Array> => {
  const bpp =
    format === "RGBA32"
      ? 4
      : isRgb24(format)
        ? 3
        : (() => {
            throw new Error(`Unsupported format in applyRects: "${format}"`);
          })();
  const result = new Uint8Array(baseBuffer);
  const baseHeight = baseBuffer.length / (width * bpp);
  for (const rect of rects) {
    if (rect.x + rect.width > width || rect.y + rect.height > baseHeight)
      throw new Error(
        `Rect at (${rect.x},${rect.y}) size ${rect.width}×${rect.height} exceeds frame bounds ${width}×${baseHeight}`,
      );
    const rectData = await loadFile(zip, rect.path);
    const expectedBytes = rect.height * rect.width * bpp;
    if (rectData.length < expectedBytes)
      throw new Error(
        `Rect file "${rect.path}" too small: got ${rectData.length}, expected ${expectedBytes}`,
      );
    for (let j = 0; j < rect.height; j++) {
      const srcOffset = j * rect.width * bpp;
      const dstOffset = ((rect.y + j) * width + rect.x) * bpp;
      result.set(
        rectData.subarray(srcOffset, srcOffset + rect.width * bpp),
        dstOffset,
      );
    }
  }
  return result;
};

export const decodeTextZipV1 = async (
  zip: JSZip,
  manifest: ManifestV1,
): Promise<SlideFrame[]> => {
  const basePaths = new Set(
    manifest.files
      .filter((f) => f.extensions?.cropped)
      .map((f) => f.extensions?.cropped?.basePath)
      .filter((p): p is string => p !== undefined),
  );
  // Map from path → full reconstructed raw pixel buffer (for base-frame lookup)
  const frameRawBuffers = new Map<string, Uint8Array>();
  const frames: SlideFrame[] = [];

  for (let i = 0; i < manifest.files.length; i++) {
    const item = manifest.files[i];
    const { width, height } = item.rect;
    let rawBuffer: Uint8Array;

    const cropped = item.extensions?.cropped;
    if (cropped) {
      const baseBuffer = frameRawBuffers.get(cropped.basePath);
      if (!baseBuffer)
        throw new Error(`Base frame "${cropped.basePath}" not found`);
      const baseItem = manifest.files.find((f) => f.path === cropped.basePath);
      if (!baseItem)
        throw new Error(
          `Base frame item "${cropped.basePath}" not found in manifest`,
        );
      if (baseItem.rect.width !== width || baseItem.rect.height !== height)
        throw new Error(
          `Cropped frame "${item.path}" dimensions (${width}×${height}) ` +
            `differ from base "${cropped.basePath}" (${baseItem.rect.width}×${baseItem.rect.height})`,
        );
      if (baseItem.format !== item.format)
        throw new Error(
          `Cropped frame "${item.path}" format "${item.format}" ` +
            `differs from base "${cropped.basePath}" format "${baseItem.format}"`,
        );
      rawBuffer = await applyRects(
        baseBuffer,
        cropped.rects,
        zip,
        baseItem.rect.width,
        item.format,
      );
    } else {
      rawBuffer = await loadFile(zip, item.path);
    }

    frameRawBuffers.set(item.path, rawBuffer);
    frames.push({
      index: i,
      width,
      height,
      imageData: rawToImageData(rawBuffer, item),
    });

    // Release raw buffer if no later frame references it as a base
    if (!basePaths.has(item.path)) {
      frameRawBuffers.delete(item.path);
    }
  }

  return frames;
};
