import { ActualFileSizeLimit } from "@/const/convert";
import { S3_NORMAL_BUCKET, S3_NORMAL_PUBLIC_BASE_URL } from "@/const/env";
import { getSession } from "@/lib/iron-session";
import { s3NormalClient } from "@/lib/s3/normal";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const generatePreSignedPutUrl = async (
  fileName: string,
  contentLength: number,
  checksumSha256: string,
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: S3_NORMAL_BUCKET,
    Key: fileName,
    ContentLength: contentLength,
    // Signed into the URL as x-amz-checksum-sha256, so the storage verifies the
    // uploaded body against the hash the client computed.
    ChecksumSHA256: checksumSha256,
    Tagging: "registered=false",
    ContentType: "text/plain",
  });
  return await getSignedUrl(s3NormalClient, command, { expiresIn: 3600 });
};

const GetPreSignedPutSchema = z.object({
  fileId: z.string(),
  contentLength: z.number(),
  // Base64 of the 32-byte SHA-256 digest of the file.
  checksumSha256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
});

export const POST = async (request: Request) => {
  const _body = await request.json();
  const body = GetPreSignedPutSchema.safeParse(_body);
  if (!body.success) {
    return Response.json(
      {
        status: "error",
        error: "Invalid request",
      },
      { status: 400 },
    );
  }
  const session = await getSession();
  if (!session?.fileId) {
    return Response.json(
      {
        status: "error",
        error: "Invalid request",
      },
      { status: 400 },
    );
  }
  const { fileId, contentLength, checksumSha256 } = body.data;

  if (contentLength > ActualFileSizeLimit) {
    return Response.json(
      {
        status: "error",
        error: "Invalid request",
      },
      { status: 400 },
    );
  }

  // Every upload is a single object; index 0 keeps the key readable by the
  // viewer and player, which address files as <fileId>_<index>.
  const key = `${fileId}_0`;
  return Response.json({
    status: "success",
    data: {
      fileId,
      url: await generatePreSignedPutUrl(key, contentLength, checksumSha256),
      publicUrl: `${S3_NORMAL_PUBLIC_BASE_URL}/${key}`,
    },
  });
};
