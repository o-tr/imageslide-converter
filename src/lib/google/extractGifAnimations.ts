import type { SelectedFileAnimation, SkippedAnimation } from "@/_types/file-picker";
import type { SlidePageElement } from "@/_types/google-slides-api";
import type { AnimatedGifCandidate } from "@/_types/lib/google/gifAnimation";
import type {
  CanvasSize,
  PageSize,
  PixelRect,
} from "@/_types/lib/google/slideGeometry";
import { GIF_SIZE_CAP } from "@/const/config";
import { type ParsedFrame, decompressFrames, parseGIF } from "gifuct-js";
import { emuToPixelRect } from "./emuToPixel";
import { isTrustedOrigin } from "./trustedOrigins";

const MAX_GIF_DIMENSION = 256;
const MAX_SOURCE_GIF_DIMENSION = 4096;
const MAX_STORED_FRAME_DIMENSION = 512;
const MAX_FRAMES = 60;
const MAX_SOURCE_FRAMES = 500;
const MAX_PREVIEW_FPS = 15;

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
 * Derives a preview FPS from the source GIF's median frame delay, capped at MAX_PREVIEW_FPS.
 * Avoids downsampling smooth GIFs to the old fixed 2 fps.
 */
const derivePreviewFps = (frames: ParsedFrame[]): number => {
  if (frames.length === 0) return MAX_PREVIEW_FPS;
  // gifuct-js converts GCE delay (centiseconds) to ms via × 10; fall back to 100 ms
  // (matching sampleFrameIndices) when the field is missing or zero.
  const delays = frames.map((f) => f.delay || 100).sort((a, b) => a - b);
  // Use lower-median index so even-length arrays don't pick the slower half.
  // e.g. [100ms, 500ms] → lower median 100ms → 10fps, not upper median 500ms → 2fps.
  const medianDelay = delays[Math.floor((delays.length - 1) / 2)];
  return Math.min(MAX_PREVIEW_FPS, Math.max(1, Math.round(1000 / medianDelay)));
};

/**
 * Returns an ordered array of frame indices to output at targetFps.
 * A single source frame may appear multiple times if its delay spans
 * several target-interval buckets, preserving correct playback tempo.
 */
