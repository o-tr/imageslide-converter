import type {
  AnimationFrame,
  AnimationSequence,
  DecodeResult,
  RawSignageItem,
  SlideFrame,
} from "@/_types/slide-preview";
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
): Promise<DecodeResult> => {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  const buffer = await response.arrayBuffer();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
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
): Promise<DecodeResult> => {
  const allFrames: SlideFrame[] = [];
  // Maps original EIA frame index (Number(item.n)) to global allFrames position
  const eiaIndexToGlobalPos = new Map<number, number>();
  let globalRawSignageItems: RawSignageItem[] | undefined;

  for (const url of urls) {
    const partResult = await decodePart(url, signal);
    const offset = allFrames.length;
    const sorted = [...partResult.frames].sort((a, b) => a.index - b.index);
    for (let i = 0; i < sorted.length; i++) {
      // sorted[i].index == Number(item.n) in the EIA manifest (original global slide index)
      eiaIndexToGlobalPos.set(sorted[i].index, offset + i);
      allFrames.push({ ...sorted[i], index: offset + i });
    }

    // Take signage items from the first part that has them; all EIA parts carry
    // the same full signage manifest so any part is sufficient.
    if (!globalRawSignageItems && partResult.rawSignageItems) {
      globalRawSignageItems = partResult.rawSignageItems;
    }
  }

  // Resolve the signage sequence globally so the original playback order is
  // preserved even when slides are interleaved across part boundaries.
  let mergedAnimation: AnimationSequence | null = null;
  if (globalRawSignageItems) {
    const seq: AnimationFrame[] = [];
    for (const item of globalRawSignageItems) {
      const globalPos = eiaIndexToGlobalPos.get(Number(item.frameName));
      if (globalPos === undefined) continue;
      seq.push({ frameIndex: globalPos, duration: item.duration });
    }
    if (seq.length > 0) mergedAnimation = seq;
  }

  return { frames: allFrames, animation: mergedAnimation };
};
