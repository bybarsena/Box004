"use client";
import { useState, type FormEvent } from "react";
import { getSupabase, errorMessage } from "@/lib/supabase";
import { money, number, statuses, type Order, type Item } from "@/lib/types";
export function OrderDetail({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const paid = Math.round(Number(f.get("paid")) * 100);
      if (!Number.isFinite(paid) || paid < 0 || paid > order.total_cents)
        throw new Error(
          "El importe pagado debe estar entre 0 y el total del pedido.",
        );
      const { error } = await getSupabase()
        .from("orders")
        .update({
          status: String(f.get("status")),
          admin_notes: String(f.get("notes")),
          paid_cents: paid,
        })
        .eq("id", order.id);
      if (error) throw error;
      setMessage("Cambios guardados.");
      onSaved();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="order-detail">
      <div className="section-heading">
        <h3>{number(order.sequence)}</h3>
        <button className="btn secondary" onClick={onClose}>
          Cerrar detalle
        </button>
      </div>
      <p>
        <strong>
          {order.first_name} {order.last_name}
        </strong>{" "}
        · {order.email || "Sin email"} · {order.phone || "Sin teléfono"}
      </p>
      <CustomerContact order={order} />
      <p className="muted">
        {new Date(order.created_at).toLocaleString("es-ES")} ·{" "}
        {order.source === "manual" ? "Registro manual" : "Pedido desde la web"}
      </p>
      {order.order_items.map((i) => (
        <p key={i.id}>
          {i.quantity} × {i.product_name} · {i.model} · {i.size} · {i.color}{" "}
          <strong>{money(i.quantity * i.unit_price_cents)}</strong>
        </p>
      ))}
      <p>
        Subtotal: {money(order.subtotal_cents)}
        {order.discount_code &&
          ` · ${order.discount_code}: −${money(order.discount_cents)}`}{" "}
        · <strong>Total: {money(order.total_cents)}</strong>
      </p>
      {order.notes && (
        <p className="notice">Notas del cliente: {order.notes}</p>
      )}
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            Estado
            <select name="status" defaultValue={order.status}>
              {Object.entries(statuses).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Importe ya cobrado (€)
            <input
              name="paid"
              required
              type="number"
              min="0"
              step="0.01"
              max={order.total_cents / 100}
              defaultValue={order.paid_cents / 100}
            />
          </label>
          <label className="field full">
            Notas internas
            <textarea
              name="notes"
              rows={3}
              maxLength={3000}
              defaultValue={order.admin_notes}
            />
          </label>
        </div>
        <div className="actions">
          <button className="btn" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
        {message && <p role="status">{message}</p>}
      </form>
    </article>
  );
}

export function CustomerContact({
  order,
  compact = false,
}: {
  order: Order;
  compact?: boolean;
}) {
  const rawPhone = (order.phone || "").trim();
  const digits = rawPhone.replace(/\D/g, "");
  const internationalPhone = rawPhone.startsWith("+")
    ? digits
    : rawPhone.startsWith("00")
      ? digits.slice(2)
      : /^[6789]\d{8}$/.test(digits)
        ? `34${digits}`
        : "";
  const whatsappPhone = /^[1-9]\d{7,14}$/.test(internationalPhone)
    ? internationalPhone
    : "";
  const email = (order.email || "").trim();
  const message = `Hola ${order.first_name}, te contactamos de Box 004 Santiago sobre tu pedido ${number(order.sequence)}.`;
  const subject = `Box 004 Santiago · Pedido ${number(order.sequence)}`;
  return (
    <div>
      {!compact && <h4>Contactar con el cliente</h4>}
      <div
        className={compact ? "contact-actions" : "actions"}
        role="group"
        aria-label="Contactar con el cliente"
      >
        {whatsappPhone && (
          <a
            className="btn"
            href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
        )}
        {digits && (
          <a
            className="btn secondary"
            href={`tel:${internationalPhone ? "+" + internationalPhone : digits}`}
          >
            Llamar
          </a>
        )}
        {email && (
          <a
            className="btn secondary"
            href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}
          >
            Enviar correo
          </a>
        )}
      </div>
      {!compact &&
        (!digits && !email ? (
          <p className="muted">
            Este pedido no tiene teléfono ni correo de contacto.
          </p>
        ) : (
          <p className="muted">
            WhatsApp y correo abren un mensaje con la referencia del pedido para
            que lo revises y envíes.
          </p>
        ))}
    </div>
  );
}
