import { fontCatalog } from "@/lib/deckcraft/fontStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await fontCatalog(), {
      headers: { "Cache-Control": "no-cache" },
    });
  } catch {
    return new Response("Font catalog unavailable", { status: 503 });
  }
}
