import type { RawAnimationData } from "@/_types/eia/rawAnimationData";
import type {
  EIAAnimFramePoolItem,
  EIAAnimFramePoolItemCropped,
  EIAAnimation,
  EIAAnimationContainer,
  EIAAnimationRef,
  EIAFileV1,
  EIAFileV1CroppedPart,
  EIAManifestV1,
  EIASignageManifest,
} from "@/_types/eia/v1";
import type { RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { IMAGE_DIFF_THRESHOLD } from "@/const/config";
import { FileSizeLimit } from "@/const/convert";
import lz4 from "lz4js";

const SIMILARITY_THRESHOLD_RATIO = 0.005;
const IMAGE_FORMAT_RGBA32 = "RGBA32";

const getBytesPerPixel = (format: string): number => {
  if (format === IMAGE_FORMAT_RGBA32) return 4;
  if (format.startsWith("RGB24")) return 3;
  throw new Error(`Unsupported animation format: "${format}"`);
};

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

  for (const image of data) {
    const ext: { note?: string } = {};
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

  // Encode animations into a global pool + container
  let ac: EIAAnimationContainer | undefined;
  const slideAnimRefs = new Map<number, EIAAnimationRef[]>();

  if (animationMap) {
    const pool: EIAAnimFramePoolItem[] = [];
    const poolDecodedBuffers: Buffer[] = [];
    const anims: EIAAnimation[] = [];
    let animBufferLength = bufferLength;

    for (const [slideIndex, animsData] of animationMap) {
      const refs: EIAAnimationRef[] = [];

      for (const [animIndex, anim] of animsData.entries()) {
        const animId = `anim_${slideIndex}_${animIndex}`;

        if (anim.frames.length === 0) continue;
        usedFormats.add(anim.format);
        const bpp = getBytesPerPixel(anim.format);

        const frameW = anim.frames[0].rect.width;
        const frameH = anim.frames[0].rect.height;

        // Validation
        for (const [frameIndex, frame] of anim.frames.entries()) {
          if (frame.format !== anim.format) {
            throw new Error(
              `Animation format mismatch at slide ${slideIndex}, animation ${animIndex}, frame ${frameIndex}: expected "${anim.format}", got "${frame.format}"`,
            );
          }
          if (frame.rect.width !== frameW || frame.rect.height !== frameH) {
            throw new Error(
              `Animation frame size mismatch at slide ${slideIndex}, animation ${animIndex}, frame ${frameIndex}: expected ${frameW}x${frameH}, got ${frame.rect.width}x${frame.rect.height}`,
            );
          }
        }

        // Pass 1: decode all frames and assign pool indices (with dedup)
        const resolvedBuffers = new Map<number, Buffer>();
        const framePoolIndices: number[] = [];
        const newPoolFrames: RawImageObjV1Cropped[] = [];
        const newDecodedBuffers: Buffer[] = [];
        const cropBaseIndices = new Set<number>();

        for (const frame of anim.frames) {
          if (frame.cropped) {
            cropBaseIndices.add(frame.cropped.baseIndex);
          }
        }

        for (let fi = 0; fi < anim.frames.length; fi++) {
          const frame = anim.frames[fi];
          const decoded = decodeAnimationFrame(frame, resolvedBuffers, bpp);
          resolvedBuffers.set(fi, decoded);
          const requireExactMatch =
            frame.cropped !== undefined || cropBaseIndices.has(fi);

          const existing = findMatchingPoolIndex(
            decoded,
            poolDecodedBuffers,
            frameW,
            frameH,
            bpp,
            requireExactMatch,
          );
          if (existing >= 0) {
            framePoolIndices.push(existing);
            continue;
          }

          const localExisting = findMatchingPoolIndex(
            decoded,
            newDecodedBuffers,
            frameW,
            frameH,
            bpp,
            requireExactMatch,
          );
          if (localExisting >= 0) {
            framePoolIndices.push(pool.length + localExisting);
          } else {
            framePoolIndices.push(pool.length + newDecodedBuffers.length);
            newDecodedBuffers.push(decoded);
            newPoolFrames.push(frame);
          }
        }

        // Register decoded buffers for global dedup
        poolDecodedBuffers.push(...newDecodedBuffers);

        // Pass 2: compress new pool entries
        for (let ni = 0; ni < newPoolFrames.length; ni++) {
          const frame = newPoolFrames[ni];

          if (!frame.cropped) {
            const compressed = Buffer.from(lz4.compress(frame.buffer));
            pool.push({
              t: "m",
              f: anim.format,
              w: frameW,
              h: frameH,
              s: animBufferLength,
              l: compressed.length,
              u: frame.buffer.length,
            });
            buffer.push(compressed);
            animBufferLength += compressed.length;
          } else {
            // baseIndex is an index into anim.frames (not newPoolFrames), and
            // framePoolIndices is built with the same anim.frames indexing.
            const basePoolIndex = framePoolIndices[frame.cropped.baseIndex];
            const parts: EIAFileV1CroppedPart[] = [];
            let fileBufferLength = 0;
            const fileBuffer: Buffer[] = [];

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
            const poolItem: EIAAnimFramePoolItemCropped = {
              t: "c",
              f: anim.format,
              w: frameW,
              h: frameH,
              b: basePoolIndex,
              s: animBufferLength,
              l: compressed.length,
              u: mergedBuffer.length,
              r: parts,
            };
            pool.push(poolItem);
            buffer.push(compressed);
            animBufferLength += compressed.length;
          }
        }

        const seq = framePoolIndices.slice();

        anims.push({ id: animId, fps: anim.fps, seq });
        refs.push({ id: animId, x: anim.x, y: anim.y, w: anim.w, h: anim.h });
      }

      if (refs.length > 0) {
        slideAnimRefs.set(slideIndex, refs);
      }
    }

    if (pool.length > 0 && anims.length > 0) {
      ac = { pool, anims };
      usedFeatures.add("Feature:animation");
    }

    // Attach animation refs to corresponding slide items
    for (const file of files) {
      const index = Number(file.n);
      const refs = slideAnimRefs.get(index);
      if (refs) {
        file.e = { ...file.e, a: refs };
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
    e: [
      "note",
      ...(usedFeatures.has("Feature:animation") ? (["a"] as const) : []),
    ],
    i: files,
    m: signage,
    ac,
  };

  const encodedBuffer = Buffer.concat([
    Buffer.from(`EIA^${JSON.stringify(manifest)}$`),
    ...buffer,
  ]);

  return encodedBuffer;
};

const decodeAnimationFrame = (
  frame: RawImageObjV1Cropped,
  resolvedBuffers: Map<number, Buffer>,
  bpp: number,
): Buffer => {
  if (!frame.cropped) return frame.buffer;
  const base = resolvedBuffers.get(frame.cropped.baseIndex);
  if (!base) {
    throw new Error(
      `Base frame ${frame.cropped.baseIndex} not found for animation frame`,
    );
  }
  const result = Buffer.from(base);
  for (const rect of frame.cropped.rects) {
    for (let j = 0; j < rect.height; j++) {
      const srcStart = j * rect.width * bpp;
      const dstStart = ((rect.y + j) * frame.rect.width + rect.x) * bpp;
      rect.buffer.copy(result, dstStart, srcStart, srcStart + rect.width * bpp);
    }
  }
  return result;
};

const findMatchingPoolIndex = (
  decoded: Buffer,
  poolBuffers: Buffer[],
  width: number,
  height: number,
  bpp: number,
  requireExactMatch: boolean,
): number => {
  const expectedLength = width * height * bpp;
  if (decoded.length !== expectedLength) return -1;
  const threshold = Math.max(
    1,
    Math.floor(width * height * SIMILARITY_THRESHOLD_RATIO),
  );
  for (let i = 0; i < poolBuffers.length; i++) {
    if (poolBuffers[i].length !== expectedLength) continue;
    if (poolBuffers[i].equals(decoded)) return i;
    if (requireExactMatch) continue;
    const diff = computeDiffMask(poolBuffers[i], decoded, width, height, bpp);
    const diffCount = countDiffPixels(diff);
    if (diffCount <= threshold) return i;
  }
  return -1;
};

const computeDiffMask = (
  a: Buffer,
  b: Buffer,
  width: number,
  height: number,
  bpp: number,
): Uint8Array => {
  const result = new Uint8Array(width * height);
  const actualDiffThreshold = IMAGE_DIFF_THRESHOLD * bpp;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * bpp;
      let diff = 0;
      for (let channel = 0; channel < bpp; channel++) {
        diff += Math.abs(a[idx + channel] - b[idx + channel]);
      }
      result[y * width + x] = diff > actualDiffThreshold ? 1 : 0;
    }
  }
  return result;
};

const countDiffPixels = (diff: Uint8Array): number => {
  let count = 0;
  for (let i = 0; i < diff.length; i++) {
    if (diff[i] !== 0) count++;
  }
  return count;
};
