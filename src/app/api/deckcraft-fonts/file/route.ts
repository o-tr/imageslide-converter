import { fontBytes } from "@/lib/deckcraft/fontStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const filePath = new URL(request.url).searchParams.get("path");
  if (!filePath) return new Response("Missing font path", { status: 400 });
  try {
    const bytes = await fontBytes(filePath);
    if (!bytes) return new Response("Font not found", { status: 404 });
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "font/ttf",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Font not found", { status: 404 });
  }
}
