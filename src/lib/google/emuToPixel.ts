import type {
  CanvasSize,
  PageSize,
  PixelRect,
} from "@/_types/lib/google/slideGeometry";

/**
 * Convert Google Slides EMU (English Metric Units) coordinates
 * to pixel coordinates on the rendered PDF canvas.
 *
 * The PDF is rendered to fit within 3840x2160 (matching pdfPage2canvas logic).
 */

type EmuRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const emuToPixelRect = (
  emu: EmuRect,
  pageSize: PageSize,
  canvasSize: CanvasSize,
): PixelRect => {
  const scaleX = canvasSize.width / pageSize.width;
  const scaleY = canvasSize.height / pageSize.height;
  return {
    x: Math.round(emu.x * scaleX),
    y: Math.round(emu.y * scaleY),
    w: Math.round(emu.w * scaleX),
    h: Math.round(emu.h * scaleY),
  };
};
