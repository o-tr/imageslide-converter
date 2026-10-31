import {
  type PreSignedPutItem,
  getNormalPreSignedPutResponseSchema,
} from "@/_types/api/getNormalPreSignedPut";
import axios from "axios";

export const getNormalPreSignedPut = async (
  fileId: string,
  contentLengths: number[],
  signal?: AbortSignal,
): Promise<PreSignedPutItem[]> => {
  const _response = await axios.post(
    "/api/upload/normal/get-presigned-put",
    {
      fileId,
      data: contentLengths.map((contentLength, index) => ({
        index,
        contentLength,
      })),
    },
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
