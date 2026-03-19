import type { ManifestV0 } from "@/_types/text-zip/v0";
import JSZip from "jszip";
import { rgba32ToImageData } from "./rawImage2ImageData";
import type { SlideFrame } from "./types";

export const decodeTextZipV0 = async (
  base64: string,
): Promise<SlideFrame[]> => {
  const zip = await JSZip.loadAsync(base64, { base64: true });

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
