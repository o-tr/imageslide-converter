import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_convert/convert/options")({
  beforeLoad: () => {
    throw redirect({ to: "/convert/pick" });
  },
});
