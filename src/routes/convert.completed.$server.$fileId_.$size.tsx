import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute(
  "/convert/completed/$server/$fileId_/$size",
)({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/files/$fileId", params: { fileId: params.fileId } });
  },
});
