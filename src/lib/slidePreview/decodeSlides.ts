import JSZip from "jszip";
import { decodeEIAv1 } from "./decodeEIAv1";
import { decodeTextZipV0 } from "./decodeTextZipV0";
import { decodeTextZipV1 } from "./decodeTextZipV1";
import type { SlideFrame } from "./types";

// ASCII codes for "EIA^"
const EIA_MAGIC = [69, 73, 65, 94];

const isEIA = (uint8: Uint8Array): boolean =>
  EIA_MAGIC.every((byte, i) => uint8[i] === byte);

export const decodeSlides = async (firstUrl: string): Promise<SlideFrame[]> => {
  const response = await fetch(firstUrl);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  if (isEIA(uint8)) {
    return decodeEIAv1(buffer);
  }

  // TextZip: the file is a base64-encoded ZIP string
  const base64 = new TextDecoder().decode(uint8);

  // Peek inside the ZIP to detect manifest version
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const metadataFile = zip.file("metadata.json");
  if (!metadataFile) throw new Error("metadata.json not found");
  const metadata = JSON.parse(await metadataFile.async("string"));

  if (metadata.manifestVersion === 1) {
    return decodeTextZipV1(base64);
  }
  return decodeTextZipV0(base64);
};
