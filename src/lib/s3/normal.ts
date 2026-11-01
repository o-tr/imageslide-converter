import {
  S3_NORMAL_ACCESS_KEY,
  S3_NORMAL_ENDPOINT,
  S3_NORMAL_SECRET_KEY,
} from "@/const/env";
import { S3Client } from "@aws-sdk/client-s3";

export const s3NormalClient = new S3Client({
  region: "auto",
  endpoint: S3_NORMAL_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: S3_NORMAL_ACCESS_KEY,
    secretAccessKey: S3_NORMAL_SECRET_KEY,
  },
});
