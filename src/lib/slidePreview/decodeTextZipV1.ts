import type {
  ManifestV1,
  ManifestV1ExtensionCropped,
  ManifestV1Item,
} from "@/_types/text-zip/v1";
import JSZip from "jszip";
import { rgb24ToImageData, rgba32ToImageData } from "./rawImage2ImageData";
import type { SlideFrame } from "./types";

const rawToImageData = (data: Uint8Array, item: ManifestV1Item): ImageData => {
  const { width, height } = item.rect;
  if (item.format === "RGBA32") return rgba32ToImageData(data, width, height);
  return rgb24ToImageData(data, width, height);
};

const applyRects = (
  baseBuffer: Uint8Array,
  rects: ManifestV1ExtensionCropped["rects"],
  fileBuffers: Map<string, Uint8Array>,
  width: number,
): Uint8Array => {
  const result = new Uint8Array(baseBuffer);
  for (const rect of rects) {
    const rectData = fileBuffers.get(rect.path);
    if (!rectData) throw new Error(`Rect file "${rect.path}" not found in zip`);
    for (let j = 0; j < rect.height; j++) {
      const srcOffset = j * rect.width * 3;
      const dstOffset = ((rect.y + j) * width + rect.x) * 3;
      result.set(
        rectData.subarray(srcOffset, srcOffset + rect.width * 3),
        dstOffset,
      );
    }
  }
  return result;
};

export const decodeTextZipV1 = async (
  base64: string,
): Promise<SlideFrame[]> => {
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const metadataFile = zip.file("metadata.json");
  if (!metadataFile) throw new Error("metadata.json not found in zip");
  const manifest: ManifestV1 = JSON.parse(await metadataFile.async("string"));

  // Load all files from the zip up front
  const fileBuffers = new Map<string, Uint8Array>();
  for (const name of Object.keys(zip.files)) {
    const zipEntry = zip.files[name];
    if (!zipEntry.dir) {
      fileBuffers.set(name, await zipEntry.async("uint8array"));
    }
  }

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
      rawBuffer = applyRects(baseBuffer, cropped.rects, fileBuffers, width);
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
