"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, configured, errorMessage } from "@/lib/supabase";
import {
  money,
  number,
  statuses,
  type Product,
  type Order,
  type Discount,
  type ProductType,
} from "@/lib/types";
import { ProductionExport } from "./production-export";
import { csvText } from "@/lib/csv";
import { CatalogImage } from "./catalog-image";
import { OrderDetail, CustomerContact } from "./order-detail";
import { ProductTypes } from "./product-types";
import { ProductEditor } from "./product-editor";
import { productImage } from "@/lib/catalog";
import { isArchived, outstanding, stageLabel } from "@/lib/order-workflow";
import { OrderFlow } from "./order-flow";
import { DiscountEditor } from "./discount-editor";
type Tab = "orders" | "archive" | "manual" | "products" | "discounts" | "types";
export function AdminDashboard() {
  const [session, setSession] = useState<Session | null>(null),
    [initializing, setInitializing] = useState(configured),
    [authorized, setAuthorized] = useState(false),
    [exporting, setExporting] = useState(false),
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
    [productTypes, setProductTypes] = useState<ProductType[]>([]),
    [discounts, setDiscounts] = useState<Discount[]>([]),
    [editingDiscount, setEditingDiscount] = useState<Discount | null>(null),
    [tab, setTab] = useState<Tab>("orders"),
    [editing, setEditing] = useState<string | null | undefined>(),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [productSearch, setProductSearch] = useState(""),
    [paymentTarget, setPaymentTarget] = useState<Order | null>(null),
    [undo, setUndo] = useState<{
      id: string;
      status: string;
      paid_cents: number;
      archived_at: string | null;
    } | null>(null);
  useEffect(() => {
    if (!configured) return;
    let live = true;
    const db = getSupabase();

    db.auth
      .getSession()
      .then(({ data, error }) => {
        if (live) {
          if (
            new URLSearchParams(window.location.search).get("setPassword") ===
            "1"
          )
            setReset(true);
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
      const [o, p, d, t] = await Promise.all([
        all<Order>("orders", "*,order_items(*)", "created_at"),
        all<Product>(
          "products",
          "*,product_variants(*),product_color_images(*)",
          "created_at",
        ),
        all<Discount>("discounts", "*", "code"),
        all<ProductType>("product_types", "*", "name"),
      ]);
      setOrders(o);
      setProducts(p);
      setDiscounts(d);
      setProductTypes(t.toSorted((a, b) => a.name.localeCompare(b.name, "es")));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const refresh = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        (tab === "orders" || tab === "archive")
      )
        void load();
    }, 45000);
    return () => {
      clearTimeout(initial);
      clearInterval(refresh);
    };
  }, [load, tab]);
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
  const current = orders.filter((o) => !isArchived(o)),
    archived = orders.filter(isArchived),
    detail = orders.find((o) => o.id === selected);
  const visible = (tab === "archive" ? archived : current).filter(
    (o) =>
      (!filter || o.status === filter) &&
      `${number(o.sequence)} ${o.first_name} ${o.last_name} ${o.email || ""} ${o.phone || ""} ${o.order_items.map((i) => `${i.product_name} ${i.color} ${i.size}`).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function change(
    o: Order,
    patch: Partial<Pick<Order, "status" | "paid_cents" | "archived_at">>,
  ) {
    const { data, error } = await getSupabase()
      .from("orders")
      .update(patch)
      .eq("id", o.id)
      .select("id")
      .single();
    if (error) throw error;
    if (!data) throw new Error("No se pudo guardar el pedido.");
    setUndo({
      id: o.id,
      status: o.status,
      paid_cents: o.paid_cents,
      archived_at: o.archived_at,
    });
    await load();
    setSuccess(
      patch.archived_at
        ? "Pago registrado. Pedido guardado en Realizados."
        : "Pedido actualizado.",
    );
  }
  function exportCsv() {
    const rows = [
      [
        "Pedido",
        "Fecha",
        "Cliente",
        "Teléfono",
        "Email",
        "Estado",
        "Archivo",
        "Subtotal EUR",
        "Descuento EUR",
        "Total EUR",
        "Pagado EUR",
        "Pendiente EUR",
        "Prendas",
      ],
      ...visible.map((o) => [
        number(o.sequence),
        new Date(o.created_at).toLocaleString("es-ES"),
        `${o.first_name} ${o.last_name}`,
        o.phone || "",
        o.email || "",
        stageLabel[o.status],
        isArchived(o) ? "Realizados" : "En curso",
        (o.subtotal_cents / 100).toFixed(2),
        (o.discount_cents / 100).toFixed(2),
        (o.total_cents / 100).toFixed(2),
        (o.paid_cents / 100).toFixed(2),
        (outstanding(o) / 100).toFixed(2),
        o.order_items
          .map(
            (i) =>
              `${i.quantity} × ${i.product_name} · ${i.model} · ${i.size} · ${i.color}`,
          )
          .join(" | "),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csvText(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `box004-${tab === "archive" ? "realizados" : "en-curso"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function navigate(next: Tab) {
    setTab(next);
    setFilter("");
    setSelected(null);
    setEditing(undefined);
    setError("");
    setSuccess("");
  }
  return (
    <div className="admin-grid">
      {exporting && authorized && (
        <ProductionExport
          orders={orders}
          visible={visible}
          products={products}
          onClose={() => setExporting(false)}
        />
      )}
      <aside className="admin-sidebar panel">
        <div className="eyebrow">Panel de gestión</div>
        <h2 className="admin-title">Todo bajo control.</h2>
        <p className="account-email">{session.user.email}</p>
        <nav className="tabs" aria-label="Administración">
          {(
            [
              ["orders", "↗", "En curso", current.length],
              ["archive", "✓", "Realizados", archived.length],
              ["manual", "＋", "Nuevo pedido", null],
              ["products", "◇", "Prendas", products.length],
              ["discounts", "%", "Descuentos", discounts.length],
              ["types", "▦", "Tipos de prenda", productTypes.length],
            ] as [Tab, string, string, number | null][]
          ).map(([id, icon, label, count]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {icon}
              </span>
              {label}
              {count !== null && <span className="nav-count">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer" className="text-button">
            Ver catálogo ↗
          </a>
          <button
            className="text-button"
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
          <div className="notice success" role="status">
            {success}
            {undo && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const previous = undo;
                    const { error } = await getSupabase()
                      .from("orders")
                      .update({
                        status: previous.status,
                        paid_cents: previous.paid_cents,
                        archived_at: previous.archived_at,
                      })
                      .eq("id", previous.id)
                      .select("id")
                      .single();
                    if (error) throw error;
                    setUndo(null);
                    await load();
                    setSuccess("Último cambio deshecho.");
                  })
                }
              >
                Deshacer último cambio
              </button>
            )}
          </div>
        )}
        {loading && (
          <p className="refresh-status" role="status">
            Actualizando…
          </p>
        )}
        {!authorized ? (
          <section className="panel">Comprobando permisos…</section>
        ) : (
          <>
            {(tab === "orders" || tab === "archive") && (
              <>
                <div className="section-heading admin-page-heading">
                  <div>
                    <div className="eyebrow">Pedidos · Box 004</div>
                    <h1>
                      {tab === "archive"
                        ? "Pedidos realizados"
                        : "Pedidos en curso"}
                    </h1>
                    <p className="muted">
                      {tab === "archive"
                        ? "Pagados y cancelados, con todo su historial."
                        : "Del primer pedido a la recogida, sin perderte entre pantallas."}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      className="btn secondary"
                      disabled={loading}
                      onClick={() => void load()}
                    >
                      ↻ Actualizar
                    </button>
                    <button className="btn" onClick={() => navigate("manual")}>
                      ＋ Nuevo pedido
                    </button>
                  </div>
                </div>
                <div className="stats-grid">
                  {(tab === "archive"
                    ? [
                        [
                          "Archivados",
                          archived
                            .filter((o) => o.status !== "cancelled")
                            .length.toString(),
                          "✓",
                        ],
                        [
                          "Cobrado",
                          money(
                            archived
                              .filter((o) => o.status !== "cancelled")
                              .reduce((s, o) => s + o.paid_cents, 0),
                          ),
                          "€",
                        ],
                      ]
                    : [
                        [
                          "Nuevos",
                          current
                            .filter((o) => o.status === "pending")
                            .length.toString(),
                          "↗",
                        ],
                        [
                          "En preparación",
                          current
                            .filter((o) => o.status === "ordered")
                            .length.toString(),
                          "◷",
                        ],
                        [
                          "En el centro",
                          current
                            .filter((o) => o.status === "ready")
                            .length.toString(),
                          "⌂",
                        ],
                        [
                          "Por cobrar",
                          money(
                            current.reduce((s, o) => s + outstanding(o), 0),
                          ),
                          "€",
                        ],
                      ]
                  ).map(([label, value, icon]) => (
                    <section key={label} className="panel stat">
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <i aria-hidden="true">{icon}</i>
                    </section>
                  ))}
                </div>
                <section className="panel production-banner">
                  <div>
                    <div className="eyebrow">Para el taller</div>
                    <h3>De los pedidos a producción.</h3>
                    <p>
                      Prepara un lote con las unidades por prenda, color y
                      talla.
                    </p>
                  </div>
                  <button
                    className="btn"
                    disabled={
                      loading || !orders.some((o) => o.status !== "cancelled")
                    }
                    onClick={() => setExporting(true)}
                  >
                    Exportar PDF / Excel ↓
                  </button>
                </section>
                <div className="panel order-toolbar">
                  <label className="search-field">
                    <span aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      aria-label="Buscar pedidos"
                      placeholder="Busca cliente, pedido, prenda o talla…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <button
                    className="btn secondary"
                    disabled={!visible.length}
                    onClick={exportCsv}
                  >
                    Exportar CSV ↓
                  </button>
                  <div
                    className="stage-tabs"
                    role="group"
                    aria-label="Filtrar estado"
                  >
                    {[
                      ["", "Todos"],
                      ...(tab === "archive"
                        ? [["cancelled", "Cancelados"]]
                        : [
                            ["pending", "Nuevos"],
                            ["ordered", "En preparación"],
                            ["ready", "En el centro"],
                            ["delivered", "Entregados"],
                          ]),
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={filter === id ? "active" : ""}
                        aria-pressed={filter === id}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {detail && (
                  <OrderDetail
                    key={detail.id}
                    order={detail}
                    onClose={() => setSelected(null)}
                    onSaved={() => void load()}
                  />
                )}
                <div className="order-cards">
                  {visible.map((o) => (
                    <article
                      className={`order-card stage-${o.status}`}
                      key={o.id}
                    >
                      <div className="order-card-top">
                        <div>
                          <span className="order-reference">
                            {number(o.sequence)}{" "}
                            <small>
                              ·{" "}
                              {new Date(o.created_at).toLocaleDateString(
                                "es-ES",
                                { day: "numeric", month: "short" },
                              )}
                            </small>
                          </span>
                          <h3>
                            {o.first_name} {o.last_name}
                          </h3>
                        </div>
                        <span className={`badge status-${o.status}`}>
                          {stageLabel[o.status]}
                        </span>
                      </div>
                      <div className="order-card-items">
                        {o.order_items.map((i) => {
                          const p = products.find(
                            (p) =>
                              p.product_variants.some(
                                (v) => v.id === i.variant_id,
                              ) || p.name === i.product_name,
                          );
                          const image = p ? productImage(p, i.color) : "";
                          return (
                            <div className="order-card-item" key={i.id}>
                              {image ? (
                                <CatalogImage
                                  src={image}
                                  alt=""
                                  fallback={p ? productImage(p) : undefined}
                                />
                              ) : (
                                <span className="item-placeholder">004</span>
                              )}
                              <div>
                                <strong>
                                  {i.quantity} × {i.product_name}
                                </strong>
                                <small>
                                  {i.model} · <b>{i.size}</b> · {i.color}
                                </small>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {o.notes && <p className="customer-note">✎ {o.notes}</p>}
                      <div className="order-card-money">
                        <span>
                          Total <strong>{money(o.total_cents)}</strong>
                        </span>
                        <span
                          className={
                            outstanding(o) === 0 ? "paid-label" : "muted"
                          }
                        >
                          {outstanding(o) === 0
                            ? "✓ Pagado"
                            : o.paid_cents > 0
                              ? `${money(o.paid_cents)} pagados · Faltan ${money(outstanding(o))}`
                              : `Pendiente de pago`}
                        </span>
                      </div>
                      <div className="order-card-actions">
                        {!isArchived(o) && (
                          <>
                            {o.status === "pending" && (
                              <button
                                className="btn secondary"
                                disabled={busy}
                                onClick={() =>
                                  void run(() =>
                                    change(o, { status: "ordered" }),
                                  )
                                }
                              >
                                Iniciar preparación →
                              </button>
                            )}
                            {o.status === "ordered" && (
                              <button
                                className="btn secondary"
                                disabled={busy}
                                onClick={() =>
                                  void run(() => change(o, { status: "ready" }))
                                }
                              >
                                Ya está en el centro →
                              </button>
                            )}
                            <button
                              className="btn"
                              disabled={busy}
                              onClick={() => setPaymentTarget(o)}
                            >
                              {outstanding(o) > 0
                                ? "Marcar pagado"
                                : "Archivar pagado"}{" "}
                              ✓
                            </button>
                          </>
                        )}
                        {isArchived(o) && (
                          <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                change(o, {
                                  archived_at: null,
                                  status:
                                    o.status === "cancelled"
                                      ? "pending"
                                      : o.status,
                                }),
                              )
                            }
                          >
                            Volver a en curso
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(selected === o.id ? null : o.id);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Ver detalle / editar
                        </button>
                      </div>
                      <CustomerContact order={o} compact />
                    </article>
                  ))}
                </div>
                {!visible.length && (
                  <div className="panel empty">
                    <span className="empty-icon">✓</span>
                    <h3>{search ? "Sin coincidencias" : "Todo al día."}</h3>
                    <p>
                      {search
                        ? "Prueba otro nombre, prenda o referencia."
                        : tab === "archive"
                          ? "Los pedidos pagados aparecerán aquí."
                          : "Aquí aparecerán los pedidos que hagan los clientes."}
                    </p>
                  </div>
                )}
              </>
            )}
            {tab === "manual" && (
              <OrderFlow
                manual
                onSaved={() => {
                  void load();
                  setSuccess("Pedido creado. Ya aparece en En curso.");
                }}
              />
            )}
            {tab === "products" &&
              (editing !== undefined ? (
                <ProductEditor
                  key={editing || "new"}
                  product={products.find((p) => p.id === editing) || null}
                  productTypes={productTypes}
                  onTypesChanged={() => void load()}
                  onClose={() => setEditing(undefined)}
                  onSaved={() => void load()}
                />
              ) : (
                <>
                  <div className="section-heading admin-page-heading">
                    <div>
                      <div className="eyebrow">Catálogo</div>
                      <h1>Prendas y fotografías</h1>
                      <p className="muted">
                        Publica, prepara un borrador o cambia tallas y colores.
                      </p>
                    </div>
                    <button className="btn" onClick={() => setEditing(null)}>
                      ＋ Nueva prenda
                    </button>
                  </div>
                  <label className="search-field panel">
                    <span>⌕</span>
                    <input
                      type="search"
                      aria-label="Buscar prendas"
                      placeholder="Buscar prenda…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </label>
                  <div className="admin-product-grid">
                    {products
                      .filter((p) =>
                        p.name
                          .toLowerCase()
                          .includes(productSearch.toLowerCase()),
                      )
                      .map((p) => (
                        <article className="panel admin-product" key={p.id}>
                          <div className="admin-product-image">
                            {productImage(p) ? (
                              <img src={productImage(p)} alt={p.name} />
                            ) : (
                              <span>004</span>
                            )}
                            <span
                              className={`badge ${p.active ? "on" : "off"}`}
                            >
                              {p.active ? "Publicada" : "Borrador"}
                            </span>
                          </div>
                          <h3>{p.name}</h3>
                          <p>
                            <b>{money(p.price_cents)}</b>{" "}
                            <span className="muted">
                              ·{" "}
                              {
                                p.product_variants.filter((v) => v.active)
                                  .length
                              }{" "}
                              combinaciones
                            </span>
                          </p>
                          <div className="actions">
                            <button
                              className="btn secondary"
                              onClick={() => setEditing(p.id)}
                            >
                              Editar prenda
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  if (
                                    !p.active &&
                                    !p.product_variants.some((v) => v.active)
                                  )
                                    throw new Error(
                                      "Añade tallas y colores antes de publicar.",
                                    );
                                  const { error } = await getSupabase()
                                    .from("products")
                                    .update({ active: !p.active })
                                    .eq("id", p.id)
                                    .select("id")
                                    .single();
                                  if (error) throw error;
                                  await load();
                                  setSuccess(
                                    p.active
                                      ? "Prenda retirada del catálogo público."
                                      : "Prenda publicada.",
                                  );
                                })
                              }
                            >
                              {p.active ? "Ocultar" : "Publicar"}
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                </>
              ))}
            {tab === "types" && (
              <ProductTypes
                types={productTypes}
                products={products}
                onChanged={() => void load()}
              />
            )}
            {tab === "discounts" && (
              <>
                <div className="section-heading admin-page-heading">
                  <div>
                    <div className="eyebrow">Promociones</div>
                    <h1>Códigos de descuento</h1>
                    <p className="muted">
                      Elige el porcentaje y las prendas que quieras incluir.
                    </p>
                  </div>
                  <button
                    className="btn"
                    onClick={() => setEditingDiscount(null)}
                  >
                    ＋ Nuevo código
                  </button>
                </div>
                <div className="discount-management">
                  <section className="panel">
                    <DiscountEditor
                      key={editingDiscount?.code || "new"}
                      discount={editingDiscount}
                      products={products}
                      onCancel={() => setEditingDiscount(null)}
                      onSaved={async () => {
                        setEditingDiscount(null);
                        await load();
                        setSuccess(
                          "Descuento guardado para los nuevos pedidos.",
                        );
                      }}
                    />
                  </section>
                  <section className="discount-list">
                    {discounts.map((d) => (
                      <article className="panel coupon-card" key={d.code}>
                        <div className="section-heading">
                          <span className="coupon-percent">
                            {d.percent}
                            <small>%</small>
                          </span>
                          <span className={`badge ${d.active ? "on" : "off"}`}>
                            {d.active ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                        <h3>{d.code}</h3>
                        <p className="muted">
                          {d.expires_at
                            ? `Hasta ${new Date(d.expires_at).toLocaleDateString("es-ES")}`
                            : "Sin caducidad"}
                        </p>
                        <p>
                          {d.eligible_product_ids === null
                            ? "Todo el catálogo"
                            : d.eligible_product_ids
                                .map(
                                  (id) =>
                                    products.find((p) => p.id === id)?.name ||
                                    "Prenda no disponible",
                                )
                                .join(" · ") || "Ninguna prenda"}
                        </p>
                        <div className="actions">
                          <button
                            className="btn secondary"
                            onClick={() => setEditingDiscount(d)}
                          >
                            Editar código y prendas
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const { error } = await getSupabase()
                                  .from("discounts")
                                  .update({ active: !d.active })
                                  .eq("code", d.code)
                                  .select("code")
                                  .single();
                                if (error) throw error;
                                await load();
                              })
                            }
                          >
                            {d.active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </section>
                </div>
              </>
            )}
          </>
        )}
      </div>
      {paymentTarget && (
        <PaymentConfirmation
          order={paymentTarget}
          busy={busy}
          onClose={() => setPaymentTarget(null)}
          onConfirm={() =>
            void run(async () => {
              await change(paymentTarget, {
                paid_cents: paymentTarget.total_cents,
                archived_at: new Date().toISOString(),
              });
              setPaymentTarget(null);
            })
          }
        />
      )}
    </div>
  );
}
function PaymentConfirmation({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: Order;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="payment-dialog"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className="eyebrow">Confirmar cobro</div>
      <h2>{money(outstanding(order))}</h2>
      <p>
        ¿Has recibido el pago de{" "}
        <b>
          {order.first_name} {order.last_name}
        </b>{" "}
        por el pedido {number(order.sequence)}?
      </p>
      <p className="muted">
        El pedido pasará a Realizados. Podrás consultarlo y deshacer el cambio.
      </p>
      <div className="actions">
        <button className="btn" disabled={busy} onClick={onConfirm}>
          {busy ? "Guardando…" : "Sí, pago recibido"}
        </button>
        <button className="btn secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </dialog>
  );
}
