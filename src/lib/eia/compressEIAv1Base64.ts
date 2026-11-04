import { Buffer } from "buffer";
import type {
  EIAFileV1,
  EIAFileV1CroppedPart,
  EIAManifestV1,
  EIASignageManifest,
} from "@/_types/eia/v1";
import type { RawImageObjV1Cropped } from "@/_types/text-zip/v1";
import { EIA_SIZE_LIMIT_ERROR, FileSizeLimit } from "@/const/fileSizeLimit";
import { compressLz4Best } from "./lz4Search";

export const compressEIAv1Base64 = async (
  data: RawImageObjV1Cropped[],
  signage?: EIASignageManifest,
): Promise<Buffer> => {
  const compressed = await compressEIAv1Base64Part(data, signage);
  if (compressed.length > FileSizeLimit) {
    throw new Error(
      `${EIA_SIZE_LIMIT_ERROR}: compressed size ${compressed.length} exceeds the limit of ${FileSizeLimit} bytes`,
    );
  }
  return Buffer.from(compressed, "utf-8");
};

const compressEIAv1Base64Part = async (
  data: RawImageObjV1Cropped[],
  signage?: EIASignageManifest,
) => {
  const usedFormats = new Set<string>();
  const files: EIAFileV1[] = [];
  const buffer: string[] = [];
  let bufferLength = 0;

  for (const image of data) {
    if (!image.cropped) {
      const compressed = Buffer.from(compressLz4Best(image.buffer)).toString(
        "base64",
      );
      buffer.push(compressed);
      usedFormats.add(image.format);
      files.push({
        t: "m",
        n: `${image.index}`,
        f: image.format,
        w: image.rect.width,
        h: image.rect.height,
        e: image.note ? { note: image.note } : undefined,
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
    const compressed = Buffer.from(compressLz4Best(mergedBuffer)).toString(
      "base64",
    );
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
      e: image.note ? { note: image.note } : undefined,
      r: parts,
    });
    bufferLength += compressed.length;
  }

  const manifest: EIAManifestV1 = {
    t: "eia",
    c: "lz4-base64",
    v: 1,
    f: Array.from(usedFormats).map((format) => `Format:${format}`),
    e: ["note"],
    i: files,
    m: signage,
  };

  const encodedBuffer = [`EIA^${JSON.stringify(manifest)}$`, ...buffer].join(
    "",
  );

  return encodedBuffer;
};
