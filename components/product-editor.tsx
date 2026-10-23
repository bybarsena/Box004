"use client";
import { useState, type FormEvent } from "react";
import { getSupabase, errorMessage } from "@/lib/supabase";
import type { Product } from "@/lib/types";
import { recoveredImages } from "@/lib/assets";
export function ProductEditor({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [color, setColor] = useState("");
  const colors = [...new Set(product?.product_variants.map((v) => v.color) || [])];
  const photoColor = colors.includes(color) ? color : colors[0] || "";
  const colorPhotos = product?.product_color_images.filter((i) => i.color.trim().toLowerCase() === photoColor.trim().toLowerCase()) || [];
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      onSaved();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      const active = f.get("active") === "on";
      if (active && !product?.product_variants.some((v) => v.active))
        throw new Error(
          "Guarda primero como borrador y añade tallas antes de publicar.",
        );
      const cents = Math.round(Number(f.get("price")) * 100);
      if (!Number.isFinite(cents) || cents < 0 || cents > 1000000)
        throw new Error("Precio no válido.");
      const data = {
        name: String(f.get("name")).trim(),
        description: String(f.get("description")),
        price_cents: cents,
        active,
      };
      const db = getSupabase();
      const { error } = product
        ? await db.from("products").update(data).eq("id", product.id)
        : await db.from("products").insert(data);
      if (error) throw error;
      onClose();
    });
  }
  function variants(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!product) return;
    const f = new FormData(e.currentTarget),
      form = e.currentTarget;
    void run(async () => {
      const sizes = [
          ...new Set(
            String(f.get("sizes"))
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          ),
        ],
        colors = [
          ...new Set(
            String(f.get("colors"))
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          ),
        ];
      if (!sizes.length || !colors.length || sizes.length * colors.length > 100)
        throw new Error("Indica tallas y colores. Máximo 100 combinaciones.");
      const rows = colors.flatMap((color) =>
        sizes.map((size) => ({
          product_id: product.id,
          model: String(f.get("model")).trim(),
          size,
          color,
        })),
      );
      const { error } = await getSupabase()
        .from("product_variants")
        .upsert(rows, {
          onConflict: "product_id,model,size,color",
          ignoreDuplicates: true,
        });
      if (error) throw error;
      form.reset();
    });
  }
  async function addRecovered(image: string) {
    if (!product || !photoColor) throw new Error("Indica primero el color.");
    const { error } = await getSupabase()
      .from("product_color_images")
      .insert({
        product_id: product.id,
        color: photoColor,
        image_url: "/images/" + image,
      });
    if (error) throw error;
  }
  async function upload(file: File) {
    if (!product) return;
    if (!photoColor)
      throw new Error("Indica el color antes de subir la imagen.");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5242880
    )
      throw new Error("Usa JPG, PNG o WebP de hasta 5 MB.");
    const db = getSupabase(),
      path = `${product.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
    const { error } = await db.storage
      .from("product-images")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = db.storage.from("product-images").getPublicUrl(path);
    const { error: ie } = await db
      .from("product_color_images")
      .insert({
        product_id: product.id,
        color: photoColor,
        image_url: data.publicUrl,
      });
    if (ie) throw ie;
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{product ? "Editar prenda" : "Nueva prenda"}</h2>
        <button className="btn secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {message && (
        <div className="notice error" role="alert">
          {message}
        </div>
      )}
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            Nombre
            <input
              name="name"
              required
              maxLength={160}
              defaultValue={product?.name}
            />
          </label>
          <label className="field">
            Precio (€)
            <input
              name="price"
              required
              type="number"
              min="0"
              max="10000"
              step="0.01"
              defaultValue={product ? product.price_cents / 100 : ""}
            />
          </label>
          <label className="field full">
            Descripción
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={product?.description}
            />
          </label>
        </div>
        <label className="check">
          <input
            name="active"
            type="checkbox"
            defaultChecked={product?.active}
          />
          Publicada y disponible para pedidos
        </label>
        <button className="btn" disabled={busy}>
          Guardar prenda
        </button>
      </form>
      {!product ? (
        <p className="notice">
          Guarda la prenda como borrador. Después, desde «Editar», añade tallas,
          colores y fotos.
        </p>
      ) : (
        <>
          <hr className="divider" />
          <h3>Tallas y colores</h3>
          <div className="variant-list">
            {product.product_variants.map((v) => (
              <label className="check" key={v.id}>
                <input
                  type="checkbox"
                  checked={v.active}
                  disabled={busy}
                  onChange={() =>
                    void run(async () => {
                      const { error } = await getSupabase()
                        .from("product_variants")
                        .update({ active: !v.active })
                        .eq("id", v.id);
                      if (error) throw error;
                    })
                  }
                />
                {v.model} · {v.size} · {v.color}
              </label>
            ))}
          </div>
          <p className="muted">Añade tallas y colores separados por comas. Se crearán todas sus combinaciones; desmarca las que no estén disponibles.</p>
          <form onSubmit={variants}>
            <div className="form-grid">
              <label className="field">
                Modelo
                <input
                  name="model"
                  required
                  maxLength={80}
                  defaultValue="Unisex"
                />
              </label>
              <label className="field">
                Tallas separadas por comas
                <input
                  name="sizes"
                  required
                  maxLength={500}
                  placeholder="S, M, L, XL"
                />
              </label>
              <label className="field full">
                Colores separados por comas
                <input
                  name="colors"
                  required
                  maxLength={500}
                  placeholder="Negro, Blanco"
                />
              </label>
            </div>
            <div className="actions">
              <button className="btn secondary" disabled={busy}>
                Añadir combinaciones
              </button>
            </div>
          </form>
          <hr className="divider" />
          <h3>Fotos por color</h3>
          <p className="muted">Elige un color de los que has creado y añade su foto. Al cambiar de color en el pedido, cambiarán las imágenes.</p>
          <label className="field">
            Color de las fotos
            <select value={photoColor} disabled={!colors.length || busy} onChange={(e) => setColor(e.target.value)}>
              {!colors.length && <option value="">Añade primero tallas y colores</option>}
              {colors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="image-strip">
            {colorPhotos.map((i) => (
              <div className="image-item" key={i.id}>
                <img src={i.image_url} alt={i.color} />
                <span>{i.color}</span>
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const { error } = await getSupabase()
                        .from("product_color_images")
                        .delete()
                        .eq("id", i.id);
                      if (error) throw error;
                    })
                  }
                >
                  Quitar del catálogo
                </button>
              </div>
            ))}
          </div>
          <div className="form-grid">
            <label className="field">
              Subir foto (hasta 5 MB)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || !photoColor}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void run(() => upload(file));
                }}
              />
            </label>
          </div>
          <details className="asset-gallery">
            <summary>Elegir entre las 12 imágenes recuperadas</summary>
            <p className="muted">
              La imagen que pulses se asociará al color {photoColor || "que selecciones"}.
            </p>
            <div className="product-grid">
              {recoveredImages.map((image) => (
                <button
                  type="button"
                  className="product-card"
                  key={image}
                  disabled={busy || !photoColor}
                  onClick={() => void run(() => addRecovered(image))}
                >
                  <img
                    className="product-thumb"
                    src={"/images/" + image}
                    alt={image.replace(/_/g, " ")}
                  />
                  <small>{image.replace(/_/g, " ")}</small>
                </button>
              ))}
            </div>
          </details>
          <p className="muted">
            Puedes añadir varias fotos del mismo color: frontal, trasera y
            detalles. Los pedidos anteriores conservan su precio original.
          </p>
        </>
      )}
    </section>
  );
}
