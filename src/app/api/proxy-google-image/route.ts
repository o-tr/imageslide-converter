import { auth } from "@/auth";
import { isTrustedOrigin } from "@/lib/google/trustedOrigins";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl || !isTrustedOrigin(targetUrl)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const upstream = await fetch(targetUrl, { redirect: "manual" });
    if (upstream.status >= 300 && upstream.status < 400) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!upstream.ok) {
      return new Response(null, { status: upstream.status });
    }

    const contentType =
      upstream.headers.get("Content-Type") ?? "application/octet-stream";
    const contentLength = upstream.headers.get("Content-Length");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    };
    if (contentLength) headers["Content-Length"] = contentLength;

    return new Response(upstream.body ?? new Uint8Array(0), { headers });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}
