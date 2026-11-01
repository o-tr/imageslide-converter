import styles from "@/app/globals.css?url";
import NotFound from "@/app/not-found";
import { SessionProvider } from "@/compat/auth-client";
import { GooglePickerProvider } from "@/components/GooglePickerProvider";
import { PdfjsProvider } from "@/components/PdfjsProviderClient";
import { ThemeProvider, themeBootstrap } from "@/components/ThemeProvider";
import { Toaster } from "@/components/primitives";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ImageSlide Converter" },
      { name: "description", content: "convert pdf/images to textzip" },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", href: "/icon.png" },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootShell,
  component: Root,
});
function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Fixed, application-owned theme bootstrap with no user input. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <HeadContent />
        <script src="/api/runtime-config.js" />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
function Root() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <Outlet />
        <Toaster />
      </SessionProvider>
      <PdfjsProvider />
      <GooglePickerProvider />
    </ThemeProvider>
  );
}
