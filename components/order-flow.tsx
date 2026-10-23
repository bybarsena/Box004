"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabase, configured, errorMessage } from "@/lib/supabase";
import { money, type Product, type Variant } from "@/lib/types";
type Line = { v: Variant; name: string; price: number; quantity: number };
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
  const [productId, setProductId] = useState(""),
    [selectedColor, setSelectedColor] = useState(""),
    [selectedModel, setSelectedModel] = useState(""),
    [selectedSize, setSelectedSize] = useState(""),
    [quantity, setQuantity] = useState(1),
    [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [receipt, setReceipt] = useState<{
      orderNumber: string;
      totalCents: number;
    } | null>(null),
    [code, setCode] = useState(""),
    [discount, setDiscount] = useState<{
      code: string;
      percent: number;
    } | null>(null);
  const retry = useRef<{ body: string; id: string } | null>(null);
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
    variant = variants.find((v) => v.color === selectedColor && v.model === selectedModel && v.size === selectedSize);
  const colors = [...new Set(variants.map((v) => v.color))];
  const models = [...new Set(variants.filter((v) => v.color === selectedColor).map((v) => v.model))];
  const sizes = [...new Set(variants.filter((v) => v.color === selectedColor && v.model === selectedModel).map((v) => v.size))];
  const photos =
    product?.product_color_images.filter(
      (p) => p.color.trim().toLowerCase() === selectedColor.trim().toLowerCase(),
    ) || [];
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0),
    total = subtotal - Math.floor((subtotal * (discount?.percent || 0)) / 100);
  function add() {
    if (!variant || !product) return;
    const previous = lines.find((l) => l.v.id === variant.id);
    if ((previous?.quantity || 0) + quantity > 20) {
      setMessage("Máximo 20 unidades por combinación.");
      return;
    }
    setLines((ls) =>
      previous
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
            },
          ],
    );
    setMessage("");
  }
  async function apply() {
    setBusy(true);
    try {
      const res = await fetch("/api/discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDiscount(data);
      setCode(data.code);
      setMessage("");
    } catch (e) {
      setDiscount(null);
      setMessage(errorMessage(e));
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
        throw new Error("Indica un email o teléfono.");
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
        <div className="eyebrow">Pedido registrado</div>
        <h2>{receipt.orderNumber}</h2>
        <p>
          Total: <strong>{money(receipt.totalCents)}</strong>
        </p>
        <p>
          El equipo de Box 004 coordinará el pago y la recogida. No se ha
          realizado ningún cobro online.
        </p>
        <button
          className="btn"
          onClick={() => {
            setReceipt(null);
            setCode("");
            setDiscount(null);
          }}
        >
          Crear otro pedido
        </button>
      </section>
    );
  return (
    <form onSubmit={submit} className="step-grid">
      <section className="panel">
        <div className="eyebrow">01 · Producto</div>
        <h2>{manual ? "Pedido manual" : "Configura tu prenda"}</h2>
        {loading ? (
          <p role="status">Cargando catálogo…</p>
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
        ) : !products.length ? (
          <p className="notice">Todavía no hay prendas publicadas.</p>
        ) : (
          <>
            <div className="product-grid">
              {products.map((p) => (
                <article key={p.id} className={`product-card ${p.id === productId ? "selected" : ""}`}>
                <button
                  type="button"
                  className="product-toggle"
                  aria-expanded={p.id === productId}
                  aria-controls={`options-${p.id}`}
                  onClick={() => {
                    if (p.id === productId) {
                      setProductId("");
                      return;
                    }
                    setProductId(p.id);
                    setQuantity(1);
                    const first = p.product_variants.find((v) => v.active);
                    setSelectedColor(first?.color || "");
                    setSelectedModel(first?.model || "");
                    setSelectedSize("");
                  }}
                >
                  {(p.id === productId ? photos[0] : (p.product_color_images.find((image) => image.color === "Portada") || p.product_color_images[0])) && (
                    <img
                      className="product-thumb"
                      src={(p.id === productId ? photos[0] : (p.product_color_images.find((image) => image.color === "Portada") || p.product_color_images[0])).image_url}
                      alt={p.name}
                    />
                  )}
                  <strong>{p.name}</strong>
                  <p>{p.description}</p>
                  <span className="price">{money(p.price_cents)}</span>
                  <span className="product-action">{p.id === productId ? "Cerrar opciones −" : "Elegir talla y color +"}</span>
                </button>
            {p.id === productId && product && (
              <div id={`options-${p.id}`} className="product-options" role="region" aria-label={`Configurar ${p.name}`}>
                <div className="form-grid">
                  <label className="field">
                    Color
                    <select value={selectedColor} onChange={(e) => {
                      const next = e.target.value;
                      setSelectedColor(next);
                      setSelectedModel(variants.find((v) => v.color === next)?.model || "");
                      setSelectedSize("");
                    }}>
                      <option value="" disabled>Selecciona un color</option>
                      {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    Modelo
                    <select value={selectedModel} disabled={!selectedColor} onChange={(e) => {
                      setSelectedModel(e.target.value);
                      setSelectedSize("");
                    }}>
                      <option value="" disabled>Selecciona un modelo</option>
                      {models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    Talla
                    <select value={selectedSize} disabled={!selectedModel} onChange={(e) => setSelectedSize(e.target.value)}>
                      <option value="" disabled>Selecciona tu talla</option>
                      {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    Unidades
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(
                          Math.min(
                            20,
                            Math.max(1, Number(e.target.value) || 1),
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <div className="image-strip" aria-live="polite" aria-label={`Fotos en color ${selectedColor}`}>
                  {photos.map((p) => (
                    <a
                      key={p.id}
                      href={p.image_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={p.image_url}
                        alt={`${product.name}, ${p.color}`}
                      />
                    </a>
                  ))}
                </div>
                {selectedColor && !photos.length && <p className="muted" role="status">Todavía no hay foto para el color {selectedColor}.</p>}
                <button
                  type="button"
                  className="btn"
                  disabled={!variant || lines.length >= 20}
                  onClick={add}
                >
                  Añadir al pedido
                </button>
              </div>
            )}
                </article>
              ))}
            </div>
          </>
        )}
        <hr className="divider" />
        <div className="eyebrow">
          02 · {manual ? "Datos del cliente" : "Tus datos"}
        </div>
        <h2>¿A nombre de quién?</h2>
        <div className="form-grid">
          <label className="field">
            Nombre *
            <input
              name="firstName"
              autoComplete="given-name"
              required
              maxLength={80}
            />
          </label>
          <label className="field">
            Apellidos *
            <input
              name="lastName"
              autoComplete="family-name"
              required
              maxLength={120}
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
          <label className="field">
            Teléfono
            <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
          </label>
          <label className="field full">
            Observaciones
            <textarea
              name="notes"
              rows={3}
              maxLength={500}
              placeholder={
                manual ? "Puedes anotar la fecha original del pedido." : ""
              }
            />
          </label>
        </div>
        <p className="muted">
          Indica al menos un email o teléfono para gestionar la recogida.
        </p>
      </section>
      <aside className="panel sticky">
        <div className="eyebrow">Tu pedido</div>
        <h2>Resumen</h2>
        {!lines.length ? (
          <p className="empty">Aún no has añadido prendas.</p>
        ) : (
          lines.map((l) => (
            <div className="cart-line" key={l.v.id}>
              <div>
                <strong>
                  {l.quantity} × {l.name}
                </strong>
                <small>
                  {l.v.model} · {l.v.size} · {l.v.color}
                </small>
                <small>{money(l.quantity * l.price)}</small>
              </div>
              <button
                type="button"
                aria-label={`Quitar ${l.name}, ${l.v.size}, ${l.v.color}`}
                onClick={() =>
                  setLines((ls) => ls.filter((x) => x.v.id !== l.v.id))
                }
              >
                Quitar
              </button>
            </div>
          ))
        )}
        <div className="stack discount-field">
          <label className="field">
            Código de descuento
            <input
              maxLength={40}
              value={code}
              onChange={(e) => {
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
          <p className="notice success">{discount.percent}% aplicado</p>
        )}
        <div className="total">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
        <p className="muted">
          El importe definitivo se confirma al registrar el pedido. No se
          realiza ningún cobro online.
        </p>
        {message && (
          <div className="notice error" role="alert">
            {message}
          </div>
        )}
        <button className="btn wide" disabled={busy || !lines.length}>
          {busy
            ? "Guardando…"
            : manual
              ? "Guardar pedido manual"
              : "Confirmar pedido"}
        </button>
        <p className="contact-note">
          Contacto: <a href="mailto:santiago@box004.com">santiago@box004.com</a>
        </p>
      </aside>
    </form>
  );
}
