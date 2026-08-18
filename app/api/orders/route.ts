import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { z } from "zod";

const lineSchema = z.object({
  productId: z.string().uuid(), variantId: z.string().uuid(), productName: z.string().max(160),
  model: z.string().max(100), size: z.string().max(40), color: z.string().max(80),
  quantity: z.number().int().min(1).max(20), unitPriceCents: z.number().int().nonnegative().nullable(),
});
const orderSchema = z.object({
  firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(120),
  email: z.union([z.literal(""), z.string().email().max(160)]), phone: z.string().max(40), notes: z.string().max(500),
  lines: z.array(lineSchema).min(1).max(20),
});
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);

export async function POST(request: Request) {
  try {
    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Revisa los datos del pedido." }, { status: 400 });
    const input = parsed.data;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://sqkhysngsxiwadqzztwd.supabase.co";
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ScyAoEBV0FUW8VFaA72xzg_kdhd6udg";
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc("create_order", {
      p_customer: { first_name: input.firstName, last_name: input.lastName, email: input.email || null, phone: input.phone || null, notes: input.notes || null },
      p_lines: input.lines.map((line) => ({ product_id: line.productId, variant_id: line.variantId, quantity: line.quantity })),
    });
    if (error) throw new Error(error.message);
    const order = Array.isArray(data) ? data[0] : data;

    let emailSent = false;
    if (process.env.RESEND_API_KEY && process.env.BOX004_ORDER_EMAIL && process.env.BOX004_EMAIL_FROM) {
      const rows = input.lines.map((line) => `<li><strong>${line.quantity} × ${escapeHtml(line.productName)}</strong> — ${escapeHtml(line.model)}, ${escapeHtml(line.size)}, ${escapeHtml(line.color)}</li>`).join("");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error: emailError } = await resend.emails.send({
        from: process.env.BOX004_EMAIL_FROM, to: process.env.BOX004_ORDER_EMAIL,
        subject: `Nuevo pedido ${order.order_number} · ${input.firstName} ${input.lastName}`,
        html: `<div style="font-family:Arial,sans-serif"><h1>Nuevo pedido ${escapeHtml(order.order_number)}</h1><p><strong>Cliente:</strong> ${escapeHtml(input.firstName)} ${escapeHtml(input.lastName)}</p><p><strong>Email:</strong> ${escapeHtml(input.email || "—")} · <strong>Teléfono:</strong> ${escapeHtml(input.phone || "—")}</p><ul>${rows}</ul><p><strong>Notas:</strong> ${escapeHtml(input.notes || "—")}</p></div>`,
      }, { headers: { "Idempotency-Key": `box004-order-${order.order_id}` } });
      emailSent = !emailError;
    }
    return Response.json({ orderId: order.order_id, orderNumber: order.order_number, emailSent }, { status: 201 });
  } catch (error) {
    console.error("order_create_failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "No se pudo registrar el pedido. Inténtalo de nuevo." }, { status: 500 });
  }
}
