import type { RawAnimationData } from "@/_types/eia/rawAnimationData";
import type {
  EIAAnimationFrameRef,
  EIAAnimationMeta,
  EIAFileV1,
  EIAFileV1CroppedPart,
  EIAManifestV1,
  EIASignageManifest,
} from "@/_types/eia/v1";
import type { RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { FileSizeLimit } from "@/const/convert";
import lz4 from "lz4js";

export const compressEIAv1 = async (
  data: RawImageObjV1Cropped[],
  signage?: EIASignageManifest,
  count = 1,
  stepSize = 10,
  animationMap?: Map<number, RawAnimationData[]>,
): Promise<Buffer[]> => {
  if (data.length === 0) return [];

  const normalizedStepSize = Math.max(1, Math.min(stepSize, data.length));
  const partCount =
    Math.ceil(data.length / (count * normalizedStepSize)) * normalizedStepSize;
  const calculatePartCount = (targetCount: number, targetStepSize: number) =>
    Math.ceil(data.length / (targetCount * targetStepSize)) * targetStepSize;
  const result: Buffer[] = [];

  for (let i = 0; i < count; i++) {
    const part = data.slice(i * partCount, (i + 1) * partCount);
    if (part.length === 0) break;

    // Build animation map for this part's indices
    let partAnimMap: Map<number, RawAnimationData[]> | undefined;
    if (animationMap) {
      partAnimMap = new Map();
      for (const image of part) {
        const anims = animationMap.get(image.index);
        if (anims) partAnimMap.set(image.index, anims);
      }
      if (partAnimMap.size === 0) partAnimMap = undefined;
    }
    const compressedPart = await compressEIAv1Part(part, signage, partAnimMap);

    if (compressedPart.length > FileSizeLimit) {
      if (part.length <= 1) {
        throw new Error(
          `Slide at index ${part[0]?.index ?? "?"} exceeds file size limit ` +
            `(${compressedPart.length} > ${FileSizeLimit}) and cannot be split further`,
        );
      }

      const reducedStepSize = Math.max(1, Math.floor(normalizedStepSize / 2));
      const stepCandidates =
        reducedStepSize < normalizedStepSize
          ? [reducedStepSize, normalizedStepSize]
          : [normalizedStepSize];

      let nextSplit: { count: number; stepSize: number } | null = null;
      for (const candidateStepSize of stepCandidates) {
        const startCount =
          candidateStepSize === normalizedStepSize ? count + 1 : 1;
        for (
          let candidateCount = startCount;
          candidateCount <= data.length;
          candidateCount++
        ) {
          if (
            calculatePartCount(candidateCount, candidateStepSize) < partCount
          ) {
            nextSplit = {
              count: candidateCount,
              stepSize: candidateStepSize,
            };
            break;
          }
        }
        if (nextSplit) break;
      }

      if (!nextSplit) {
        throw new Error(
          `Unable to split oversized EIA part for slide index ${part[0]?.index ?? "?"}`,
        );
      }

      return compressEIAv1(
        data,
        signage,
        nextSplit.count,
        nextSplit.stepSize,
        animationMap,
      );
    }

    result.push(compressedPart);
  }

  return result;
};

const compressEIAv1Part = async (
  data: RawImageObjV1Cropped[],
  signage?: EIASignageManifest,
  animationMap?: Map<number, RawAnimationData[]>,
) => {
  const usedFormats = new Set<string>();
  const usedFeatures = new Set<string>();
  const files: EIAFileV1[] = [];
  const buffer: Buffer[] = [];
  let bufferLength = 0;

  // Track animation metadata per slide index
  const slideAnimMeta = new Map<number, string>();

  for (const image of data) {
    const ext: { note?: string; a?: string } = {};
    if (image.note) ext.note = image.note;

    if (!image.cropped) {
      const compressed = Buffer.from(lz4.compress(image.buffer));
      buffer.push(compressed);
      usedFormats.add(image.format);
      files.push({
        t: "m",
        n: `${image.index}`,
        f: image.format,
        w: image.rect.width,
        h: image.rect.height,
        e: Object.keys(ext).length > 0 ? ext : undefined,
        s: bufferLength,
        l: compressed.length,
        u: image.buffer.length,
      });
      bufferLength += compressed.length;
      continue;
    }
    let fileBufferLength = 0;
    const fileBuffer: Buffer[] = [];
    const parts: EIAFileV1CroppedPart[] = [];

    for (const rect of image.cropped.rects) {
      fileBuffer.push(rect.buffer);
      usedFormats.add(image.format);
      parts.push({
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
        s: fileBufferLength,
        l: rect.buffer.length,
      });
      fileBufferLength += rect.buffer.length;
    }

    const mergedBuffer = Buffer.concat(fileBuffer);
    const compressed = Buffer.from(lz4.compress(mergedBuffer));
    buffer.push(compressed);

    files.push({
      t: "c",
      b: `${image.cropped.baseIndex}`,
      n: `${image.index}`,
      f: image.format,
      w: image.rect.width,
      h: image.rect.height,
      s: bufferLength,
      l: compressed.length,
      u: mergedBuffer.length,
      e: Object.keys(ext).length > 0 ? ext : undefined,
      r: parts,
    });
    bufferLength += compressed.length;
  }

  // Append animation frames to data section (after all slide data)
  if (animationMap) {
    for (const [slideIndex, anims] of animationMap) {
      const animMetas: EIAAnimationMeta[] = [];

      for (const [animIndex, anim] of anims.entries()) {
        const frameRefs: EIAAnimationFrameRef[] = [];
        let hasCroppedFrames = false;
        usedFormats.add(anim.format);
        for (const [frameIndex, frame] of anim.frames.entries()) {
          if (frame.format !== anim.format) {
            throw new Error(
              `Animation format mismatch at slide ${slideIndex}, animation ${animIndex}, frame ${frameIndex}: expected "${anim.format}", got "${frame.format}"`,
            );
          }
          if (!frame.cropped) {
            // Master frame: store full buffer
            const compressed = Buffer.from(lz4.compress(frame.buffer));
            buffer.push(compressed);
            frameRefs.push({
              t: "m",
              s: bufferLength,
              l: compressed.length,
              u: frame.buffer.length,
            });
            bufferLength += compressed.length;
          } else {
            // Cropped frame: concatenate rect buffers, then compress
            hasCroppedFrames = true;
            let fileBufferLength = 0;
            const fileBuffer: Buffer[] = [];
            const parts: EIAFileV1CroppedPart[] = [];
            for (const rect of frame.cropped.rects) {
              fileBuffer.push(rect.buffer);
              parts.push({
                x: rect.x,
                y: rect.y,
                w: rect.width,
                h: rect.height,
                s: fileBufferLength,
                l: rect.buffer.length,
              });
              fileBufferLength += rect.buffer.length;
            }
            const mergedBuffer = Buffer.concat(fileBuffer);
            const compressed = Buffer.from(lz4.compress(mergedBuffer));
            buffer.push(compressed);
            frameRefs.push({
              t: "c",
              b: frame.cropped.baseIndex,
              r: parts,
              s: bufferLength,
              l: compressed.length,
              u: mergedBuffer.length,
            });
            bufferLength += compressed.length;
          }
        }
        if (hasCroppedFrames) {
          usedFeatures.add("Feature:animation-crop");
        }

        animMetas.push({
          x: anim.x,
          y: anim.y,
          w: anim.w,
          h: anim.h,
          fps: anim.fps,
          f: anim.format,
          frames: frameRefs,
        });
      }

      slideAnimMeta.set(slideIndex, JSON.stringify(animMetas));
      usedFeatures.add("Feature:animation");
    }

    // Attach animation metadata to corresponding slide items
    for (const file of files) {
      const index = Number(file.n);
      const animJson = slideAnimMeta.get(index);
      if (animJson) {
        file.e = { ...file.e, a: animJson };
      }
    }
  }

  const features = [
    ...Array.from(usedFormats).map((format) => `Format:${format}`),
    ...Array.from(usedFeatures),
  ];

  const manifest: EIAManifestV1 = {
    t: "eia",
    c: "lz4",
    v: 1,
    f: features,
    e: ["note", ...(usedFeatures.has("Feature:animation") ? ["a"] : [])],
    i: files,
    m: signage,
  };

  const encodedBuffer = Buffer.concat([
    Buffer.from(`EIA^${JSON.stringify(manifest)}$`),
    ...buffer,
  ]);

  return encodedBuffer;
};
