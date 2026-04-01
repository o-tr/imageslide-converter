import type { SelectedFileAnimation } from "@/_types/file-picker";
import type { SlidePageElement } from "@/_types/google-slides-api";
import { type ParsedFrame, decompressFrames, parseGIF } from "gifuct-js";
import { emuToPixelRect } from "./emuToPixel";

const MAX_GIF_DIMENSION = 256;
const MAX_FRAMES = 60;
const TARGET_FPS = 2;
const TARGET_FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

type PageSize = {
  width: number;
  height: number;
};

type CanvasSize = {
  width: number;
  height: number;
};

const isGif = (buffer: ArrayBuffer): boolean => {
  if (buffer.byteLength < 6) return false;
  const header = new Uint8Array(buffer, 0, 6);
  const sig = String.fromCharCode(...header);
  return sig === "GIF87a" || sig === "GIF89a";
};

const clampDimensions = (w: number, h: number): { w: number; h: number } => {
  if (w <= MAX_GIF_DIMENSION && h <= MAX_GIF_DIMENSION) return { w, h };
  const scale = Math.min(MAX_GIF_DIMENSION / w, MAX_GIF_DIMENSION / h);
  return {
    w: Math.round(w * scale),
    h: Math.round(h * scale),
  };
};

/**
 * Returns the set of frame indices to output at TARGET_FPS by accumulating
 * per-frame delays. All frames must still be composited in order; only frames
 * at these indices are written to output.
 */
const sampleFrameIndices = (frames: ParsedFrame[]): Set<number> => {
  if (frames.length <= 1) return new Set([0]);

  const indices = new Set<number>([0]);
  let accumulatedMs = 0;
  let nextSampleMs = TARGET_FRAME_INTERVAL_MS;

  for (let i = 1; i < frames.length; i++) {
    accumulatedMs += frames[i].delay || 100;
    if (accumulatedMs >= nextSampleMs) {
      indices.add(i);
      nextSampleMs += TARGET_FRAME_INTERVAL_MS;
      if (indices.size >= MAX_FRAMES) break;
    }
  }
  return indices;
};

/**
 * Compose all GIF frames in order, maintaining a persistent canvas to handle
 * delta-frame (partial update) GIFs and GIF disposal methods correctly.
 * Outputs only frames at the given sample indices, resized to targetW × targetH.
 */
const buildComposedFrames = (
  allFrames: ParsedFrame[],
  sampleIndices: Set<number>,
  gifWidth: number,
  gifHeight: number,
  targetW: number,
  targetH: number,
): OffscreenCanvas[] => {
  const compositionCanvas = new OffscreenCanvas(gifWidth, gifHeight);
  const compositionCtx = compositionCanvas.getContext("2d");
  if (!compositionCtx) throw new Error("Cannot get 2d context");

  const output: OffscreenCanvas[] = [];
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
    const imageData = compositionCtx.createImageData(
      frame.dims.width,
      frame.dims.height,
    );
    imageData.data.set(frame.patch);
    compositionCtx.putImageData(imageData, frame.dims.left, frame.dims.top);

    prevDisposal = disposal;
    prevDims = frame.dims;

    if (sampleIndices.has(i)) {
      const result = new OffscreenCanvas(targetW, targetH);
      const resultCtx = result.getContext("2d");
      if (!resultCtx) throw new Error("Cannot get 2d context");
      resultCtx.drawImage(compositionCanvas, 0, 0, targetW, targetH);
      output.push(result);
    }

    if (output.length >= MAX_FRAMES) break;
  }

  compositionCanvas.close();
  return output;
};

const compositeWithBackground = (
  baseSlideCanvas: OffscreenCanvas,
  gifFrameCanvas: OffscreenCanvas,
  pixelRect: { x: number; y: number; w: number; h: number },
): OffscreenCanvas => {
  const composited = new OffscreenCanvas(pixelRect.w, pixelRect.h);
  const ctx = composited.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2d context");

  // Draw base slide region as background
  ctx.drawImage(
    baseSlideCanvas,
    pixelRect.x,
    pixelRect.y,
    pixelRect.w,
    pixelRect.h,
    0,
    0,
    pixelRect.w,
    pixelRect.h,
  );

  // Overlay GIF frame (transparent areas will show base)
  ctx.drawImage(gifFrameCanvas, 0, 0, pixelRect.w, pixelRect.h);

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

  const imageElements = pageElements.filter(
    (el) => el.image?.contentUrl && el.size && el.transform,
  );

  const animations: SelectedFileAnimation[] = [];

  for (const element of imageElements) {
    const contentUrl = element.image?.contentUrl;
    if (!contentUrl) continue;

    try {
      const response = await fetch(contentUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) continue;

      const buffer = await response.arrayBuffer();
      if (!isGif(buffer)) continue;

      const gif = parseGIF(buffer);
      const rawFrames = decompressFrames(gif, true);
      if (rawFrames.length <= 1) continue; // Static GIF, skip

      const sampleIndices = sampleFrameIndices(rawFrames);

      const gifWidth = gif.lsd.width;
      const gifHeight = gif.lsd.height;
      const { w: targetW, h: targetH } = clampDimensions(gifWidth, gifHeight);

      // Compute pixel rect on the rendered slide
      const sizeW = element.size?.width.magnitude ?? 0;
      const sizeH = element.size?.height.magnitude ?? 0;
      const scaleX = element.transform?.scaleX ?? 1;
      const scaleY = element.transform?.scaleY ?? 1;
      const translateX = element.transform?.translateX ?? 0;
      const translateY = element.transform?.translateY ?? 0;

      const emuRect = {
        x: translateX,
        y: translateY,
        w: sizeW * scaleX,
        h: sizeH * scaleY,
      };

      const pixelRect = emuToPixelRect(
        emuRect,
        { width: pageSize.width, height: pageSize.height },
        canvasSize,
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

      // Composite each frame with base slide background (handles transparent GIFs)
      // Close intermediate composed frames after compositing — they are no longer needed
      const frames = composedFrames.map((frameCanvas) => {
        const composited = compositeWithBackground(
          baseSlideCanvas,
          frameCanvas,
          pixelRect,
        );
        frameCanvas.close();
        return composited;
      });

      animations.push({
        x: pixelRect.x,
        y: pixelRect.y,
        w: pixelRect.w,
        h: pixelRect.h,
        fps: TARGET_FPS,
        frames,
      });
    } catch (e) {
      console.warn("Failed to extract GIF animation:", e);
      // Skip this GIF, continue with others
    }
  }

  return animations;
};
