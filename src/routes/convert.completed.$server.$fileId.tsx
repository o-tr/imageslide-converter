import { createFileRoute, redirect } from "@tanstack/react-router";

// These URLs predate the server segment, so the actual mapping is
// server -> fileId and fileId -> size. Three-segment URLs are handled by the
// $size route.
export const Route = createFileRoute("/convert/completed/$server/$fileId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/files/$fileId", params: { fileId: params.server } });
  },
});
