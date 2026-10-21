"use client";
import { useState, type FormEvent } from "react";
import { getSupabase, errorMessage } from "@/lib/supabase";
import { money, type Product, type Discount } from "@/lib/types";

export function DiscountEditor({ discount, products, onCancel, onSaved }: {
  discount: Discount | null;
  products: Product[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [allProducts, setAllProducts] = useState(discount ? discount.eligible_product_ids === null : false);
  const [selected, setSelected] = useState<string[]>(discount?.eligible_product_ids || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    if (!allProducts && !selected.length) {
      setError("Selecciona al menos una prenda.");
      return;
    }
    setBusy(true);
    try {
      const date = String(f.get("expires") || "");
      const code = String(f.get("code") || "").trim().toUpperCase();
      const percent = Number(f.get("percent"));
      if (!code || !Number.isInteger(percent) || percent < 1 || percent > 100)
        throw new Error("Revisa el código y el porcentaje.");
      const values = {
        code, percent,
        active: f.get("active") === "on",
        expires_at: date ? new Date(`${date}T23:59:59`).toISOString() : null,
        eligible_product_ids: allProducts ? null : selected,
      };
      const db = getSupabase();
      const query = discount
        ? db.from("discounts").update(values).eq("code", discount.code)
        : db.from("discounts").insert(values);
      const { data, error } = await query.select("code").single();
      if (error) {
        if (error.code === "23505") throw new Error("Este código ya existe. Edítalo desde la lista.");
        throw error;
      }
      if (!data) throw new Error("No se pudo guardar el descuento.");
      await onSaved();
      if (!discount) {
        setAllProducts(false);
        setSelected([]);
      }
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="stack">
      <h3>{discount ? `Editar ${discount.code}` : "Nuevo código"}</h3>
      <fieldset disabled={busy} className="discount-editor-fields">
        <div className="form-grid">
          <label className="field">Código
            <input name="code" required maxLength={40} defaultValue={discount?.code || ""} readOnly={!!discount} />
          </label>
          <label className="field">Descuento (%)
            <input name="percent" required type="number" min="1" max="100" step="1" defaultValue={discount?.percent || 10} />
          </label>
          <label className="field">Caducidad opcional
            <input name="expires" type="date" defaultValue={discount?.expires_at ? new Date(discount.expires_at).toLocaleDateString("en-CA") : ""} />
          </label>
        </div>
        <label className="discount-choice">
          <input name="active" type="checkbox" defaultChecked={discount?.active ?? true} />
          Código activo
        </label>
        <fieldset className="discount-scope">
          <legend>¿Qué prendas tienen descuento?</legend>
          <label className="discount-choice">
            <input type="radio" name="scope" checked={!allProducts} onChange={() => setAllProducts(false)} />
            Solo las prendas que seleccione
          </label>
          <label className="discount-choice">
            <input type="radio" name="scope" checked={allProducts} onChange={() => setAllProducts(true)} />
            Todo el catálogo, incluidas futuras prendas
          </label>
          {!allProducts && <>
            <p className="muted">{selected.length} prendas seleccionadas. Se incluyen todas sus tallas y colores.</p>
            <div className="actions">
              <button type="button" className="text-button" onClick={() => setSelected(products.filter((p) => p.active && !/sudadera/i.test(p.name)).map((p) => p.id))}>Solo camisetas publicadas</button>
              <button type="button" className="text-button" onClick={() => setSelected([])}>Desmarcar todas</button>
            </div>
            <div className="discount-products">
              {products.map((p) => <label key={p.id} className={`discount-product ${selected.includes(p.id) ? "selected" : ""}`}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => {
                  const checked = e.target.checked;
                  setSelected((ids) => checked ? [...ids, p.id] : ids.filter((id) => id !== p.id));
                }} />
                <span><strong>{p.name}</strong><small>{money(p.price_cents)}{!p.active && " · Sin publicar"}</small></span>
              </label>)}
            </div>
          </>}
          <p className="muted">El descuento se calcula solo sobre las prendas incluidas. Los pedidos anteriores conservan su importe.</p>
        </fieldset>
      </fieldset>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn" disabled={busy}>{busy ? "Guardando…" : "Guardar código"}</button>
        {discount && <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancelar / nuevo código</button>}
      </div>
    </form>
  );
}
