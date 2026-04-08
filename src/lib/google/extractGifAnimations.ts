import type { SelectedFileAnimation } from "@/_types/file-picker";
import type { SlidePageElement } from "@/_types/google-slides-api";
import type { AnimatedGifCandidate } from "@/_types/lib/google/gifAnimation";
import type {
  CanvasSize,
  PageSize,
  PixelRect,
} from "@/_types/lib/google/slideGeometry";
import { type ParsedFrame, decompressFrames, parseGIF } from "gifuct-js";
import { emuToPixelRect } from "./emuToPixel";

const TRUSTED_HOSTNAMES = [
  ".google.com",
  ".googleapis.com",
  ".googleusercontent.com",
];

const isTrustedOrigin = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return TRUSTED_HOSTNAMES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
};

const MAX_GIF_DIMENSION = 256;
const MAX_SOURCE_GIF_DIMENSION = 4096;
const MAX_STORED_FRAME_DIMENSION = 512;
const MAX_FRAMES = 60;
const TARGET_FPS = 2;
const TARGET_FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

const isGif = (buffer: ArrayBuffer): boolean => {
  if (buffer.byteLength < 6) return false;
  const header = new Uint8Array(buffer, 0, 6);
  const sig = String.fromCharCode(...header);
  return sig === "GIF87a" || sig === "GIF89a";
};

const clampDimensions = (
  w: number,
  h: number,
  maxDimension = MAX_GIF_DIMENSION,
): { w: number; h: number } => {
  const safeW = Math.max(1, Math.round(w));
  const safeH = Math.max(1, Math.round(h));
  if (safeW <= maxDimension && safeH <= maxDimension)
    return { w: safeW, h: safeH };
  const scale = Math.min(maxDimension / safeW, maxDimension / safeH);
  return {
    w: Math.max(1, Math.round(safeW * scale)),
    h: Math.max(1, Math.round(safeH * scale)),
  };
};

const toPixelRect = (
  element: SlidePageElement,
  pageSize: PageSize,
  canvasSize: CanvasSize,
): PixelRect | null => {
  const size = element.size;
  const transform = element.transform;
  const scaleX = transform?.scaleX;
  const scaleY = transform?.scaleY;
  if (
    !size ||
    !transform ||
    // Only positive scale without shear is supported for pixel-rect projection.
    !!transform.shearX ||
    !!transform.shearY ||
    typeof scaleX !== "number" ||
    scaleX <= 0 ||
    typeof scaleY !== "number" ||
    scaleY <= 0
  ) {
    return null;
  }

  const emuRect = {
    x: transform.translateX ?? 0,
    y: transform.translateY ?? 0,
    w: size.width.magnitude * scaleX,
    h: size.height.magnitude * scaleY,
  };
  const pixelRect = emuToPixelRect(emuRect, pageSize, canvasSize);
  if (pixelRect.w <= 0 || pixelRect.h <= 0) return null;
  return pixelRect;
};

const computeAABBFromTransformedCorners = (
  element: SlidePageElement,
  pageSize: PageSize,
  canvasSize: CanvasSize,
): PixelRect | null => {
  const size = element.size;
  const transform = element.transform;
  if (!size || !transform) return null;
  const sourceW = size.width.magnitude;
  const sourceH = size.height.magnitude;
  if (sourceW <= 0 || sourceH <= 0) return null;

  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  const shearX = transform.shearX ?? 0;
  const shearY = transform.shearY ?? 0;
  const translateX = transform.translateX ?? 0;
  const translateY = transform.translateY ?? 0;

  const corners = [
    { x: 0, y: 0 },
    { x: sourceW, y: 0 },
    { x: 0, y: sourceH },
    { x: sourceW, y: sourceH },
  ];
  const pixelScaleX = canvasSize.width / pageSize.width;
  const pixelScaleY = canvasSize.height / pageSize.height;

  const transformedCorners = corners.map(({ x, y }) => {
    const emuX = scaleX * x + shearX * y + translateX;
    const emuY = shearY * x + scaleY * y + translateY;
    return { x: emuX * pixelScaleX, y: emuY * pixelScaleY };
  });

  const minX = Math.min(...transformedCorners.map((p) => p.x));
  const maxX = Math.max(...transformedCorners.map((p) => p.x));
  const minY = Math.min(...transformedCorners.map((p) => p.y));
  const maxY = Math.max(...transformedCorners.map((p) => p.y));

  const x = Math.floor(minX);
  const y = Math.floor(minY);
  const w = Math.max(1, Math.ceil(maxX) - x);
  const h = Math.max(1, Math.ceil(maxY) - y);
  return { x, y, w, h };
};

