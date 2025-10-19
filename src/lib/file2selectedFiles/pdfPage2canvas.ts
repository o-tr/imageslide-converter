import type { PDFDocumentProxy } from "pdfjs-dist";

export const pdfPage2canvas = async (
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<OffscreenCanvas> => {
  const page = await pdf.getPage(pageNumber + 1);
  const viewport = page.getViewport({ scale: 1 });

  // 4K基準で読み込むためのスケール計算
  // アスペクト比を維持しつつ、横幅が3840pxまたは縦が2160pxに収まる最大スケールを計算
  const targetWidth = 3840;
  const targetHeight = 2160;

  const scaleX = targetWidth / viewport.width;
  const scaleY = targetHeight / viewport.height;
  const scale = Math.min(scaleX, scaleY, 3); // 最大3倍まで

  const scaledViewport = page.getViewport({ scale: scale });
  const canvas = new OffscreenCanvas(
    scaledViewport.width,
    scaledViewport.height,
  );
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas not found");
  }
  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport: scaledViewport,
  }).promise;
  return canvas;
};
