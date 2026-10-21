"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, configured, errorMessage } from "@/lib/supabase";
import {
  money,
  number,
  statuses,
  type Product,
  type Order,
  type Discount,
} from "@/lib/types";
import { csvText } from "@/lib/csv";
import { ProductEditor } from "./product-editor";
import { OrderFlow } from "./order-flow";
import { DiscountEditor } from "./discount-editor";
type Tab = "summary" | "orders" | "manual" | "products" | "discounts";
export function AdminDashboard() {
  const [session, setSession] = useState<Session | null>(null),
    [initializing, setInitializing] = useState(true),
    [authorized, setAuthorized] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [email, setEmail] = useState("santiago@box004.com"),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [reset, setReset] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [discounts, setDiscounts] = useState<Discount[]>([]),
    [editingDiscount, setEditingDiscount] = useState<Discount | null>(null),
    [tab, setTab] = useState<Tab>("summary"),
    [editing, setEditing] = useState<string | null | undefined>(),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("");
  useEffect(() => {
    if (!configured) {
      setInitializing(false);
      return;
    }
    let live = true;
    const db = getSupabase();
    if (new URLSearchParams(window.location.search).get("setPassword") === "1")
      setReset(true);
    db.auth
      .getSession()
      .then(({ data, error }) => {
        if (live) {
          setSession(data.session);
          if (error) setError(errorMessage(error));
          setInitializing(false);
        }
      })
      .catch((e) => {
        if (live) {
          setError(errorMessage(e));
          setInitializing(false);
        }
      });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event, next) => {
      if (live) {
        setSession(next);
        if (!next) setAuthorized(false);
        if (event === "PASSWORD_RECOVERY") setReset(true);
      }
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const db = getSupabase();
      const { data: member, error } = await db
        .from("admin_users")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!member) {
        setAuthorized(false);
        throw new Error(
          "Esta cuenta no tiene permisos de administración de Box 004.",
        );
      }
      setAuthorized(true);
      async function all<T>(table: string, select: string, sort: string) {
        const result: T[] = [];
        for (let i = 0; ; i += 500) {
          const { data, error } = await db
            .from(table)
            .select(select)
            .order(sort, { ascending: false })
            .range(i, i + 499);
          if (error) throw error;
          result.push(...(data as T[]));
          if (data.length < 500) break;
        }
        return result;
      }
      const [o, p, d] = await Promise.all([
        all<Order>("orders", "*,order_items(*)", "created_at"),
        all<Product>(
          "products",
          "*,product_variants(*),product_color_images(*)",
          "created_at",
        ),
        all<Discount>("discounts", "*", "code"),
      ]);
      setOrders(o);
      setProducts(p);
      setDiscounts(d);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function login(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const db = getSupabase();
      if (reset) {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        setReset(false);
        setPassword("");
        window.history.replaceState(null, "", "/admin");
        setSuccess("Contraseña guardada.");
      } else {
        const { error } = await db.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          if (error.code === "invalid_credentials")
            throw new Error("El correo o la contraseña no son correctos.");
          throw error;
        }
        setPassword("");
      }
    });
  }
  function recover() {
    void run(async () => {
      const { error } = await getSupabase().auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/admin?setPassword=1` },
      );
      if (error) throw error;
      setSuccess(
        "Si la cuenta está registrada, recibirás un correo para establecer tu contraseña.",
      );
    });
  }
  const filtered = orders.filter(
    (o) =>
      (!filter || o.status === filter) &&
      `${number(o.sequence)} ${o.first_name} ${o.last_name} ${o.email} ${o.phone}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function exportCsv() {
    const rows = [
      [
        "Pedido",
        "Fecha",
        "Nombre",
        "Apellidos",
        "Email",
        "Teléfono",
        "Estado",
        "Origen",
        "Prenda",
        "Modelo",
        "Talla",
        "Color",
        "Cantidad",
        "Precio unidad EUR",
        "Total línea EUR",
        "Total pedido EUR (repetido)",
        "Pagado EUR (repetido)",
        "Notas cliente",
        "Notas internas",
      ],
      ...filtered.flatMap((o) =>
        o.order_items.map((i) => [
          number(o.sequence),
          new Date(o.created_at).toLocaleString("es-ES"),
          o.first_name,
          o.last_name,
          o.email || "",
          o.phone || "",
          statuses[o.status],
          o.source,
          i.product_name,
          i.model,
          i.size,
          i.color,
          i.quantity,
          (i.unit_price_cents / 100).toFixed(2),
          ((i.quantity * i.unit_price_cents) / 100).toFixed(2),
          (o.total_cents / 100).toFixed(2),
          (o.paid_cents / 100).toFixed(2),
          o.notes,
          o.admin_notes,
        ]),
      ),
    ];
    const url = URL.createObjectURL(
        new Blob(["\uFEFF" + csvText(rows)], {
          type: "text/csv;charset=utf-8",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `box004-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!configured)
    return (
      <section className="panel login-panel">
        <div className="eyebrow">Administración · Box 004</div>
        <h2>Panel preparado para conectar</h2>
        <p>
          Falta conectar la base de datos del nuevo proyecto para activar el
          acceso y los pedidos.
        </p>
        <p className="muted">Administrador previsto: santiago@box004.com</p>
      </section>
    );
  if (initializing) return <p role="status">Comprobando sesión…</p>;
  if (!session || reset)
    return (
      <section className="panel login-panel">
        <div className="eyebrow">Acceso privado</div>
        <h2>Panel Box 004</h2>
        <p>
          {reset
            ? "Establece una contraseña de al menos 12 caracteres."
            : "Inicia sesión con una cuenta autorizada."}
        </p>
        <form onSubmit={login} className="stack">
          {!reset && (
            <label className="field">
              Email
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          <label className="field">
            {reset ? "Nueva contraseña" : "Contraseña"}
            <span className="password-field">
              <input
                required
                type={show ? "text" : "password"}
                minLength={reset ? 12 : undefined}
                autoComplete={reset ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                onClick={() => setShow((v) => !v)}
              >
                {show ? "Ocultar" : "Ver"}
              </button>
            </span>
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="notice success" role="status">
              {success}
            </p>
          )}
          <button className="btn" disabled={busy}>
            {busy ? "Comprobando…" : reset ? "Guardar contraseña" : "Entrar"}
          </button>
        </form>
        {!reset && (
          <button
            className="text-button"
            onClick={recover}
            disabled={busy || !email}
          >
            He olvidado mi contraseña
          </button>
        )}
      </section>
    );
  const active = orders.filter((o) => o.status !== "cancelled"),
    pending = active.filter((o) => o.status !== "delivered"),
    detail = orders.find((o) => o.id === selected);
  return (
    <div className="admin-grid">
      <aside className="panel">
        <div className="eyebrow">Administración</div>
        <h2 className="admin-title">Box 004</h2>
        <p className="account-email">{session.user.email}</p>
        <nav className="tabs" aria-label="Administración">
          {(
            [
              ["summary", "Resumen"],
              ["orders", "Pedidos"],
              ["manual", "Nuevo pedido manual"],
              ["products", "Camisetas y fotos"],
              ["discounts", "Descuentos"],
            ] as [Tab, string][]
          ).map(([id, name]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setEditing(undefined);
                setSelected(null);
              }}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className="actions">
          <button
            className="btn secondary"
            onClick={() =>
              void run(async () => {
                const { error } = await getSupabase().auth.signOut();
                if (error) throw error;
                setOrders([]);
                setProducts([]);
                setDiscounts([]);
              })
            }
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="admin-content">
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button className="text-button" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        )}
        {success && (
          <p className="notice success" role="status">
            {success}
          </p>
        )}
        {loading && <p role="status">Actualizando datos…</p>}
        {!authorized ? (
          <section className="panel">
            Comprobando permisos de administración.
          </section>
        ) : (
          <>
            {tab === "summary" && (
              <>
                <div className="section-heading">
                  <h2>Vista general</h2>
                  <button
                    className="btn secondary"
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    Actualizar
                  </button>
                </div>
                <div className="stats-grid">
                  {[
                    ["Pedidos pendientes", String(pending.length)],
                    [
                      "Importe de pedidos",
                      money(active.reduce((s, o) => s + o.total_cents, 0)),
                    ],
                    [
                      "Cobrado",
                      money(active.reduce((s, o) => s + o.paid_cents, 0)),
                    ],
                    [
                      "Pendiente de cobro",
                      money(
                        active.reduce(
                          (s, o) =>
                            s + Math.max(0, o.total_cents - o.paid_cents),
                          0,
                        ),
                      ),
                    ],
                  ].map(([label, value]) => (
                    <section className="panel stat" key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </section>
                  ))}
                </div>
                <section className="panel">
                  <h3>Últimos pedidos</h3>
                  {orders.slice(0, 5).map((o) => (
                    <button
                      key={o.id}
                      className="order-summary"
                      onClick={() => {
                        setSelected(o.id);
                        setTab("orders");
                      }}
                    >
                      <span>
                        <strong>
                          {number(o.sequence)} · {o.first_name} {o.last_name}
                        </strong>
                        <small>{statuses[o.status]}</small>
                      </span>
                      <strong>{money(o.total_cents)}</strong>
                    </button>
                  ))}
                  {!orders.length && (
                    <p className="empty">
                      Todavía no hay pedidos. Registra los pendientes desde
                      «Nuevo pedido manual».
                    </p>
                  )}
                </section>
              </>
            )}
            {tab === "orders" && (
              <section className="panel">
                <div className="section-heading">
                  <h2>Pedidos</h2>
                  <button
                    className="btn secondary"
                    disabled={!filtered.length}
                    onClick={exportCsv}
                  >
                    Exportar CSV
                  </button>
                </div>
                <div className="form-grid">
                  <label className="field">
                    Buscar cliente o pedido
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Estado
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {Object.entries(statuses).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="muted">
                  {filtered.length} pedidos. En el CSV, el total del pedido se
                  repite por prenda; no sumes esa columna.
                </p>
                {detail && (
                  <OrderDetail
                    key={detail.id}
                    order={detail}
                    onClose={() => setSelected(null)}
                    onSaved={() => void load()}
                  />
                )}
                <div className="table-wrap">
                  <table className="orders-table" role="table">
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Cliente</th>
                        <th>Estado</th>
                        <th>Total / pagado</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((o) => (
                        <tr key={o.id}>
                          <td data-label="Pedido" role="cell">
                            {number(o.sequence)}
                            <small className="table-small">
                              {new Date(o.created_at).toLocaleDateString(
                                "es-ES",
                              )}
                            </small>
                          </td>
                          <td data-label="Cliente" role="cell">
                            {o.first_name} {o.last_name}
                            <small className="table-small">
                              {o.phone || o.email}
                            </small>
                          </td>
                          <td data-label="Estado" role="cell">
                            <span className={`badge status-${o.status}`}>
                              {statuses[o.status]}
                            </span>
                          </td>
                          <td data-label="Total / pagado" role="cell">
                            {money(o.total_cents)}
                            <small className="table-small">
                              {money(o.paid_cents)} pagado
                            </small>
                          </td>
                          <td data-label="Detalle" role="cell">
                            <button
                              className="btn secondary"
                              onClick={() => setSelected(o.id)}
                            >
                              Abrir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <p className="empty">No hay pedidos con estos filtros.</p>
                )}
              </section>
            )}
            {tab === "manual" && (
              <OrderFlow manual onSaved={() => void load()} />
            )}
            {tab === "products" &&
              (editing !== undefined ? (
                <ProductEditor
                  key={editing || "new"}
                  product={products.find((p) => p.id === editing) || null}
                  onClose={() => setEditing(undefined)}
                  onSaved={() => void load()}
                />
              ) : (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Camisetas y fotos</h2>
                    <button className="btn" onClick={() => setEditing(null)}>
                      Nueva prenda
                    </button>
                  </div>
                  {products.map((p) => (
                    <article className="catalog-row" key={p.id}>
                      {p.product_color_images[0] ? (
                        <img
                          src={p.product_color_images[0].image_url}
                          alt={p.name}
                        />
                      ) : (
                        <div className="image-placeholder">004</div>
                      )}
                      <div>
                        <h3>{p.name}</h3>
                        <p>
                          {money(p.price_cents)} ·{" "}
                          {p.product_variants.filter((v) => v.active).length}{" "}
                          variantes
                        </p>
                        <span className={`badge ${p.active ? "on" : "off"}`}>
                          {p.active ? "Publicada" : "Borrador"}
                        </span>
                      </div>
                      <button
                        className="btn secondary"
                        onClick={() => setEditing(p.id)}
                      >
                        Editar
                      </button>
                    </article>
                  ))}
                  {!products.length && (
                    <p className="empty">
                      Crea la primera prenda y añade sus tallas, colores y
                      fotos.
                    </p>
                  )}
                </section>
              ))}
            {tab === "discounts" && (
              <section className="panel">
                <h2>Códigos de descuento</h2>
                <DiscountEditor
                  key={editingDiscount?.code || "new"}
                  discount={editingDiscount}
                  products={products}
                  onCancel={() => setEditingDiscount(null)}
                  onSaved={async () => {
                    setEditingDiscount(null);
                    await load();
                    setSuccess("Descuento guardado. Se aplicará a los nuevos pedidos.");
                  }}
                />
                <hr className="divider" />
                {discounts.map((d) => (
                  <div className="discount-row" key={d.code}>
                    <div>
                      <strong>
                        {d.code} · {d.percent}%
                      </strong>
                      <small className="table-small">
                        {d.expires_at
                          ? `Hasta ${new Date(d.expires_at).toLocaleDateString("es-ES")}`
                          : "Sin caducidad"}{" "}
                        · {d.active ? "Activo" : "Inactivo"}
                      </small>
                      <small className="table-small">
                        {d.eligible_product_ids === null ? "Todo el catálogo" : d.eligible_product_ids.map((id) => products.find((p) => p.id === id)?.name || "Prenda eliminada").join(" · ") || "Ninguna prenda"}
                      </small>
                    </div>
                    <button
                      className="btn secondary"
                      onClick={() => setEditingDiscount(d)}
                    >
                      Editar prendas y descuento
                    </button>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const { error } = await getSupabase()
                            .from("discounts")
                            .update({ active: !d.active })
                            .eq("code", d.code);
                          if (error) throw error;
                          await load();
                        })
                      }
                    >
                      {d.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
function OrderDetail({
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
      if (!Number.isFinite(paid) || paid < 0 || paid > 1000000000)
        throw new Error("Importe pagado no válido.");
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

function CustomerContact({ order }: { order: Order }) {
  const rawPhone = (order.phone || "").trim();
  const digits = rawPhone.replace(/\D/g, "");
  const internationalPhone = rawPhone.startsWith("+")
    ? digits
    : rawPhone.startsWith("00")
      ? digits.slice(2)
      : /^[6789]\d{8}$/.test(digits)
        ? `34${digits}`
        : "";
  const whatsappPhone = /^[1-9]\d{7,14}$/.test(internationalPhone) ? internationalPhone : "";
  const email = (order.email || "").trim();
  const message = `Hola ${order.first_name}, te contactamos de Box 004 Santiago sobre tu pedido ${number(order.sequence)}.`;
  const subject = `Box 004 Santiago · Pedido ${number(order.sequence)}`;
  return (
    <div>
      <h4>Contactar con el cliente</h4>
      <div className="actions" role="group" aria-label="Contactar con el cliente">
        {whatsappPhone && (
          <a className="btn" href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        )}
        {digits && (
          <a className="btn secondary" href={`tel:${internationalPhone ? "+" + internationalPhone : digits}`}>
            Llamar
          </a>
        )}
        {email && (
          <a className="btn secondary" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}>
            Enviar correo
          </a>
        )}
      </div>
      {!digits && !email ? (
        <p className="muted">Este pedido no tiene teléfono ni correo de contacto.</p>
      ) : (
        <p className="muted">WhatsApp y correo abren un mensaje con la referencia del pedido para que lo revises y envíes.</p>
      )}
    </div>
  );
}
