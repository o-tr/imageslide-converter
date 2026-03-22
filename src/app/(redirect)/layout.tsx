import { AppShell } from "@/components/AppShell";
import type { ReactNode } from "react";

export default function RedirectLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
