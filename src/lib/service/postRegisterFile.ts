import { postRegisterFileResponseSchema } from "@/_types/api/postRegisterFile";
import axios from "axios";

export const postRegisterFile = async (
  fileId: string,
  fileName: string,
  totalSize: number,
  format: string,
  version: number,
  signal?: AbortSignal,
) => {
  const _data = await axios.post(
    "/api/upload/normal/register",
    {
      name: fileName,
      fileId: fileId,
      format: format,
      version: version,
      totalSize: totalSize,
    },
    { signal },
  );
  const { success, data } = postRegisterFileResponseSchema.safeParse(
    _data.data,
  );
  if (!success || data.status !== "success") {
    throw new Error("Invalid response");
  }
};
