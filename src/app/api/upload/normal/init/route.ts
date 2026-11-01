import { getSession } from "@/lib/iron-session";

export const POST = async () => {
  try {
    const session = await getSession();
    session.fileId ??= [];
    const id = crypto.randomUUID();
    session.fileId = [...session.fileId, id];
    await session.save();
    return Response.json({
      status: "success",
      data: {
        fileId: id,
      },
    });
  } catch (error) {
    console.log(error);
    return Response.json(
      {
        status: "error",
        error: "Internal Server Error",
      },
      { status: 500 },
    );
  }
};
