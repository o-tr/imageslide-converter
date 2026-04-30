const TRUSTED_HOSTNAMES = [
  ".google.com",
  ".googleapis.com",
  ".googleusercontent.com",
];

const isTrustedOrigin = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return TRUSTED_HOSTNAMES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
};

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl || !isTrustedOrigin(targetUrl)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const upstream = await fetch(targetUrl);
    if (!upstream.ok) {
      return new Response(null, { status: upstream.status });
    }

    const buffer = await upstream.arrayBuffer();
    const contentType =
      upstream.headers.get("Content-Type") ?? "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}
