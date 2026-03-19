import type { SlideFrame } from "@/_types/slide-preview";
import type { ManifestV0 } from "@/_types/text-zip/v0";
import type { ManifestV1 } from "@/_types/text-zip/v1";
import JSZip from "jszip";
import { decodeEIAv1 } from "./decodeEIAv1";
import { decodeTextZipV0 } from "./decodeTextZipV0";
import { decodeTextZipV1 } from "./decodeTextZipV1";

// ASCII codes for "EIA^"
const EIA_MAGIC = [69, 73, 65, 94];

const isEIA = (uint8: Uint8Array): boolean =>
  EIA_MAGIC.every((byte, i) => uint8[i] === byte);

const decodePart = async (
  url: string,
  signal: AbortSignal,
): Promise<SlideFrame[]> => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  if (isEIA(uint8)) {
    return decodeEIAv1(buffer);
  }

  // TextZip: the file is a base64-encoded ZIP string
  const base64 = new TextDecoder().decode(uint8);
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const metadataFile = zip.file("metadata.json");
  if (!metadataFile) throw new Error("metadata.json not found");
  const metadata = JSON.parse(await metadataFile.async("string"));

  if (metadata.manifestVersion === 1) {
    return decodeTextZipV1(zip, metadata as ManifestV1);
  }
  if (!metadata.manifestVersion) {
    return decodeTextZipV0(zip, metadata as ManifestV0);
  }
  throw new Error(`Unsupported manifest version: ${metadata.manifestVersion}`);
};

export const decodeSlides = async (
  urls: string[],
  signal: AbortSignal,
): Promise<SlideFrame[]> => {
  const partResults = await Promise.all(
    urls.map((url) => decodePart(url, signal)),
  );
  const allFrames: SlideFrame[] = [];
  for (const partFrames of partResults) {
    const offset = allFrames.length;
    const sorted = [...partFrames].sort((a, b) => a.index - b.index);
    for (let i = 0; i < sorted.length; i++) {
      allFrames.push({ ...sorted[i], index: offset + i });
    }
  }
  return allFrames;
};
