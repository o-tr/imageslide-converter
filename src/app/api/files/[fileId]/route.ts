import { prisma } from "@/lib/prisma";
import { addDay, format } from "@formkit/tempo";
import { NextResponse } from "next/server";

export const GET = async (
  _request: Request,
  { params: { fileId } }: { params: { fileId: string } },
) => {
  if (!fileId) {
    return NextResponse.json(
      {
        status: "error",
        error: "File not found",
      },
      { status: 404 },
    );
  }
  const file = await prisma.file.findFirst({
    where: {
      fileId,
    },
  });
  if (!file) {
    return NextResponse.json(
      {
        status: "error",
        error: "File not found",
      },
      { status: 404 },
    );
  }
  const expireAt = addDay(new Date(file.createdAt), file.ha ? 7 : 30);
  if (expireAt < new Date()) {
    await prisma.file.delete({
      where: {
        id: file.id,
      },
    });
    return NextResponse.json(
      {
        status: "error",
        error: "File not found",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    status: "success",
    data: {
      file: {
        fileId: file.fileId,
        name: file.name,
        count: file.count,
        server: file.ha ? "HA" : "Normal",
        format: file.format,
        version: file.version,
        createdAt: format(
          new Date(file.createdAt),
          "YYYY/MM/DD HH:mm:ss",
          "en",
        ),
        expireAt: format(expireAt, "YYYY/MM/DD HH:mm:ss", "en"),
      },
    },
  });
};
