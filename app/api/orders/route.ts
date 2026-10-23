import { createHash } from "node:crypto";
import { Resend } from "resend";
import { serverDb } from "@/lib/server";
import { orderInput } from "@/lib/order-input";
import { money, type Item } from "@/lib/types";
export const runtime = "nodejs";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 32768)
      return Response.json(
        { error: "Pedido demasiado grande." },
        { status: 413 },
      );
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Datos no válidos." }, { status: 400 });
    }
    const parsed = orderInput.safeParse(json);
    if (!parsed.success)
      return Response.json(
        { error: "Revisa el nombre, apellidos, contacto y prendas." },
        { status: 400 },
      );
    const input = parsed.data,
      db = serverDb();
    if (input.manual) {
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer (.+)$/)?.[1];
      if (!token)
        return Response.json({ error: "Inicia sesión." }, { status: 401 });
      const {
        data: { user },
        error,
      } = await db.auth.getUser(token);
      if (error || !user)
        return Response.json({ error: "Sesión caducada." }, { status: 401 });
      const { data: admin, error: ae } = await db
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (ae || !admin)
        return Response.json(
          { error: "Sin permisos de administración." },
          { status: 403 },
        );
    }
    const ip = process.env.VERCEL
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
      : "local";
    const { data: receipt, error } = await db.rpc("submit_order", {
      p_request_id: input.requestId,
      p_customer: {
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
      },
      p_lines: input.lines.map((l) => ({
        variant_id: l.variantId,
        quantity: l.quantity,
      })),
      p_discount: input.discount,
      p_source: input.manual ? "manual" : "web",
      p_rate_key: createHash("sha256")
        .update(`${process.env.SUPABASE_SECRET_KEY}:${ip}`)
        .digest("hex"),
    });
    if (error) {
      if (error.message.includes("rate_limit"))
        return Response.json(
          { error: "Demasiados pedidos. Inténtalo más tarde." },
          { status: 429 },
        );
      if (error.message.includes("invalid_discount"))
        return Response.json(
          { error: "Descuento no válido o caducado." },
          { status: 400 },
        );
      if (error.message.includes("unavailable_variant"))
        return Response.json(
          { error: "Una prenda ya no está disponible. Recarga el catálogo." },
          { status: 409 },
        );
      throw new Error("database_error");
    }
    let emailSent = false;
    if (
      !receipt.replayed &&
      process.env.RESEND_API_KEY &&
      process.env.BOX004_EMAIL_FROM
    ) {
      try {
        const { data: lines, error: le } = await db
          .from("order_items")
          .select("*")
          .eq("order_id", receipt.order_id);
        if (le) throw le;
        const rows = (lines as Item[])
          .map(
            (l) =>
              `<li>${l.quantity} × ${esc(l.product_name)} · ${esc(l.model)} · ${esc(l.size)} · ${esc(l.color)} — ${money(l.quantity * l.unit_price_cents)}</li>`,
          )
          .join("");
        const { error: me } = await new Resend(
          process.env.RESEND_API_KEY,
        ).emails.send(
          {
            from: process.env.BOX004_EMAIL_FROM,
            to: process.env.BOX004_ORDER_EMAIL || "santiago@box004.com",
            subject: `Nuevo pedido ${receipt.order_number} · Box 004`,
            html: `<h1>${esc(receipt.order_number)}</h1><p>${esc(input.firstName)} ${esc(input.lastName)}</p><p>${esc(input.email)} · ${esc(input.phone)}</p><ul>${rows}</ul><p>Total: ${money(receipt.total_cents)}</p><p>${esc(input.notes)}</p>`,
          },
          { idempotencyKey: `box004-${receipt.order_id}` },
        );
        emailSent = !me;
      } catch {
        console.error("order_notification_failed");
      }
    }
    return Response.json(
      {
        orderNumber: receipt.order_number,
        totalCents: receipt.total_cents,
        emailSent,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error(
      e instanceof Error && e.message === "configuration_missing"
        ? "order_configuration_missing"
        : "order_create_failed",
    );
    return Response.json(
      {
        error:
          "No se pudo registrar el pedido. Puedes reintentarlo sin duplicarlo.",
      },
      { status: 503 },
    );
  }
}
