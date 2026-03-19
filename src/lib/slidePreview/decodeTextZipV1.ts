import type { SlideFrame } from "@/_types/slide-preview";
import type {
  ManifestV1,
  ManifestV1ExtensionCropped,
  ManifestV1Item,
} from "@/_types/text-zip/v1";
import type JSZip from "jszip";
import { rgb24ToImageData, rgba32ToImageData } from "./rawImage2ImageData";

const rawToImageData = (data: Uint8Array, item: ManifestV1Item): ImageData => {
  const { width, height } = item.rect;
  if (item.format === "RGBA32") return rgba32ToImageData(data, width, height);
  if (item.format === "RGB24") return rgb24ToImageData(data, width, height);
  throw new Error(`Unsupported image format: "${item.format}"`);
};

const applyRects = (
  baseBuffer: Uint8Array,
  rects: ManifestV1ExtensionCropped["rects"],
  fileBuffers: Map<string, Uint8Array>,
  width: number,
  format: string,
): Uint8Array => {
  const bpp =
    format === "RGBA32"
      ? 4
      : format === "RGB24"
        ? 3
        : (() => {
            throw new Error(`Unsupported format in applyRects: "${format}"`);
          })();
  const result = new Uint8Array(baseBuffer);
  for (const rect of rects) {
    const rectData = fileBuffers.get(rect.path);
    if (!rectData) throw new Error(`Rect file "${rect.path}" not found in zip`);
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
  // Load all files from the zip in parallel
  const fileBuffers = new Map<string, Uint8Array>();
  await Promise.all(
    Object.keys(zip.files)
      .filter((name) => name !== "metadata.json")
      .map(async (name) => {
        const zipEntry = zip.files[name];
        if (!zipEntry.dir) {
          fileBuffers.set(name, await zipEntry.async("uint8array"));
        }
      }),
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
      rawBuffer = applyRects(
        baseBuffer,
        cropped.rects,
        fileBuffers,
        baseItem.rect.width,
        item.format,
      );
    } else {
      const data = fileBuffers.get(item.path);
      if (!data) throw new Error(`File "${item.path}" not found in zip`);
      rawBuffer = data;
    }

    frameRawBuffers.set(item.path, rawBuffer);
    frames.push({
      index: i,
      width,
      height,
      imageData: rawToImageData(rawBuffer, item),
    });
  }

  return frames;
};
