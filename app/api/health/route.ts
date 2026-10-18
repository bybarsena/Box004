import { serverDb } from "@/lib/server";
export async function GET() {
  try {
    const { error } = await serverDb().from("products").select("id").limit(1);
    if (error) throw error;
    return Response.json(
      { ready: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ready: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
