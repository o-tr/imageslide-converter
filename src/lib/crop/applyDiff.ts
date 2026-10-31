import { Buffer } from "buffer";
import type {
  RawImageObjV1,
  RawImageObjV1Cropped,
  RawImageObjV1CroppedPart,
} from "@/_types/text-zip/v1";

export const applyDiff = (
  source: RawImageObjV1Cropped,
  output: RawImageObjV1,
  diff: RawImageObjV1CroppedPart[],
): Buffer => {
  const width = output.rect.width;
  const result: Buffer = Buffer.alloc(output.buffer.length);

  const sourceBuffer = source.cropped?.merged ?? source.buffer;

  // copy source to result
  for (let y = 0; y < source.rect.height; y++) {
    const srcStart = y * source.rect.width * 3;
    const destStart = y * width * 3;
    sourceBuffer.copy(
      result,
      destStart,
      srcStart,
      srcStart + source.rect.width * 3,
    );
  }

  // copy diff to result
  for (const rect of diff) {
    const { x, y, width: rectWidth, height, buffer } = rect;
    for (let j = 0; j < height; j++) {
      const srcStart = j * rectWidth * 3;
      const destStart = ((y + j) * width + x) * 3;
      buffer.copy(result, destStart, srcStart, srcStart + rectWidth * 3);
    }
  }

  return result;
};
