import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_convert/convert/")({
  beforeLoad: () => {
    throw redirect({ to: "/convert/pick" });
  },
});
