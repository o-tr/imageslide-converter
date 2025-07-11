import type { SelectedFile } from "@/_types/file-picker";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { compressFileV1 } from "@/lib/text-zip/v1/compress";
import { executeTask } from "@/lib/worker/taskRunner";
import { initPromise } from "../basis";

export const selectedFiles2v1DXT1 = async (
  files: SelectedFile[]
): Promise<string[]> => {
  await initPromise;
  const buffers = await Promise.all(
    files.map<Promise<RawImageObjV1>>(async (file, index) => {
      const { buffer, width, height } = await convertInThread(file.canvas);
      return {
        index,
        rect: {
          width: width,
          height: height,
        },
        format: "DXT1",
        note: file.note,
        buffer: Buffer.from(buffer),
      };
    })
  );
  return await compressFileV1(buffers);
};

const convertInThread = async (
  canvas: OffscreenCanvas
): Promise<{
  buffer: ArrayBuffer;
  width: number;
  height: number;
}> => {
  const bitmap = canvas.transferToImageBitmap();
  return await executeTask<"convert-dxt1">(
    {
      type: "convert-dxt1",
      bitmap,
      requestId: crypto.randomUUID(),
    },
    [bitmap]
  );
};
