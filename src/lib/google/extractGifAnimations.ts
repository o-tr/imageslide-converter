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

const sampleFramesAt2Fps = (frames: ParsedFrame[]): ParsedFrame[] => {
  if (frames.length <= 1) return frames;

  const sampled: ParsedFrame[] = [frames[0]];
  let accumulatedMs = 0;
  let nextSampleMs = TARGET_FRAME_INTERVAL_MS;

  for (let i = 1; i < frames.length; i++) {
    accumulatedMs += frames[i].delay || 100;
    if (accumulatedMs >= nextSampleMs) {
      sampled.push(frames[i]);
      nextSampleMs += TARGET_FRAME_INTERVAL_MS;
      if (sampled.length >= MAX_FRAMES) break;
    }
  }
  return sampled;
};

const gifFrameToCanvas = (
  frame: ParsedFrame,
  gifWidth: number,
  gifHeight: number,
  targetW: number,
  targetH: number,
): OffscreenCanvas => {
  // Draw the decompressed frame patch onto a full-size GIF canvas
  const fullCanvas = new OffscreenCanvas(gifWidth, gifHeight);
  const fullCtx = fullCanvas.getContext("2d");
  if (!fullCtx) throw new Error("Cannot get 2d context");

  const imageData = fullCtx.createImageData(
    frame.dims.width,
    frame.dims.height,
  );
  imageData.data.set(frame.patch);
  fullCtx.putImageData(imageData, frame.dims.left, frame.dims.top);

  // Resize to target dimensions
  if (targetW === gifWidth && targetH === gifHeight) {
    return fullCanvas;
  }
  const resized = new OffscreenCanvas(targetW, targetH);
  const resizedCtx = resized.getContext("2d");
  if (!resizedCtx) throw new Error("Cannot get 2d context");
  resizedCtx.drawImage(fullCanvas, 0, 0, targetW, targetH);
  return resized;
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

      const sampledFrames = sampleFramesAt2Fps(rawFrames);

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

      // Convert and composite each frame
      const frames: OffscreenCanvas[] = [];
      for (const frame of sampledFrames) {
        const frameCanvas = gifFrameToCanvas(
          frame,
          gifWidth,
          gifHeight,
          targetW,
          targetH,
        );
        const composited = compositeWithBackground(
          baseSlideCanvas,
          frameCanvas,
          pixelRect,
        );
        frames.push(composited);
      }

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