const sampleFrameIndices = (
  frames: ParsedFrame[],
  targetFps: number,
): number[] => {
  if (frames.length <= 1) return [0];

  const targetIntervalMs = 1000 / targetFps;
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
      nextSampleMs += targetIntervalMs;
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
  maxOutputFrames: number = MAX_FRAMES,
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
    const expectedLength = frame.dims.width * frame.dims.height * 4;
    if (srcData.length < expectedLength) {
      console.warn(
        `GIF frame patch is smaller than expected: got ${srcData.length} bytes, expected ${expectedLength} (${frame.dims.width}×${frame.dims.height})`,
      );
    }
    const pixelCount = Math.min(srcData.length, dstData.length);
    const alignedPixelCount = pixelCount - (pixelCount % 4);
    for (let p = 0; p < alignedPixelCount; p += 4) {
      const srcA = srcData[p + 3] / 255;
      if (srcA === 0) continue;

      const dstA = dstData[p + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      // outA === 0 is unreachable here (srcA > 0 guarantees outA > 0) but guards
      // against division by zero if floating-point behaviour ever changes.
      if (outA === 0) continue;

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
      if (output.length >= maxOutputFrames) break;
    }

    if (output.length >= maxOutputFrames) break;
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

const checkGifOverlapTransparency = (
  upper: AnimatedGifCandidate,
  intersectionRect: PixelRect,
  composedFrames: OffscreenCanvas[],
): boolean => {
  const { pixelRect: upperPixelRect } = upper;
  const firstFrame = composedFrames[0];
  if (!firstFrame) return false;
  const targetW = firstFrame.width;
  const targetH = firstFrame.height;

  // Slide-coordinate intersection → upper GIF composed-canvas coordinates
  const scaleX = targetW / upperPixelRect.w;
  const scaleY = targetH / upperPixelRect.h;
  const localX = Math.floor((intersectionRect.x - upperPixelRect.x) * scaleX);
  const localY = Math.floor((intersectionRect.y - upperPixelRect.y) * scaleY);
  const localW = Math.max(1, Math.ceil(intersectionRect.w * scaleX));
  const localH = Math.max(1, Math.ceil(intersectionRect.h * scaleY));

  const clampedX = Math.max(0, localX);
  const clampedY = Math.max(0, localY);
  const clampedW = Math.min(localW, targetW - clampedX);
  const clampedH = Math.min(localH, targetH - clampedY);

  if (clampedW <= 0 || clampedH <= 0) return false;

  for (const frame of composedFrames) {
    const ctx = frame.getContext("2d");
    if (!ctx) continue;
    const imageData = ctx.getImageData(
      clampedX,
      clampedY,
      clampedW,
      clampedH,
    );
    const data = imageData.data;
    for (let p = 3; p < data.length; p += 4) {
      // Alpha === 0 means the lower GIF would show through in RGB24 output.
      if (data[p] === 0) return true;
    }
  }
  return false;
};

export type ExtractGifAnimationsResult = {
  animations: SelectedFileAnimation[];
  skipped: SkippedAnimation[];
};

export const extractGifAnimations = async (
  pageElements: SlidePageElement[],
  pageSize: PageSize,
  canvasSize: CanvasSize,
  baseSlideCanvas: OffscreenCanvas,
  signal?: AbortSignal,
): Promise<ExtractGifAnimationsResult> => {
  const imageElements = pageElements
    .map((element) => {
      const contentUrl = element.image?.contentUrl;
      if (!contentUrl) return null;
      const pixelRect = toPixelRect(element, pageSize, canvasSize);
      if (!pixelRect) {
        // Sheared or unsupported-transform image elements cannot be projected to
        // a pixel rect and are not checked for GIF candidacy.
        console.warn(
          "extractGifAnimations: skipping image element with unsupported transform (shear/non-positive scale)",
          element.transform,
        );
        return null;
      }

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

  const fetchGifCandidate = async ({
    element,
    pixelRect,
  }: (typeof imageElements)[number]): Promise<AnimatedGifCandidate | null> => {
    const contentUrl = element.image?.contentUrl;
    if (!contentUrl || !isTrustedOrigin(contentUrl)) return null;
    try {
      // lh7-rt.googleusercontent.com does not return CORS headers, so proxy through our own server.
      const proxyUrl = `/api/proxy-google-image?url=${encodeURIComponent(contentUrl)}`;
      const fullResponse = await fetch(proxyUrl, { signal });
      if (!fullResponse.ok) return null;

      // Skip non-GIF content early if Content-Type indicates it's not a GIF.
      // Fall through for octet-stream/missing headers and let isGif() verify the bytes.
      // Normalize casing because servers may respond with e.g. "Image/GIF".
      const contentType = (fullResponse.headers.get("Content-Type") ?? "")
        .trim()
        .toLowerCase();
      if (
        contentType.length > 0 &&
        !contentType.includes("gif") &&
        !contentType.includes("octet-stream")
      ) {
        await fullResponse.body?.cancel();
        return null;
      }

      // Read body in chunks so we can abort early without buffering everything.
      // The size cap is also enforced server-side by /api/proxy-google-image (which
      // returns 413, caught by the !ok check above), so this client-side guard is
      // redundant in normal operation. Kept as defense-in-depth: if the proxy's cap
      // is ever bypassed, raised, or the response is served from a different path,
      // we still won't buffer arbitrarily large payloads into memory.
      const reader = fullResponse.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let totalSize = 0;
      let oversized = false;
      try {
        while (true) {
          signal?.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          totalSize += value.byteLength;
          if (totalSize > GIF_SIZE_CAP) {
            oversized = true;
            break;
          }
          chunks.push(value);
        }
      } finally {
        // Swallow cancel() rejection (stream may already be errored) so it does
        // not replace the original read error that triggered this finally block.
        reader.cancel().catch(() => {});
      }
      if (oversized) return null;

      const bodyBytes = new Uint8Array(totalSize);
      let byteOffset = 0;
      for (const chunk of chunks) {
        bodyBytes.set(chunk, byteOffset);
        byteOffset += chunk.byteLength;
      }
      const buffer = bodyBytes.buffer;
      if (!isGif(buffer)) return null;

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

      if (gif.frames.length > MAX_SOURCE_FRAMES) {
        console.warn(
          `extractGifAnimations: too many frames (${gif.frames.length}), skipping`,
        );
        return null;
      }

      const rawFrames = decompressFrames(gif, true);
      if (rawFrames.length <= 1) return null; // Static GIF, skip

      // Spec-compliant GIF frames stay within the logical screen. Reject
      // malformed frames upfront because the canvas API silently clips
      // out-of-bounds get/putImageData regions, which corrupts blending and
      // disposal-3 snapshots in subtle ways.
      const framesInBounds = rawFrames.every(
        (f) =>
          f.dims.width > 0 &&
          f.dims.height > 0 &&
          f.dims.left >= 0 &&
          f.dims.top >= 0 &&
          f.dims.left + f.dims.width <= gifWidth &&
          f.dims.top + f.dims.height <= gifHeight,
      );
      if (!framesInBounds) {
        console.warn(
          "extractGifAnimations: GIF has frame(s) outside logical canvas, skipping",
        );
        return null;
      }

      return {
        element,
        pixelRect,
        rawFrames,
        gifWidth,
        gifHeight,
      } satisfies AnimatedGifCandidate;
    } catch (e) {
      // Re-throw on abort so the batch loop exits immediately instead of
      // continuing to fetch remaining batches after the caller cancelled.
      if (signal?.aborted) throw e;
      console.warn("Failed to extract GIF animation:", e);
      return null;
    }
  };

  // Process in batches to cap concurrency and avoid saturating the proxy or
  // triggering Google-side rate limits on slides with many embedded images.
  const GIF_FETCH_CONCURRENCY = 4;
  const animatedGifCandidatesRaw: Array<AnimatedGifCandidate | null> = [];
  for (let i = 0; i < imageElements.length; i += GIF_FETCH_CONCURRENCY) {
    signal?.throwIfAborted();
    const batch = imageElements.slice(i, i + GIF_FETCH_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fetchGifCandidate));
    animatedGifCandidatesRaw.push(...batchResults);
  }

  const animatedGifCandidates = animatedGifCandidatesRaw.filter(
    (candidate): candidate is AnimatedGifCandidate => candidate !== null,
  );

  // Z-order: elements later in pageElements are drawn on top (higher Z).
  // Only elements drawn ABOVE the GIF can obscure it; elements below are already
  // baked into the base slide composite and do not cause artifacts.
  const elementZOrder = new Map<SlidePageElement, number>();
  for (let i = 0; i < pageElements.length; i++) {
    elementZOrder.set(pageElements[i], i);
  }

  // All animated GIF candidates are kept (overlapping animated rects are now
  // supported at runtime by drawing them in Z-order). We still skip candidates
  // that have higher-Z static elements overlapping them — these include
  // non-animated foreground elements and any animated GIFs that were blocked
  // by such elements higher up — since static foreground cannot be represented
  // correctly without baking it into every frame.
  const survivingAnimatedElements = new Set(
    animatedGifCandidates.map((c) => c.element),
  );
  const blockedByStaticIndices = new Set<number>();

  // Iterate from highest Z to lowest so that a GIF blocked by a static
  // foreground element is removed from survivingAnimatedElements *before* we
  // check any lower-Z GIFs. Otherwise the blocked (now-static) GIF would still
  // be treated as "animated" and wrongly protect lower GIFs from the same
  // foreground blocker.
  const sortedCandidates = animatedGifCandidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const zA = elementZOrder.get(a.candidate.element) ?? 0;
      const zB = elementZOrder.get(b.candidate.element) ?? 0;
      return zB - zA;
    });

  for (const { candidate, index } of sortedCandidates) {
    const gifZ = elementZOrder.get(candidate.element) ?? 0;
    let blocked = false;
    for (const positioned of positionedElements) {
      if (positioned.element === candidate.element) continue;
      if (survivingAnimatedElements.has(positioned.element)) continue;
      const posZ = elementZOrder.get(positioned.element) ?? 0;
      if (posZ <= gifZ) continue; // Below the GIF — composited into background, safe to ignore
      if (rectsIntersect(candidate.pixelRect, positioned.pixelRect)) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      blockedByStaticIndices.add(index);
      survivingAnimatedElements.delete(candidate.element);
    }
  }

  if (blockedByStaticIndices.size > 0) {
    console.warn(
      `extractGifAnimations: skipping ${blockedByStaticIndices.size} animated GIF element(s) blocked by higher-Z static elements; foreground overlap is not supported with RGB24 animation encoding`,
    );
  }

  const skippedRectsMap = new Map<string, SkippedAnimation>();
  for (const index of blockedByStaticIndices) {
    const rect = animatedGifCandidates[index].pixelRect;
    skippedRectsMap.set(
      `${rect.x},${rect.y},${rect.w},${rect.h},static-overlap`,
      { ...rect, reason: "static-overlap" },
    );
  }

  const nonIntersectingAnimatedCandidates = animatedGifCandidates.filter(
    (_, index) => !blockedByStaticIndices.has(index),
  );

  // Check for transparent-pixel overlaps between surviving animated GIFs.
  // Upper GIFs (higher Z) that have transparent pixels over a lower GIF
  // produce visual artifacts with RGB24 encoding, so we record a warning.
  const survivingSorted = nonIntersectingAnimatedCandidates
    .map((candidate) => ({
      candidate,
      z: elementZOrder.get(candidate.element) ?? 0,
    }))
    .sort((a, b) => b.z - a.z);

  // Cache composed frames lazily: only build them for an upper candidate
  // when it actually intersects with at least one lower candidate.
  const transparencyCache = new Map<
    SlidePageElement,
    OffscreenCanvas[]
  >();

  for (let i = 0; i < survivingSorted.length; i++) {
    const upper = survivingSorted[i];
    let upperFrames = transparencyCache.get(upper.candidate.element);

    for (let j = i + 1; j < survivingSorted.length; j++) {
      const lower = survivingSorted[j];
      if (!rectsIntersect(upper.candidate.pixelRect, lower.candidate.pixelRect))
        continue;

      if (!upperFrames) {
        const sampleIndices = upper.candidate.rawFrames.map((_, idx) => idx);
        const { w: targetW, h: targetH } = clampDimensions(
          upper.candidate.gifWidth,
          upper.candidate.gifHeight,
        );
        upperFrames = buildComposedFrames(
          upper.candidate.rawFrames,
          sampleIndices,
          upper.candidate.gifWidth,
          upper.candidate.gifHeight,
          targetW,
          targetH,
          upper.candidate.rawFrames.length,
        );
        transparencyCache.set(upper.candidate.element, upperFrames);
      }

      const ix =
        Math.max(
          upper.candidate.pixelRect.x,
          lower.candidate.pixelRect.x,
        );
      const iy =
        Math.max(
          upper.candidate.pixelRect.y,
          lower.candidate.pixelRect.y,
        );
      const iw =
        Math.min(
          upper.candidate.pixelRect.x + upper.candidate.pixelRect.w,
          lower.candidate.pixelRect.x + lower.candidate.pixelRect.w,
        ) - ix;
      const ih =
        Math.min(
          upper.candidate.pixelRect.y + upper.candidate.pixelRect.h,
          lower.candidate.pixelRect.y + lower.candidate.pixelRect.h,
        ) - iy;
      if (iw <= 0 || ih <= 0) continue;

      const intersectionRect: PixelRect = { x: ix, y: iy, w: iw, h: ih };
      if (
        checkGifOverlapTransparency(
          upper.candidate,
          intersectionRect,
          upperFrames,
        )
      ) {
        skippedRectsMap.set(
          `${intersectionRect.x},${intersectionRect.y},${intersectionRect.w},${intersectionRect.h},transparent-gif-overlap`,
          { ...intersectionRect, reason: "transparent-gif-overlap" },
        );
      }
    }
  }

  const results = nonIntersectingAnimatedCandidates
    .map(
      ({
        element,
        pixelRect,
        rawFrames,
        gifWidth,
        gifHeight,
      }): SelectedFileAnimation | null => {
        try {
          const previewFps = derivePreviewFps(rawFrames);
          const sampleIndices = sampleFrameIndices(rawFrames, previewFps);
          const { w: targetW, h: targetH } = clampDimensions(
            gifWidth,
            gifHeight,
          );
          const { w: storedFrameW, h: storedFrameH } = clampDimensions(
            pixelRect.w,
            pixelRect.h,
            MAX_STORED_FRAME_DIMENSION,
          );

          // Reuse full composed frames from transparencyCache when available.
          const cachedFrames = transparencyCache.get(element);
          let composedFrames: OffscreenCanvas[];
          if (cachedFrames) {
            composedFrames = sampleIndices.map((idx) => {
              const frame = cachedFrames[idx];
              if (!frame) {
                throw new Error(
                  `Cached frame index out of bounds: ${idx} >= ${cachedFrames.length}`,
                );
              }
              return frame;
            });
          } else {
            composedFrames = buildComposedFrames(
              rawFrames,
              sampleIndices,
              gifWidth,
              gifHeight,
              targetW,
              targetH,
            );
          }
          // compositeWithBackground bakes the full slide background (including
          // the static first frame of every other GIF) into each animation frame.
          // At runtime, when a higher-Z GIF has transparent pixels in an overlap
          // region, those pixels reveal the lower GIF's static first frame baked
          // into the background rather than its live animated frame. This is an
          // inherent limitation of RGB24 encoding, which lacks an alpha channel.
          const frames = composedFrames.map((frameCanvas) => {
            const result = compositeWithBackground(
              baseSlideCanvas,
              frameCanvas,
              pixelRect,
              storedFrameW,
              storedFrameH,
            );
            // OffscreenCanvas has no close() — rely on GC for resource release.
            return result;
          });

          return {
            x: pixelRect.x,
            y: pixelRect.y,
            w: pixelRect.w,
            h: pixelRect.h,
            fps: previewFps,
            fpsOverride: Math.min(5, previewFps),
            frames,
          } satisfies SelectedFileAnimation;
        } catch (e) {
          console.warn("Failed to build composed GIF frames:", e);
          return null;
        }
      },
    )
    .filter((r): r is SelectedFileAnimation => !!r);

  return {
    animations: results,
    skipped: Array.from(skippedRectsMap.values()),
  };
};
