import { auth } from "@/auth";
import { GIF_SIZE_CAP } from "@/const/config";
import { isTrustedOrigin } from "@/lib/google/trustedOrigins";

// Allow only known non-scriptable raster/binary types.
// image/svg+xml is intentionally excluded: SVG is executable XML (inline <script>,
// event handlers) and would enable XSS from attacker-controlled Google-hosted content.
// application/octet-stream is included for CDN responses that omit a specific MIME type;
// callers MUST validate the actual content bytes (e.g. via isGif()) before treating the
// payload as any specific format — this proxy does not perform content-level validation.
const ALLOWED_CONTENT_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "application/octet-stream",
]);

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
    const upstream = await fetch(targetUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return new Response("Forbidden", { status: 403 });
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status });
    }

    const contentType =
      upstream.headers.get("Content-Type") ?? "application/octet-stream";

    const baseContentType = contentType.split(";")[0].trim();
    if (!ALLOWED_CONTENT_TYPES.has(baseContentType)) {
      await upstream.body?.cancel();
      return new Response("Forbidden", { status: 403 });
    }

    // Buffer the body so we can enforce the cap before committing to a 200 response.
    // Streaming would send 200 before we know the total size, making a 413 impossible.
    const reader = upstream.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > GIF_SIZE_CAP) {
            return new Response("Content Too Large", { status: 413 });
          }
          chunks.push(value);
        }
      } finally {
        // Ignore cancel() rejection (stream may already be closed/errored) so
        // it does not override a 413 return already issued from inside the loop.
        reader.cancel().catch(() => {});
      }
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Do not forward Content-Length: fetch() decompresses gzip/brotli transparently,
    // so the upstream value reflects the compressed size and would mismatch the body.
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    };

    return new Response(body, { headers });
  } catch (e) {
    console.error("proxy-google-image error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}
