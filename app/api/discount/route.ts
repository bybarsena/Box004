import { serverDb } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 256)
      return Response.json({ error: "Código no válido." }, { status: 400 });
    const { code } = JSON.parse(raw);
    if (typeof code !== "string" || code.length > 40)
      return Response.json({ error: "Código no válido." }, { status: 400 });
    const { data, error } = await serverDb()
      .from("discounts")
      .select("code,percent,expires_at,eligible_product_ids")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data || (data.expires_at && new Date(data.expires_at) < new Date()))
      return Response.json(
        { error: "Código no válido o caducado." },
        { status: 400 },
      );
    return Response.json(
      { code: data.code, percent: data.percent, eligibleProductIds: data.eligible_product_ids },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "No se pudo comprobar el descuento." },
      { status: 503 },
    );
  }
}
