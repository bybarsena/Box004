"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Brand } from "./brand";
import { getSupabase, configured, errorMessage } from "@/lib/supabase";
import { money, type Product, type Variant } from "@/lib/types";
import {
  categories,
  categoryOf,
  productImage,
  swatch,
  type Category,
} from "@/lib/catalog";
type Line = {
  v: Variant;
  name: string;
  price: number;
  quantity: number;
  image: string;
};
type Discount = {
  code: string;
  percent: number;
  eligibleProductIds?: string[] | null;
};
export function OrderFlow({
  manual = false,
  onSaved,
}: {
  manual?: boolean;
  onSaved?: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [reload, setReload] = useState(0);
  const [category, setCategory] = useState<Category>("Todas"),
    [productId, setProductId] = useState(""),
    [color, setColor] = useState(""),
    [model, setModel] = useState(""),
    [size, setSize] = useState(""),
    [quantity, setQuantity] = useState(1),
    [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [code, setCode] = useState(""),
    [discount, setDiscount] = useState<Discount | null>(null),
    [checkout, setCheckout] = useState(false),
    [receipt, setReceipt] = useState<{
      orderNumber: string;
      totalCents: number;
    } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    cart = useRef<HTMLElement>(null),
    checkoutRef = useRef<HTMLDivElement>(null),
    retry = useRef<{ body: string; id: string } | null>(null);
  const discountRequest = useRef(0);
  useEffect(() => {
    let live = true;
    async function load() {
      setLoading(true);
      try {
        if (!configured)
          throw new Error(
            "El catálogo está pendiente de activar. Contacta con Box 004.",
          );
        const { data, error } = await getSupabase()
          .from("products")
          .select("*,product_variants(*),product_color_images(*)")
          .eq("active", true)
          .order("name");
        if (error) throw error;
        if (live) {
          setProducts(data as Product[]);
          setLoadError("");
        }
      } catch (e) {
        if (live) setLoadError(errorMessage(e));
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [reload]);
  const product = products.find((p) => p.id === productId),
    variants = product?.product_variants.filter((v) => v.active) || [],
    colors = [...new Set(variants.map((v) => v.color))],
    models = [
      ...new Set(variants.filter((v) => v.color === color).map((v) => v.model)),
    ],
    sizes = [
      ...new Set(
        variants
          .filter((v) => v.color === color && v.model === model)
          .map((v) => v.size),
      ),
    ],
    variant = variants.find(
      (v) => v.color === color && v.model === model && v.size === size,
    );
  useEffect(() => {
    if (productId) dialog.current?.showModal();
    else dialog.current?.close();
  }, [productId]);
  useEffect(() => {
    if (checkout) {
      checkoutRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      checkoutRef.current
        ?.querySelector("input")
        ?.focus({ preventScroll: true });
    }
  }, [checkout]);
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0),
    eligibleSubtotal = lines.reduce(
      (s, l) =>
        !discount?.eligibleProductIds ||
        discount.eligibleProductIds.includes(l.v.product_id)
          ? s + l.price * l.quantity
          : s,
      0,
    ),
    reduction = Math.floor((eligibleSubtotal * (discount?.percent || 0)) / 100),
    total = subtotal - reduction,
    units = lines.reduce((s, l) => s + l.quantity, 0);
  const filtered = products.filter(
    (p) => category === "Todas" || categoryOf(p) === category,
  );
  function open(p: Product) {
    const first = p.product_variants.find((v) => v.active);
    setProductId(p.id);
    setColor(first?.color || "");
    setModel(first?.model || "");
    setSize("");
    setQuantity(1);
    setMessage("");
  }
  function add() {
    if (!product || !variant) return;
    const prev = lines.find((l) => l.v.id === variant.id);
    if ((prev?.quantity || 0) + quantity > 20) {
      setMessage("Máximo 20 unidades por talla y color.");
      return;
    }
    if (!prev && lines.length >= 20) {
      setMessage("Máximo 20 combinaciones por pedido.");
      return;
    }
    setLines((ls) =>
      prev
        ? ls.map((l) =>
            l.v.id === variant.id
              ? { ...l, quantity: l.quantity + quantity }
              : l,
          )
        : [
            ...ls,
            {
              v: variant,
              name: product.name,
              price: product.price_cents,
              quantity,
              image: productImage(product, color),
            },
          ],
    );
    setProductId("");
    setMessage("Prenda añadida a tu pedido.");
  }
  async function apply() {
    const requestId = ++discountRequest.current;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (requestId === discountRequest.current) {
        setDiscount(data);
        setCode(data.code);
      }
    } catch (e) {
      if (requestId === discountRequest.current) {
        setDiscount(null);
        setMessage(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      if (!lines.length) throw new Error("Añade al menos una prenda.");
      if (code.trim() && !discount)
        throw new Error("Aplica el descuento o borra el código.");
      const payload = {
        firstName: String(form.get("firstName") || ""),
        lastName: String(form.get("lastName") || ""),
        email: String(form.get("email") || ""),
        phone: String(form.get("phone") || ""),
        notes: String(form.get("notes") || ""),
        discount: discount?.code || "",
        manual,
        lines: lines.map((l) => ({ variantId: l.v.id, quantity: l.quantity })),
      };
      if (!payload.email && !payload.phone)
        throw new Error("Indica un email o teléfono para avisarte.");
      const body = JSON.stringify(payload);
      if (retry.current?.body !== body)
        retry.current = { body, id: crypto.randomUUID() };
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (manual) {
        const { data } = await getSupabase().auth.getSession();
        if (!data.session) throw new Error("Vuelve a iniciar sesión.");
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      const res = await fetch("/api/orders", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...payload, requestId: retry.current.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReceipt(data);
      setLines([]);
      retry.current = null;
      onSaved?.();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (receipt)
    return (
      <section className="panel confirmation" role="status">
        <span className="confirmation-icon">✓</span>
        <div className="eyebrow">Reserva confirmada</div>
        <h1>{receipt.orderNumber}</h1>
        <p>Tu equipación ya está reservada.</p>
        <p>
          Total: <strong>{money(receipt.totalCents)}</strong>
        </p>
        <p className="muted">
          Te contactaremos para coordinar el pago y la recogida en Box 004. No
          se ha realizado ningún cobro online.
        </p>
        <button
          className="btn"
          onClick={() => {
            setReceipt(null);
            setCode("");
            setDiscount(null);
            setCheckout(false);
          }}
        >
          Crear otro pedido
        </button>
      </section>
    );
  return (
    <>
      {!manual && (
        <>
          <header className="store-topbar">
            <Brand />
            <div className="header-actions">
              <a href="#catalogo">Equipación</a>
              <button
                type="button"
                className="bag-button"
                aria-label={`Ver pedido, ${units} prendas`}
                onClick={() =>
                  cart.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                Pedido <span className="count">{units}</span>
              </button>
            </div>
          </header>
          <section className="store-hero">
            <div className="hero-copy">
              <div className="eyebrow">
                Equipación oficial · Box 004 Santiago
              </div>
              <h1>
                TU BOX.
                <br />
                <em>TU EQUIPO.</em>
              </h1>
              <p>
                Diseñada para entrenar.
                <br className="mobile-only" /> Hecha para los nuestros.
              </p>
              <a className="hero-link" href="#catalogo">
                Descubre la colección ↓
              </a>
            </div>
            <div className="hero-art" aria-hidden="true">
              <span className="hero-number">004</span>
              <img src="/images/catalogo/oversize-heavy-negro.png" alt="" />
              <span className="hero-art-label">BOX 004 · HEAVY LIFTING</span>
            </div>
          </section>
        </>
      )}
      <div className={manual ? "manual-store" : "store-content"}>
        {manual && (
          <div className="section-heading">
            <div>
              <div className="eyebrow">Venta en el centro</div>
              <h2>Nuevo pedido manual</h2>
              <p className="muted">
                Elige las prendas y completa los datos del cliente.
              </p>
            </div>
          </div>
        )}
        <div className="store-layout">
          <section id="catalogo" className="catalog-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">La colección</div>
                <h2>Tu próxima equipación.</h2>
              </div>
              <span className="muted">{products.length} prendas</span>
            </div>
            <div
              className="category-tabs"
              role="group"
              aria-label="Filtrar prendas"
            >
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  className={category === c ? "active" : ""}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            {loading ? (
              <p className="notice" role="status">
                Cargando colección…
              </p>
            ) : loadError ? (
              <div className="notice error" role="alert">
                {loadError}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setReload((n) => n + 1)}
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="shop-grid">
                {filtered.map((p) => {
                  const photo = productImage(p),
                    cs = [
                      ...new Set(
                        p.product_variants
                          .filter((v) => v.active)
                          .map((v) => v.color),
                      ),
                    ];
                  return (
                    <article className="shop-card" key={p.id}>
                      <button
                        type="button"
                        className="shop-image"
                        onClick={() => open(p)}
                        aria-label={`Ver ${p.name}`}
                      >
                        {photo ? (
                          <img src={photo} alt={p.name} loading="lazy" />
                        ) : (
                          <span>004</span>
                        )}
                        <span className="shop-tag">{categoryOf(p)}</span>
                      </button>
                      <div className="shop-info">
                        <h3>{p.name}</h3>
                        <strong className="shop-price">
                          {money(p.price_cents)}
                        </strong>
                        <div
                          className="swatches"
                          aria-label={`Colores: ${cs.join(", ")}`}
                        >
                          {cs.map((c) => (
                            <span
                              key={c}
                              title={c}
                              style={{ background: swatch(c) }}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="btn wide"
                          disabled={!cs.length}
                          onClick={() => open(p)}
                        >
                          {cs.length ? "Elegir prenda" : "No disponible"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {!loading && !loadError && !filtered.length && (
              <p className="empty">Todavía no hay prendas en esta categoría.</p>
            )}
          </section>
          <aside ref={cart} id="pedido" className="panel cart-panel">
            <div className="section-heading">
              <h2>Tu pedido</h2>
              <span className="count">{units}</span>
            </div>
            {!lines.length ? (
              <div className="empty">
                <span className="empty-icon">＋</span>
                <p>Tu equipo empieza aquí.</p>
                <small>Elige una prenda para añadirla.</small>
              </div>
            ) : (
              lines.map((l) => (
                <div className="cart-line" key={l.v.id}>
                  {l.image && <img src={l.image} alt="" />}
                  <div>
                    <strong>{l.name}</strong>
                    <small>
                      {l.v.color} · {l.v.size} · {l.v.model}
                    </small>
                    <div className="quantity-control">
                      <button
                        type="button"
                        aria-label={`Una menos de ${l.name}`}
                        disabled={busy}
                        onClick={() =>
                          setLines((ls) =>
                            ls.flatMap((x) =>
                              x.v.id !== l.v.id
                                ? [x]
                                : x.quantity > 1
                                  ? [{ ...x, quantity: x.quantity - 1 }]
                                  : [],
                            ),
                          )
                        }
                      >
                        −
                      </button>
                      <span>{l.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Una más de ${l.name}`}
                        disabled={busy || l.quantity >= 20}
                        onClick={() =>
                          setLines((ls) =>
                            ls.map((x) =>
                              x.v.id === l.v.id
                                ? { ...x, quantity: x.quantity + 1 }
                                : x,
                            ),
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                    <b>{money(l.quantity * l.price)}</b>
                  </div>
                  <button
                    type="button"
                    className="remove-line"
                    aria-label={`Quitar ${l.name}`}
                    disabled={busy}
                    onClick={() =>
                      setLines((ls) => ls.filter((x) => x.v.id !== l.v.id))
                    }
                  >
                    ×
                  </button>
                </div>
              ))
            )}
            <div className="discount-inline">
              <label className="field">
                Código de descuento
                <input
                  value={code}
                  maxLength={40}
                  disabled={busy}
                  placeholder="Introduce tu código"
                  onChange={(e) => {
                    discountRequest.current++;
                    setCode(e.target.value);
                    setDiscount(null);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn secondary"
                disabled={busy || !code.trim()}
                onClick={() => void apply()}
              >
                Aplicar
              </button>
            </div>
            {discount && (
              <p className="discount-notice" role="status">
                ✓ {discount.percent}%{" "}
                {discount.eligibleProductIds
                  ? "en las prendas incluidas"
                  : "en todo el pedido"}
                {eligibleSubtotal === 0 &&
                  " · Añade una prenda incluida para aprovecharlo."}
              </p>
            )}
            <div className="price-row">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            {reduction > 0 && (
              <div className="price-row discount-value">
                <span>Descuento</span>
                <span>−{money(reduction)}</span>
              </div>
            )}
            <div className="total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            {!checkout && (
              <button
                type="button"
                className="btn wide"
                disabled={!lines.length || busy}
                onClick={() => setCheckout(true)}
              >
                Continuar pedido →
              </button>
            )}
            <p className="muted fine-print">
              Reserva ahora. Coordinamos el pago y la recogida contigo en el
              box.
            </p>
          </aside>
        </div>
        {message && (
          <p
            className={`notice ${message === "Prenda añadida a tu pedido." ? "success" : "error"}`}
            role="status"
          >
            {message}
          </p>
        )}
        {checkout && (
          <div ref={checkoutRef} className="checkout-panel panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Último paso</div>
                <h2>¿A nombre de quién?</h2>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setCheckout(false);
                  cart.current?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                ← Volver a las prendas
              </button>
            </div>
            <form onSubmit={submit}>
              <fieldset disabled={busy} className="plain-fieldset">
                <div className="form-grid">
                  <label className="field">
                    Nombre *
                    <input
                      name="firstName"
                      required
                      autoComplete="given-name"
                      maxLength={80}
                    />
                  </label>
                  <label className="field">
                    Apellidos *
                    <input
                      name="lastName"
                      required
                      autoComplete="family-name"
                      maxLength={120}
                    />
                  </label>
                  <label className="field">
                    Teléfono
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      maxLength={40}
                    />
                  </label>
                  <label className="field">
                    Email
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      maxLength={160}
                    />
                  </label>
                  <label className="field full">
                    Observaciones <span className="muted">(opcional)</span>
                    <textarea
                      name="notes"
                      rows={2}
                      maxLength={500}
                      placeholder="¿Algo que debamos saber?"
                    />
                  </label>
                </div>
                <p className="muted">
                  Necesitamos al menos un teléfono o email para avisarte.
                </p>
                <div className="checkout-submit">
                  <p>
                    {units} prendas · <strong>{money(total)}</strong>
                  </p>
                  <button className="btn" disabled={busy || !lines.length}>
                    {busy
                      ? "Registrando…"
                      : manual
                        ? "Guardar pedido manual"
                        : "Confirmar reserva"}
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
        )}
        {!manual && (
          <footer className="store-footer">
            <Brand />
            <p>Entrenamiento. Comunidad. Box 004 Santiago.</p>
            <a href="mailto:santiago@box004.com">santiago@box004.com</a>
          </footer>
        )}
      </div>
      {!manual && units > 0 && !checkout && (
        <div className="mobile-cart">
          <span>
            {units} prendas · <b>{money(total)}</b>
          </span>
          <button
            type="button"
            className="btn"
            onClick={() =>
              cart.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            Ver pedido ↑
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className="product-dialog"
        onCancel={() => setProductId("")}
        onClick={(e) => {
          if (e.target === e.currentTarget) setProductId("");
        }}
      >
        {product && (
          <div className="product-dialog-content">
            <button
              type="button"
              className="dialog-close"
              aria-label="Cerrar prenda"
              onClick={() => setProductId("")}
            >
              ×
            </button>
            <div className="product-gallery">
              {productImage(product, color) && (
                <img
                  src={productImage(product, color)}
                  alt={`${product.name}, ${color}`}
                />
              )}
              <div className="gallery-thumbs">
                {product.product_color_images
                  .filter(
                    (i) =>
                      i.color.trim().toLowerCase() ===
                      color.trim().toLowerCase(),
                  )
                  .map((i) => (
                    <a
                      key={i.id}
                      href={i.image_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={i.image_url}
                        alt={`${product.name}, ${color}, ver foto`}
                      />
                    </a>
                  ))}
              </div>
            </div>
            <div className="product-config">
              <div className="eyebrow">Box 004 · {categoryOf(product)}</div>
              <h2>{product.name}</h2>
              <p className="config-price">{money(product.price_cents)}</p>
              {product.description && (
                <p className="muted">{product.description}</p>
              )}
              <fieldset className="option-group">
                <legend>Color: {color}</legend>
                <div className="option-buttons">
                  {colors.map((c) => (
                    <button
                      type="button"
                      key={c}
                      aria-pressed={c === color}
                      className={c === color ? "selected" : ""}
                      onClick={() => {
                        setColor(c);
                        setModel(
                          variants.find((v) => v.color === c)?.model || "",
                        );
                        setSize("");
                      }}
                    >
                      <i style={{ background: swatch(c) }} />
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
              {models.length > 1 && (
                <fieldset className="option-group">
                  <legend>Modelo</legend>
                  <div className="option-buttons">
                    {models.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={model === m}
                        className={model === m ? "selected" : ""}
                        onClick={() => {
                          setModel(m);
                          setSize("");
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <fieldset className="option-group">
                <legend>Talla</legend>
                <div className="option-buttons">
                  {sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={s === size}
                      className={s === size ? "selected" : ""}
                      onClick={() => setSize(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="field quantity-field">
                Unidades
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                    )
                  }
                />
              </label>
              {message && message !== "Prenda añadida a tu pedido." && (
                <p className="notice error" role="alert">
                  {message}
                </p>
              )}
              <button
                type="button"
                className="btn wide"
                disabled={!variant || busy}
                onClick={add}
              >
                {!size
                  ? "Selecciona una talla"
                  : `Añadir al pedido · ${money(product.price_cents * quantity)}`}
              </button>
              <p className="muted fine-print">Recogida en Box 004 Santiago.</p>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
