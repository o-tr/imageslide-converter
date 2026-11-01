import * as file from "@/app/api/files/[fileId]/route";
import * as health from "@/app/api/healthz/route";
import * as migrate from "@/app/api/my/files/[fileId]/migrate-ha/route";
import * as myFile from "@/app/api/my/files/[fileId]/route";
import * as myFiles from "@/app/api/my/files/route";
import * as image from "@/app/api/proxy-google-image/route";
import * as presigned from "@/app/api/upload/normal/get-presigned-put/route";
import * as init from "@/app/api/upload/normal/init/route";
import * as register from "@/app/api/upload/normal/register/route";
import { auth, authHandler, externalUrl } from "@/auth";
import { appendContextCookies, withRequest } from "@/server/context";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { Hono } from "hono";

const api = new Hono();
api.on(["GET", "POST"], "/api/auth/*", (c) => authHandler(c.req.raw));
api.get("/api/runtime-config.js", (c) => {
  const names = [
    "NEXT_PUBLIC_GOOGLE_API_KEY",
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    "NEXT_PUBLIC_S3_NORMAL_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_S3_HA_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_ENABLE_GIF_ANIMATION",
  ];
  const values = Object.fromEntries(
    names.map((name) => [name, process.env[name] ?? ""]),
  );
  return c.body(
    `window.__IMAGE_SLIDE_CONFIG__=${JSON.stringify(values).replaceAll("<", "\\u003c")};`,
    200,
    {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  );
});
api.get("/api/healthz", () => health.GET());
api.get("/api/files/:fileId", (c) =>
  file.GET(c.req.raw, {
    params: Promise.resolve({ fileId: c.req.param("fileId") }),
  }),
);
api.get("/api/my/files", () => myFiles.GET());
api.delete("/api/my/files/:fileId", (c) =>
  myFile.DELETE(c.req.raw, {
    params: Promise.resolve({ fileId: c.req.param("fileId") }),
  }),
);
api.patch("/api/my/files/:fileId", (c) =>
  myFile.PATCH(c.req.raw, {
    params: Promise.resolve({ fileId: c.req.param("fileId") }),
  }),
);
api.post("/api/my/files/:fileId/migrate-ha", (c) =>
  migrate.POST(c.req.raw, {
    params: Promise.resolve({ fileId: c.req.param("fileId") }),
  }),
);
api.get("/api/proxy-google-image", (c) => image.GET(c.req.raw));
api.post("/api/upload/normal/init", () => init.POST());
api.post("/api/upload/normal/get-presigned-put", (c) =>
  presigned.POST(c.req.raw),
);
api.post("/api/upload/normal/register", (c) => register.POST(c.req.raw));

export default createServerEntry({
  fetch(request, options) {
    return withRequest(request, async () => {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        const response = await api.fetch(request);
        return appendContextCookies(response);
      }
      const needsAuth =
        url.pathname === "/my" || url.pathname.startsWith("/my/");
      const guestOnly = ["/login", "/register", "/auth/popup"].includes(
        url.pathname,
      );
      if (needsAuth || guestOnly) {
        const session = await auth();
        if (needsAuth && !session?.user) {
          const login = new URL("/login", externalUrl(request));
          login.searchParams.set("callbackUrl", url.pathname + url.search);
          return appendContextCookies(Response.redirect(login));
        }
        if (guestOnly && session?.user)
          return appendContextCookies(
            Response.redirect(new URL("/", externalUrl(request))),
          );
      }
      return appendContextCookies(await handler.fetch(request, options));
    });
  },
});
