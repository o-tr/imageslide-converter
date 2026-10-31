import Page from "@/app/(auth-popup)/auth/popup/page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_popup/auth/popup")({ component: Page });
