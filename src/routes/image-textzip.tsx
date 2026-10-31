import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/image-textzip")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
