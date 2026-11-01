import { formatDateJST } from "@/utils/formatDateJST";
import { getAuthorizedUser } from "@/utils/getAuthorizedUser";
import { addDay } from "@formkit/tempo";

export const GET = async () => {
  const user = await getAuthorizedUser();
  if (!user)
    return Response.json(
      { status: "error", error: "Unauthorized" },
      { status: 401 },
    );
  const files = user.files.map((file) => ({
    fileId: file.fileId,
    name: file.name,
    count: file.count,
    server: file.ha ? "HA" : "Normal",
    format: file.format,
    version: file.version,
    createdAt: formatDateJST(new Date(file.createdAt)),
    expireAt: formatDateJST(addDay(new Date(file.createdAt), file.ha ? 7 : 30)),
  }));

  return Response.json({
    status: "success",
    data: {
      files,
    },
  });
};