/**
 * Returns an ordered array of frame indices to output at TARGET_FPS.
 * A single source frame may appear multiple times if its delay spans
 * several TARGET_FRAME_INTERVAL_MS buckets, preserving correct playback tempo.
 */
const sampleFrameIndices = (frames: ParsedFrame[]): number[] => {
  if (frames.length <= 1) return [0];

  const indices: number[] = [];
  let accumulatedMs = 0;
  let nextSampleMs = 0;

  for (let i = 0; i < frames.length && indices.length < MAX_FRAMES; i++) {
    // gifuct-js converts GCE delay (centiseconds) to milliseconds via × 10;
    // fall back to 100ms if the field is missing or zero.
    accumulatedMs += frames[i].delay || 100;
    // Emit this frame once per interval bucket it covers
    while (accumulatedMs > nextSampleMs && indices.length < MAX_FRAMES) {
      indices.push(i);
      nextSampleMs += TARGET_FRAME_INTERVAL_MS;
    }
  }
  return indices.length > 0 ? indices : [0];
};

/**
 * Compose all GIF frames in order, maintaining a persistent canvas to handle
 * delta-frame (partial update) GIFs and GIF disposal methods correctly.
 * Outputs only frames at the given sample indices, resized to targetW × targetH.
 */
const buildComposedFrames = (
  allFrames: ParsedFrame[],
  sampleIndices: number[],
  gifWidth: number,
  gifHeight: number,
  targetW: number,
  targetH: number,
): OffscreenCanvas[] => {
  const compositionCanvas = new OffscreenCanvas(gifWidth, gifHeight);
  const compositionCtx = compositionCanvas.getContext("2d");
  if (!compositionCtx) throw new Error("Cannot get 2d context");

  const output: OffscreenCanvas[] = [];
  let samplePtr = 0; // pointer into sampleIndices array
  let prevDisposal = 0;
  let prevDims: ParsedFrame["dims"] | null = null;
  let prevSnapshot: ImageData | null = null;

  for (let i = 0; i < allFrames.length; i++) {
    const frame = allFrames[i];
    const disposal = frame.disposalType ?? 0;

    // Apply previous frame's disposal before drawing current patch
    if (prevDims) {
      if (prevDisposal === 2) {
        // Restore to background (clear to transparent)
        compositionCtx.clearRect(
          prevDims.left,
          prevDims.top,
          prevDims.width,
          prevDims.height,
        );
      } else if (prevDisposal === 3 && prevSnapshot) {
        // Restore to what was there before the previous frame was drawn
        compositionCtx.putImageData(prevSnapshot, prevDims.left, prevDims.top);
        prevSnapshot = null;
      }
      // disposal 0 or 1: leave canvas as-is
    }

    // Snapshot current region if this frame uses "restore to previous" on disposal
    if (disposal === 3) {
      prevSnapshot = compositionCtx.getImageData(
        frame.dims.left,
        frame.dims.top,
        frame.dims.width,
        frame.dims.height,
      );
    }

    // Draw current frame's patch onto the persistent composition canvas
    // while preserving destination pixels under transparent source pixels.
    const imageData = compositionCtx.getImageData(
      frame.dims.left,
      frame.dims.top,
      frame.dims.width,
      frame.dims.height,
    );
    const dstData = imageData.data;
    const srcData = frame.patch;
    const pixelCount = Math.min(srcData.length, dstData.length);
    for (let p = 0; p < pixelCount; p += 4) {
      const srcA = srcData[p + 3] / 255;
      if (srcA === 0) continue;

      const dstA = dstData[p + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);

      dstData[p] = Math.round(
        (srcData[p] * srcA + dstData[p] * dstA * (1 - srcA)) / outA,
      );
      dstData[p + 1] = Math.round(
        (srcData[p + 1] * srcA + dstData[p + 1] * dstA * (1 - srcA)) / outA,
      );
      dstData[p + 2] = Math.round(
        (srcData[p + 2] * srcA + dstData[p + 2] * dstA * (1 - srcA)) / outA,
      );
      dstData[p + 3] = Math.round(outA * 255);
    }
    compositionCtx.putImageData(imageData, frame.dims.left, frame.dims.top);

    prevDisposal = disposal;
    prevDims = frame.dims;

    // Output all samples that reference this frame index (may be >1 for long-delay frames)
    while (samplePtr < sampleIndices.length && sampleIndices[samplePtr] === i) {
      const result = new OffscreenCanvas(targetW, targetH);
      const resultCtx = result.getContext("2d");
      if (!resultCtx) throw new Error("Cannot get 2d context");
      resultCtx.drawImage(compositionCanvas, 0, 0, targetW, targetH);
      output.push(result);
      samplePtr++;
      if (output.length >= MAX_FRAMES) break;
    }

    if (output.length >= MAX_FRAMES) break;
  }

  return output;
};

