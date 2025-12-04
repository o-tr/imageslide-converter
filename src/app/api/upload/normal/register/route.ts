import { S3_NORMAL_BUCKET } from "@/const/env";
import { getSession } from "@/lib/iron-session";
import { prisma } from "@/lib/prisma";
import { s3NormalClient } from "@/lib/s3/normal";
import { getAuthorizedUser } from "@/utils/getAuthorizedUser";
import { PutObjectTaggingCommand } from "@aws-sdk/client-s3";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  name: z.string(),
  fileId: z.string(),
  version: z.number(),
  format: z.string(),
  totalSize: z.number(),
  count: z.number(),
});

export const POST = async (request: Request) => {
  try {
    const _body = await request.json();
    const { success, data } = RequestSchema.safeParse(_body);
    if (!success || !data) {
      return NextResponse.json(
        {
          status: "error",
          error: "Invalid request",
        },
        { status: 400 },
      );
    }
    const session = await getSession(await cookies());
    if (!session.fileId?.includes(data.fileId)) {
      return NextResponse.json(
        {
          status: "error",
          error: "Invalid request",
        },
        { status: 400 },
      );
    }
    const user = await getAuthorizedUser();
    await prisma.file.create({
      data: {
        name: data.name,
        bucket: S3_NORMAL_BUCKET,
        fileId: data.fileId,
        totalSize: data.totalSize,
        count: data.count,
        version: data.version,
        format: data.format,
        user: user
          ? {
              connect: {
                id: user.id,
              },
            }
          : undefined,
      },
    });

    await Promise.all(
      Array.from({ length: data.count }).map(async (_, index) => {
        const fileName = `${data.fileId}_${index}`;
        await s3NormalClient.send(
          new PutObjectTaggingCommand({
            Bucket: S3_NORMAL_BUCKET,
            Key: fileName,
            Tagging: {
              TagSet: [
                {
                  Key: "registered",
                  Value: "true",
                },
                {
                  Key: "guest",
                  Value: user ? "false" : "true",
                },
              ],
            },
          }),
        );
      }),
    );

    return NextResponse.json({
      status: "success",
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      {
        status: "error",
        error: "Internal Server Error",
      },
      { status: 500 },
    );
  }
};
