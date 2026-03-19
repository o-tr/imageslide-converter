import type { SlideFrame } from "@/_types/slide-preview";
import type { ManifestV0 } from "@/_types/text-zip/v0";
import type JSZip from "jszip";
import { rgba32ToImageData } from "./rawImage2ImageData";

export const decodeTextZipV0 = async (zip: JSZip): Promise<SlideFrame[]> => {
  const metadataFile = zip.file("metadata.json");
  if (!metadataFile) throw new Error("metadata.json not found in zip");
  const manifest: ManifestV0 = JSON.parse(await metadataFile.async("string"));

  const frames: SlideFrame[] = [];
  for (let i = 0; i < manifest.length; i++) {
    const item = manifest[i];
    const file = zip.file(item.path);
    if (!file) throw new Error(`File ${item.path} not found in zip`);
    const data = await file.async("uint8array");
    frames.push({
      index: i,
      width: item.rect.width,
      height: item.rect.height,
      imageData: rgba32ToImageData(data, item.rect.width, item.rect.height),
    });
  }

  return frames;
};
