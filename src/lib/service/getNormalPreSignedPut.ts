import {
  type PreSignedPutItem,
  getNormalPreSignedPutResponseSchema,
} from "@/_types/api/getNormalPreSignedPut";
import axios from "axios";

export const getNormalPreSignedPut = async (
  fileId: string,
  contentLength: number,
  checksumSha256: string,
  signal?: AbortSignal,
): Promise<PreSignedPutItem> => {
  const _response = await axios.post(
    "/api/upload/normal/get-presigned-put",
    { fileId, contentLength, checksumSha256 },
    { signal },
  );
  const { success, data } = getNormalPreSignedPutResponseSchema.safeParse(
    _response.data,
  );
  if (!success || data.status !== "success") {
    throw new Error("Invalid response");
  }
  return data.data;
};
