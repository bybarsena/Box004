"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabase, errorMessage } from "@/lib/supabase";
import { money, type Product, type ProductType } from "@/lib/types";
import { swatch, categoryOf } from "@/lib/catalog";
type Row = { model: string; size: string; color: string; active: boolean };
type Photo = { color: string; image_url: string; file?: File };
export function ProductEditor({
  product,
  onClose,
  onSaved,
  productTypes,
  onTypesChanged,
}: {
  product: Product | null;
  productTypes: ProductType[];
  onTypesChanged: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(categoryOf(product || ""));
  const [customType, setCustomType] = useState(false),
    [typeName, setTypeName] = useState(""),
    [savingType, setSavingType] = useState(false),
    [typeMessage, setTypeMessage] = useState("");
  const typeNames = [
    ...new Set([...productTypes.map((t) => t.name), category]),
  ].sort((a, b) => a.localeCompare(b, "es"));
  async function createType() {
    const name = typeName.trim();
    if (name.length < 2 || name.length > 50 || name.toLowerCase() === "todas") {
      setTypeMessage(
        "Usa entre 2 y 50 caracteres y un nombre distinto de «Todas».",
      );
      return;
    }
    setSavingType(true);
    setTypeMessage("");
    try {
      const { error } = await getSupabase()
        .from("product_types")
        .insert({ name })
        .select("id")
        .single();
      if (error) throw error;
      setCategory(name);
      setTypeName("");
      setCustomType(false);
      onTypesChanged();
    } catch (e) {
      setTypeMessage(
        typeof e === "object" && e && "code" in e && e.code === "23505"
          ? "Ese tipo ya existe. Selecciónalo en la lista."
          : errorMessage(e),
      );
    } finally {
      setSavingType(false);
    }
  }
  const [id] = useState(() => product?.id || crypto.randomUUID()),
    [name, setName] = useState(product?.name || ""),
    [price, setPrice] = useState(
      product ? String(product.price_cents / 100) : "20",
    ),
    [description, setDescription] = useState(product?.description || ""),
    [active, setActive] = useState(product?.active ?? true),
    [rows, setRows] = useState<Row[]>(
      () =>
        product?.product_variants.map(({ model, size, color, active }) => ({
          model,
          size,
          color,
          active,
        })) || [],
    ),
    [photos, setPhotos] = useState<Photo[]>(
      () =>
        product?.product_color_images.map(({ color, image_url }) => ({
          color,
          image_url,
        })) || [],
    ),
    [model, setModel] = useState("Unisex"),
    [colors, setColors] = useState("Negro, Blanco"),
    [sizes, setSizes] = useState(["S", "M", "L", "XL"]),
    [customSize, setCustomSize] = useState(""),
    [photoColor, setPhotoColor] = useState("Portada"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );
  const activeColors = [
    ...new Set(rows.filter((r) => r.active).map((r) => r.color)),
  ];
  function addVariants() {
    const cs = [
      ...new Set(
        colors
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      ),
    ];
    if (!model.trim() || !cs.length || !sizes.length) {
      setMessage("Indica modelo, colores y al menos una talla.");
      return;
    }
    const additions = cs.flatMap((color) =>
      sizes.map((size) => ({ model: model.trim(), color, size, active: true })),
    );
    setRows((prev) => {
      const next = [...prev];
      for (const r of additions) {
        const index = next.findIndex(
          (x) =>
            x.model === r.model && x.color === r.color && x.size === r.size,
        );
        if (index < 0) next.push(r);
        else next[index] = r;
      }
      return next;
    });
    setMessage("Combinaciones preparadas. Guarda la prenda para aplicarlas.");
  }
  function chooseFiles(files: FileList | null) {
    if (!files) return;
    const added: Photo[] = [];
    for (const file of Array.from(files)) {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 5242880
      ) {
        setMessage("Usa fotos JPG, PNG o WebP de hasta 5 MB.");
        return;
      }
      const image_url = URL.createObjectURL(file);
      urls.current.push(image_url);
      added.push({ color: photoColor, image_url, file });
    }
    setPhotos((p) => [...p, ...added]);
    setMessage("Fotos preparadas para guardar.");
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || savingType) return;
    setMessage("");
    if (active && !rows.some((r) => r.active)) {
      setMessage(
        "Añade las tallas y colores antes de publicar. También puedes guardar como borrador.",
      );
      return;
    }
    if (rows.length > 300) {
      setMessage("Máximo 300 combinaciones por prenda.");
      return;
    }
    if (photos.length > 50) {
      setMessage("Máximo 50 fotos por prenda.");
      return;
    }
    setBusy(true);
    try {
      const cents = Math.round(Number(price) * 100);
      if (!Number.isFinite(cents) || cents < 0 || cents > 1000000)
        throw new Error("Revisa el precio.");
      const db = getSupabase();
      const uploaded: Photo[] = [];
      for (const photo of photos) {
        if (!photo.file) {
          uploaded.push(photo);
          continue;
        }
        const path = `${id}/${crypto.randomUUID()}.${photo.file.type.split("/")[1]}`;
        const { error } = await db.storage
          .from("product-images")
          .upload(path, photo.file, {
            contentType: photo.file.type,
            upsert: false,
          });
        if (error) throw error;
        const { data } = db.storage.from("product-images").getPublicUrl(path);
        uploaded.push({ color: photo.color, image_url: data.publicUrl });
      }
      setPhotos(uploaded);
      const { error } = await db.rpc("save_catalog_product", {
        p_id: id,
        p_name: name.trim(),
        p_description: description,
        p_price_cents: cents,
        p_active: active,
        p_category: category,
        p_variants: rows,
        p_photos: uploaded.map(({ color, image_url }) => ({
          color,
          image_url,
        })),
      });
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="product-editor">
      <div className="section-heading admin-page-heading">
        <div>
          <div className="eyebrow">Catálogo · Editor de prendas</div>
          <h1>{product ? "Editar prenda" : "Nueva prenda"}</h1>
          <p className="muted">
            Nombre, combinaciones y fotos. Todo en un solo lugar.
          </p>
        </div>
        <button className="btn secondary" disabled={busy} onClick={onClose}>
          ← Volver a prendas
        </button>
      </div>
      <form onSubmit={save}>
        <fieldset disabled={busy || savingType} className="plain-fieldset">
          <div className="editor-layout">
            <div className="stack">
              <section className="panel">
                <div className="step-heading">
                  <span>01</span>
                  <h2>Lo esencial</h2>
                </div>
                <div className="form-grid">
                  <label className="field">
                    Nombre de la prenda
                    <input
                      required
                      maxLength={160}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej. Camiseta Athlete"
                    />
                  </label>
                  <label className="field">
                    Precio (€)
                    <input
                      required
                      type="number"
                      min={0}
                      max={10000}
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Tipo de prenda
                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as typeof category)
                      }
                    >
                      {typeNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setCustomType((v) => !v)}
                    >
                      ＋ Crear tipo de prenda
                    </button>
                  </label>
                  {customType && (
                    <div className="field full inline-type">
                      <label>
                        Nombre del nuevo tipo
                        <input
                          minLength={2}
                          maxLength={50}
                          value={typeName}
                          onChange={(e) => setTypeName(e.target.value)}
                          placeholder="Ej.: Pantalones"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={savingType || !typeName.trim()}
                        onClick={() => void createType()}
                      >
                        {savingType ? "Creando…" : "Crear y seleccionar"}
                      </button>
                      {typeMessage && (
                        <p className="notice error" role="alert">
                          {typeMessage}
                        </p>
                      )}
                    </div>
                  )}
                  <label className="field full">
                    Descripción opcional
                    <textarea
                      value={description}
                      rows={2}
                      maxLength={2000}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                </div>
              </section>
              <section className="panel">
                <div className="step-heading">
                  <span>02</span>
                  <h2>Tallas y colores</h2>
                </div>
                <div className="form-grid">
                  <label className="field">
                    Modelo
                    <input
                      value={model}
                      maxLength={80}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="Unisex, Athlete…"
                    />
                  </label>
                  <label className="field">
                    Colores separados por comas
                    <input
                      value={colors}
                      maxLength={500}
                      onChange={(e) => setColors(e.target.value)}
                      placeholder="Negro, Blanco"
                    />
                  </label>
                </div>
                <fieldset className="option-group">
                  <legend>Tallas para añadir</legend>
                  <div className="option-buttons">
                    {[
                      ...new Set(["XS", "S", "M", "L", "XL", "XXL", ...sizes]),
                    ].map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={sizes.includes(s)}
                        className={sizes.includes(s) ? "selected" : ""}
                        onClick={() =>
                          setSizes((prev) =>
                            prev.includes(s)
                              ? prev.filter((x) => x !== s)
                              : [...prev, s],
                          )
                        }
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="custom-size">
                  <input
                    aria-label="Otra talla"
                    placeholder="Otra talla: 3XL, 12…"
                    maxLength={80}
                    value={customSize}
                    onChange={(e) => setCustomSize(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={!customSize.trim()}
                    onClick={() => {
                      setSizes((s) => [...new Set([...s, customSize.trim()])]);
                      setCustomSize("");
                    }}
                  >
                    Añadir talla
                  </button>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={addVariants}
                >
                  ＋ Añadir estas combinaciones
                </button>
                <p className="muted">
                  {rows.filter((r) => r.active).length} combinaciones
                  disponibles. Desmarca las que no quieras vender.
                </p>
                <div className="variant-chips">
                  {rows.map((r, i) => (
                    <label
                      key={`${r.model}-${r.color}-${r.size}`}
                      className={r.active ? "selected" : ""}
                    >
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, j) =>
                              i === j ? { ...x, active: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      <span>
                        <i style={{ background: swatch(r.color) }} />
                        {r.color} · <b>{r.size}</b>
                        <small>{r.model}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="step-heading">
                  <span>03</span>
                  <h2>Fotos de la prenda</h2>
                </div>
                <p className="muted">
                  La portada se ve en el catálogo. Las fotos por color se
                  muestran al elegir ese color.
                </p>
                <div className="form-grid">
                  <label className="field">
                    Asignar las nuevas fotos a
                    <select
                      value={photoColor}
                      onChange={(e) => setPhotoColor(e.target.value)}
                    >
                      <option value="Portada">Portada del catálogo</option>
                      {activeColors.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Subir fotos
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        chooseFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="photo-grid">
                  {photos.map((p, i) => (
                    <article key={`${p.image_url}-${i}`}>
                      <img
                        src={p.image_url}
                        alt={`Foto ${i + 1}, ${p.color}`}
                      />
                      <label className="field">
                        <span className="sr-only">
                          Color de la foto {i + 1}
                        </span>
                        <select
                          value={p.color}
                          onChange={(e) =>
                            setPhotos((ps) =>
                              ps.map((x, j) =>
                                i === j ? { ...x, color: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          {[
                            ...new Set(["Portada", ...activeColors, p.color]),
                          ].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="text-button danger-text"
                        onClick={() =>
                          setPhotos((ps) => ps.filter((_, j) => j !== i))
                        }
                      >
                        Quitar foto
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            </div>
            <aside className="panel editor-preview">
              <div className="eyebrow">Así se verá</div>
              {photos[0] ? (
                <img
                  src={
                    (photos.find((p) => p.color === "Portada") || photos[0])
                      .image_url
                  }
                  alt="Vista previa de la prenda"
                />
              ) : (
                <div className="image-placeholder">004</div>
              )}
              <h3>{name || "Nombre de la prenda"}</h3>
              <strong>{money(Math.round((Number(price) || 0) * 100))}</strong>
              <p className="muted">
                {activeColors.join(" · ") || "Añade tallas y colores"}
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Publicar en el catálogo
              </label>
              <p className="muted fine-print">
                {active
                  ? "Los clientes podrán reservar esta prenda."
                  : "Se guardará como borrador, visible solo para administración."}
              </p>
              <button className="btn wide" disabled={busy}>
                {busy
                  ? "Guardando prenda…"
                  : active
                    ? "Guardar y publicar"
                    : "Guardar borrador"}
              </button>
              <p className="muted fine-print">
                Los pedidos anteriores conservan su precio.
              </p>
            </aside>
          </div>
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
        </fieldset>
      </form>
    </section>
  );
}
