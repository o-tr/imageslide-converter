import type { SelectedFile } from "@/_types/file-picker";

export async function getFileBuffer(file: SelectedFile): Promise<ArrayBuffer> {
  if (
    !file.canvas ||
    typeof OffscreenCanvas === "undefined" ||
    !(file.canvas instanceof OffscreenCanvas)
  ) {
    throw new Error("SelectedFile.canvas is not OffscreenCanvas");
  }
  const ctx = file.canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2d context not available");

  const imageData = ctx.getImageData(
    0,
    0,
    file.canvas.width,
    file.canvas.height,
  );

  // imageData.data.bufferがSharedArrayBufferの場合はArrayBufferに変換
  const buf = imageData.data.buffer;
  if (buf instanceof ArrayBuffer) {
    return buf.slice(0);
  }

  // SharedArrayBuffer等はUint8Array経由でArrayBuffer化
  const u8 = new Uint8Array(buf);
  const ab = new ArrayBuffer(u8.length);
  new Uint8Array(ab).set(u8);
  return ab;
}

export class FileHashCache {
  private cache = new WeakMap<SelectedFile, string>();

  async calcFileHash(file: SelectedFile): Promise<string> {
    const cached = this.cache.get(file);
    if (cached) return cached;

    const buffer = await getFileBuffer(file);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    this.cache.set(file, hash);
    return hash;
  }
}