const rectsIntersect = (a: PixelRect, b: PixelRect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const compositeWithBackground = (
  baseSlideCanvas: OffscreenCanvas,
  gifFrameCanvas: OffscreenCanvas,
  pixelRect: PixelRect,
  outputW: number,
  outputH: number,
): OffscreenCanvas => {
  const composited = new OffscreenCanvas(outputW, outputH);
  const ctx = composited.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2d context");

  ctx.drawImage(
    baseSlideCanvas,
    pixelRect.x,
    pixelRect.y,
    pixelRect.w,
    pixelRect.h,
    0,
    0,
    outputW,
    outputH,
  );
  ctx.drawImage(gifFrameCanvas, 0, 0, outputW, outputH);

  return composited;
};

export const extractGifAnimations = async (
  pageElements: SlidePageElement[],
  pageSize: PageSize,
  canvasSize: CanvasSize,
  baseSlideCanvas: OffscreenCanvas,
  token: string,
): Promise<SelectedFileAnimation[]> => {
  if (!token) {
    console.warn("extractGifAnimations: empty token, skipping GIF extraction");
    return [];
  }

  const imageElements = pageElements
    .map((element) => {
      const contentUrl = element.image?.contentUrl;
      if (!contentUrl) return null;
      const pixelRect = toPixelRect(element, pageSize, canvasSize);
      if (!pixelRect) return null;

      return { element, pixelRect };
    })
    .filter(
      (
        el,
      ): el is {
        element: SlidePageElement;
        pixelRect: PixelRect;
      } => el !== null,
    );

  const positionedElements = pageElements
    .map((element) => {
      const pixelRect =
        toPixelRect(element, pageSize, canvasSize) ??
        computeAABBFromTransformedCorners(element, pageSize, canvasSize);
      if (!pixelRect) return null;
      return { element, pixelRect };
    })
    .filter(
      (
        el,
      ): el is {
        element: SlidePageElement;
        pixelRect: PixelRect;
      } => el !== null,
    );

  const animatedGifCandidatesRaw = await Promise.all(
    imageElements.map(
      async ({ element, pixelRect }): Promise<AnimatedGifCandidate | null> => {
        const contentUrl = element.image?.contentUrl;
        if (!contentUrl || !isTrustedOrigin(contentUrl)) return null;
        try {
          const rangeSniffResponse = await fetch(contentUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Range: "bytes=0-5",
            },
          });
          if (!rangeSniffResponse.ok) return null;

          const headerBuffer = await rangeSniffResponse.arrayBuffer();
          if (!isGif(headerBuffer)) return null;

          let buffer = headerBuffer;
          if (
            rangeSniffResponse.status === 206 ||
            headerBuffer.byteLength <= 6
          ) {
            const fullResponse = await fetch(contentUrl, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!fullResponse.ok) return null;
            buffer = await fullResponse.arrayBuffer();
          }

          const gif = parseGIF(buffer);
          const gifWidth = gif.lsd.width;
          const gifHeight = gif.lsd.height;
          if (
            !(gifWidth > 0) ||
            !(gifHeight > 0) ||
            gifWidth > MAX_SOURCE_GIF_DIMENSION ||
            gifHeight > MAX_SOURCE_GIF_DIMENSION
          ) {
            console.warn(
              `extractGifAnimations: GIF dimensions out of range (${gifWidth}x${gifHeight}), skipping`,
            );
            return null;
          }

          const rawFrames = decompressFrames(gif, true);
          if (rawFrames.length <= 1) return null; // Static GIF, skip

          return {
            element,
            pixelRect,
            rawFrames,
            gifWidth,
            gifHeight,
          } satisfies AnimatedGifCandidate;
        } catch (e) {
          console.warn("Failed to extract GIF animation:", e);
          return null;
        }
      },
    ),
  );

  const animatedGifCandidates = animatedGifCandidatesRaw.filter(
    (candidate): candidate is AnimatedGifCandidate => candidate !== null,
  );

  const intersectingElementIndices = new Set<number>();
  for (let i = 0; i < animatedGifCandidates.length; i++) {
    for (let j = i + 1; j < animatedGifCandidates.length; j++) {
      if (
        rectsIntersect(
          animatedGifCandidates[i].pixelRect,
          animatedGifCandidates[j].pixelRect,
        )
      ) {
        intersectingElementIndices.add(i);
        intersectingElementIndices.add(j);
      }
    }
  }

  if (intersectingElementIndices.size > 0) {
    console.warn(
      `extractGifAnimations: skipping ${intersectingElementIndices.size} intersecting animated GIF element(s); overlapping animated rects are not supported with RGB24 animation encoding`,
    );
  }

  const animatedElements = new Set(animatedGifCandidates.map((c) => c.element));
  const intersectingNonAnimatedIndices = new Set<number>();
  for (let i = 0; i < animatedGifCandidates.length; i++) {
    const candidate = animatedGifCandidates[i];
    for (const positioned of positionedElements) {
      if (positioned.element === candidate.element) continue;
      if (animatedElements.has(positioned.element)) continue;
      if (rectsIntersect(candidate.pixelRect, positioned.pixelRect)) {
        intersectingNonAnimatedIndices.add(i);
        break;
      }
    }
  }

  if (intersectingNonAnimatedIndices.size > 0) {
    console.warn(
      `extractGifAnimations: skipping ${intersectingNonAnimatedIndices.size} animated GIF element(s) overlapping non-animated elements; preserving foreground overlap is not supported with RGB24 animation encoding`,
    );
  }

  const nonIntersectingAnimatedCandidates = animatedGifCandidates.filter(
    (_, index) =>
      !intersectingElementIndices.has(index) &&
      !intersectingNonAnimatedIndices.has(index),
  );

  const results = nonIntersectingAnimatedCandidates
    .map(({ pixelRect, rawFrames, gifWidth, gifHeight }) => {
      try {
        const sampleIndices = sampleFrameIndices(rawFrames);
        const { w: targetW, h: targetH } = clampDimensions(gifWidth, gifHeight);
        const { w: storedFrameW, h: storedFrameH } = clampDimensions(
          pixelRect.w,
          pixelRect.h,
          MAX_STORED_FRAME_DIMENSION,
        );

        // Build composed GIF frames with proper inter-frame compositing
        const composedFrames = buildComposedFrames(
          rawFrames,
          sampleIndices,
          gifWidth,
          gifHeight,
          targetW,
          targetH,
        );
        const frames = composedFrames.map((frameCanvas) =>
          compositeWithBackground(
            baseSlideCanvas,
            frameCanvas,
            pixelRect,
            storedFrameW,
            storedFrameH,
          ),
        );

        return {
          x: pixelRect.x,
          y: pixelRect.y,
          w: pixelRect.w,
          h: pixelRect.h,
          fps: TARGET_FPS,
          frames,
        } satisfies SelectedFileAnimation;
      } catch (e) {
        console.warn("Failed to build composed GIF frames:", e);
        return null;
      }
    })
    .filter((r): r is SelectedFileAnimation => r !== null);

  return results;
};
