import Page from "@/app/(_convert)/convert/upload/page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_convert/convert/upload")({
  component: Page,
});
