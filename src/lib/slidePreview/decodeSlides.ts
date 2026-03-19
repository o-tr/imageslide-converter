import type { SlideFrame } from "@/_types/slide-preview";
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
    return decodeTextZipV1(zip);
  }
  return decodeTextZipV0(zip);
};

export const decodeSlides = async (
  urls: string[],
  signal: AbortSignal,
): Promise<SlideFrame[]> => {
  const allFrames: SlideFrame[] = [];
  for (const url of urls) {
    const partFrames = await decodePart(url, signal);
    const offset = allFrames.length;
    for (const frame of partFrames) {
      allFrames.push({ ...frame, index: frame.index + offset });
    }
  }
  return allFrames;
};
