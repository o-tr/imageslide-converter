import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/convert/completed/$server/$fileId")({
  beforeLoad: ({ params, location }) => {
    const segments = location.pathname.split("/").filter(Boolean);
    throw redirect({
      to: "/files/$fileId",
      params: { fileId: segments.length >= 5 ? params.fileId : params.server },
    });
  },
});
