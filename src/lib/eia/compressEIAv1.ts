import type { RawAnimationData } from "@/_types/eia/rawAnimationData";
import type {
  EIAAnimFramePoolItem,
  EIAAnimFramePoolItemCropped,
  EIAAnimation,
  EIAAnimationContainer,
  EIAAnimationRef,
  EIAExtension,
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
  if (format === "RGB24") return 3;
  throw new Error(`Unsupported animation format: "${format}"`);
};

type FrameDimensions = { w: number; h: number };

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
  const usedExtensions = new Set<EIAExtension>();
  const files: EIAFileV1[] = [];
  const usedNames = new Set<string>();
  const buffer: Buffer[] = [];
  let bufferLength = 0;

  for (const image of data) {
    const name = `${image.index}`;
    if (usedNames.has(name)) {
      throw new Error(`Duplicate slide name "${name}"`);
    }
    usedNames.add(name);
    const ext: { note?: string } = {};
    if (image.note) {
      ext.note = image.note;
      usedExtensions.add("note");
    }

    const bpp = getBytesPerPixel(image.format);

    if (!image.cropped) {
      const expectedBytes = image.rect.width * image.rect.height * bpp;
      if (image.buffer.length !== expectedBytes) {
        throw new Error(
          `Buffer length mismatch for slide ${image.index}: expected ${expectedBytes}, got ${image.buffer.length}`,
        );
      }
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
    } else {
      const cropped = image.cropped;
      if (cropped.rects.length === 0) {
        throw new Error(`Slide ${image.index} is cropped but has no rects`);
      }
      if (cropped.baseIndex === image.index) {
        throw new Error(
          `Slide ${image.index} references itself as a base image`,
        );
      }

      // Detect crop reference cycles
      const visitedIndices = new Set<number>();
      let currentIndex: number | undefined = image.index;
      while (currentIndex !== undefined) {
        if (visitedIndices.has(currentIndex)) {
          throw new Error(
            `Circular crop reference detected involving slide ${image.index}`,
          );
        }
        visitedIndices.add(currentIndex);
        const currentImage = data.find((d) => d.index === currentIndex);
        if (!currentImage || !currentImage.cropped) break;
        currentIndex = currentImage.cropped.baseIndex;
      }

      let fileBufferLength = 0;
      const fileBuffer: Buffer[] = [];
      const parts: EIAFileV1CroppedPart[] = [];

      for (const rect of cropped.rects) {
        if (
          !Number.isFinite(rect.x) ||
          !Number.isFinite(rect.y) ||
          !Number.isInteger(rect.width) ||
          !Number.isInteger(rect.height) ||
          rect.x < 0 ||
          rect.y < 0 ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.x + rect.width > image.rect.width ||
          rect.y + rect.height > image.rect.height
        ) {
          throw new Error(
            `Invalid rect geometry for slide ${image.index}: (${rect.x},${rect.y}) size ${rect.width}x${rect.height} exceeds frame ${image.rect.width}x${image.rect.height}`,
          );
        }
        const expectedBytes = rect.width * rect.height * bpp;
        if (rect.buffer.length !== expectedBytes) {
          throw new Error(
            `Buffer length mismatch for slide ${image.index} rect (${rect.x},${rect.y}): expected ${expectedBytes}, got ${rect.buffer.length}`,
          );
        }
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

      const baseImage = data.find((d) => d.index === cropped.baseIndex);
      if (!baseImage) {
        throw new Error(
          `Base image ${cropped.baseIndex} not found for slide ${image.index}`,
        );
      }
      if (
        baseImage.format !== image.format ||
        baseImage.rect.width !== image.rect.width ||
        baseImage.rect.height !== image.rect.height
      ) {
        throw new Error(
          `Cropped slide ${image.index} dimensions/format mismatch with base ${cropped.baseIndex}`,
        );
      }

      const mergedBuffer = Buffer.concat(fileBuffer);
      const compressed = Buffer.from(lz4.compress(mergedBuffer));
      buffer.push(compressed);

      files.push({
        t: "c",
        b: `${cropped.baseIndex}`,
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
  }

  // Encode animations into a global pool + container
  let ac: EIAAnimationContainer | undefined;
  const slideAnimRefs = new Map<number, EIAAnimationRef[]>();

  if (animationMap) {
    const pool: EIAAnimFramePoolItem[] = [];
    const poolDecodedBuffers: Buffer[] = [];
    const poolDecodedDimensions: FrameDimensions[] = [];
    const poolDecodedFormats: string[] = [];
    const anims: EIAAnimation[] = [];
    let animBufferLength = bufferLength;

    for (const [slideIndex, animsData] of animationMap) {
      const refs: EIAAnimationRef[] = [];

      for (const [animIndex, anim] of animsData.entries()) {
        const animId = `anim_${slideIndex}_${animIndex}`;

        if (anim.frames.length === 0) continue;

        if (!(anim.fps > 0) || !Number.isFinite(anim.fps)) {
          throw new Error(
            `Invalid animation fps at slide ${slideIndex}, animation ${animIndex}: fps must be a positive finite number, got ${anim.fps}`,
          );
        }
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

        // Pass 1: decode all frames in dependency order and assign pool indices (with dedup)
        const decoded = new Map<number, Buffer>();
        const inProgress = new Set<number>();
        const framePoolIndices: number[] = [];
        const newPoolFrames: {
          frame: RawImageObjV1Cropped;
          originalIndex: number;
        }[] = [];
        const newDecodedBuffers: Buffer[] = [];
        const cropBaseIndices = new Set<number>();

        for (const frame of anim.frames) {
          if (frame.cropped) {
            cropBaseIndices.add(frame.cropped.baseIndex);
          }
        }

        for (let fi = 0; fi < anim.frames.length; fi++) {
          const decodedFrame = resolveAnimationFrame(
            anim.frames,
            fi,
            decoded,
            inProgress,
            bpp,
          );
          const frame = anim.frames[fi];
          const requireExactMatch =
            frame.cropped !== undefined || cropBaseIndices.has(fi);

          const existing = findMatchingPoolIndex(
            decodedFrame,
            poolDecodedBuffers,
            frameW,
            frameH,
            bpp,
            requireExactMatch,
            anim.format,
            poolDecodedFormats,
            poolDecodedDimensions,
          );
          if (existing >= 0) {
            framePoolIndices.push(existing);
            continue;
          }

          const localExisting = findMatchingPoolIndex(
            decodedFrame,
            newDecodedBuffers,
            frameW,
            frameH,
            bpp,
            requireExactMatch,
            anim.format,
          );
          if (localExisting >= 0) {
            framePoolIndices.push(pool.length + localExisting);
          } else {
            framePoolIndices.push(pool.length + newDecodedBuffers.length);
            newDecodedBuffers.push(decodedFrame);
            newPoolFrames.push({ frame, originalIndex: fi });
          }
        }

        // Register decoded buffers for global dedup
        poolDecodedBuffers.push(...newDecodedBuffers);
        for (let i = 0; i < newDecodedBuffers.length; i++) {
          poolDecodedDimensions.push({ w: frameW, h: frameH });
          poolDecodedFormats.push(anim.format);
        }

        // Pass 2: compress new pool entries
        for (let ni = 0; ni < newPoolFrames.length; ni++) {
          const { frame, originalIndex } = newPoolFrames[ni];

          if (!frame.cropped) {
            const expectedBytes = frameW * frameH * bpp;
            if (frame.buffer.length !== expectedBytes) {
              throw new Error(
                `Buffer length mismatch for animation frame ${originalIndex}: expected ${expectedBytes}, got ${frame.buffer.length}`,
              );
            }
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
            if (
              !Number.isInteger(frame.cropped.baseIndex) ||
              frame.cropped.baseIndex < 0 ||
              frame.cropped.baseIndex >= framePoolIndices.length
            ) {
              throw new Error(
                `Invalid animation base frame index ${frame.cropped.baseIndex} at slide ${slideIndex}, animation ${animIndex}`,
              );
            }
            if (frame.cropped.baseIndex === originalIndex) {
              throw new Error(
                `Animation frame ${originalIndex} references itself at slide ${slideIndex}, animation ${animIndex}`,
              );
            }
            if (frame.cropped.rects.length === 0) {
              throw new Error(
                `Animation frame ${originalIndex} has empty rects at slide ${slideIndex}, animation ${animIndex}`,
              );
            }
            const basePoolIndex = framePoolIndices[frame.cropped.baseIndex];
            const parts: EIAFileV1CroppedPart[] = [];
            let fileBufferLength = 0;
            const fileBuffer: Buffer[] = [];

            for (const rect of frame.cropped.rects) {
              const expectedBytes = rect.width * rect.height * bpp;
              if (rect.buffer.length !== expectedBytes) {
                throw new Error(
                  `Buffer length mismatch for animation frame ${originalIndex} rect (${rect.x},${rect.y}): expected ${expectedBytes}, got ${rect.buffer.length}`,
                );
              }
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

        // Validate and clip animation ref bounds against slide dimensions
        const slide = data.find((d) => d.index === slideIndex);
        if (!slide) {
          throw new Error(
            `Slide ${slideIndex} not found in data for animation ref validation`,
          );
        }
        if (
          !Number.isFinite(anim.x) ||
          !Number.isFinite(anim.y) ||
          !Number.isFinite(anim.w) ||
          !Number.isFinite(anim.h) ||
          anim.x < 0 ||
          anim.y < 0 ||
          anim.w <= 0 ||
          anim.h <= 0 ||
          anim.x >= slide.rect.width ||
          anim.y >= slide.rect.height
        ) {
          throw new Error(
            `Animation ref bounds invalid at slide ${slideIndex}, animation ${animIndex}: (${anim.x},${anim.y}) size ${anim.w}×${anim.h} for slide ${slide.rect.width}×${slide.rect.height}`,
          );
        }
        const clipW = Math.min(anim.w, slide.rect.width - anim.x);
        const clipH = Math.min(anim.h, slide.rect.height - anim.y);

        anims.push({ id: animId, fps: anim.fps, seq });
        refs.push({ id: animId, x: anim.x, y: anim.y, w: clipW, h: clipH });
      }

      if (refs.length > 0) {
        slideAnimRefs.set(slideIndex, refs);
      }
    }

    if (pool.length > 0 && anims.length > 0) {
      ac = { pool, anims };
      usedFeatures.add("Feature:animation");
      usedExtensions.add("a");
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
      ...(usedExtensions.has("note") ? (["note"] as const) : []),
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

const resolveAnimationFrame = (
  animFrames: RawImageObjV1Cropped[],
  fi: number,
  decoded: Map<number, Buffer>,
  inProgress: Set<number>,
  bpp: number,
): Buffer => {
  const cached = decoded.get(fi);
  if (cached !== undefined) return cached;
  if (inProgress.has(fi)) {
    throw new Error(`Circular animation frame reference at ${fi}`);
  }
  inProgress.add(fi);

  const frame = animFrames[fi];
  if (!frame) {
    throw new Error(`Animation frame ${fi} not found`);
  }
  let result: Buffer;
  if (!frame.cropped) {
    result = frame.buffer;
    decoded.set(fi, result);
  } else {
    const base = resolveAnimationFrame(
      animFrames,
      frame.cropped.baseIndex,
      decoded,
      inProgress,
      bpp,
    );
    result = Buffer.from(base);
    for (const rect of frame.cropped.rects) {
      for (let j = 0; j < rect.height; j++) {
        const srcStart = j * rect.width * bpp;
        const dstStart = ((rect.y + j) * frame.rect.width + rect.x) * bpp;
        rect.buffer.copy(
          result,
          dstStart,
          srcStart,
          srcStart + rect.width * bpp,
        );
      }
    }
    decoded.set(fi, result);
  }

  inProgress.delete(fi);
  return result;
};

const findMatchingPoolIndex = (
  decoded: Buffer,
  poolBuffers: Buffer[],
  width: number,
  height: number,
  bpp: number,
  requireExactMatch: boolean,
  format: string,
  poolFormats?: string[],
  poolDimensions?: FrameDimensions[],
): number => {
  const expectedLength = width * height * bpp;
  if (decoded.length !== expectedLength) return -1;
  const threshold = Math.max(
    1,
    Math.floor(width * height * SIMILARITY_THRESHOLD_RATIO),
  );
  for (let i = 0; i < poolBuffers.length; i++) {
    if (poolBuffers[i].length !== expectedLength) continue;
    if (poolFormats && poolFormats[i] !== format) continue;
    const candidateDimensions = poolDimensions?.[i];
    if (candidateDimensions) {
      if (candidateDimensions.w !== width || candidateDimensions.h !== height) {
        continue;
      }
    }
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
