import Page from "@/app/(auth-popup)/auth/popup/callback/page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_popup/auth/popup_/callback")({
  component: Page,
});
