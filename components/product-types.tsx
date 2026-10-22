"use client";
import { useState, type FormEvent } from "react";
import { getSupabase, errorMessage } from "@/lib/supabase";
import type { Product, ProductType } from "@/lib/types";
export function typeError(e: unknown) {
  return typeof e === "object" && e && "code" in e && e.code === "23505"
    ? "Ya existe un tipo de prenda con ese nombre."
    : errorMessage(e);
}
export function ProductTypes({
  types,
  products,
  onChanged,
}: {
  types: ProductType[];
  products: Product[];
  onChanged: () => void;
}) {
  const [name, setName] = useState(""),
    [editing, setEditing] = useState<ProductType | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (busy) return;
    if (
      value.length < 2 ||
      value.length > 50 ||
      value.toLowerCase() === "todas"
    ) {
      setError("Escribe un nombre de 2 a 50 caracteres distinto de «Todas».");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const db = getSupabase();
      const result = editing
        ? await db
            .from("product_types")
            .update({ name: value })
            .eq("id", editing.id)
            .select("id")
            .single()
        : await db
            .from("product_types")
            .insert({ name: value })
            .select("id")
            .single();
      if (result.error) throw result.error;
      setSuccess(
        editing
          ? "Nombre actualizado también en las prendas de este tipo."
          : "Tipo creado. Ya puedes seleccionarlo en tus prendas.",
      );
      setName("");
      setEditing(null);
      onChanged();
    } catch (e) {
      setError(typeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-heading admin-page-heading">
        <div>
          <div className="eyebrow">Organiza el catálogo</div>
          <h1>Tipos de prenda</h1>
          <p className="muted">
            Crea tus propios tipos y asígnalos al crear o editar una prenda.
          </p>
        </div>
      </div>
      <form className="panel type-form" onSubmit={save}>
        <label className="field">
          {editing ? "Editar tipo de prenda" : "Nuevo tipo de prenda"}
          <input
            required
            minLength={2}
            maxLength={50}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej.: Pantalones, Accesorios…"
          />
        </label>
        <div className="actions">
          <button className="btn" disabled={busy}>
            {busy ? "Guardando…" : editing ? "Guardar nombre" : "＋ Crear tipo"}
          </button>
          {editing && (
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setName("");
                setError("");
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
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
      <div className="type-list">
        {types.map((t) => {
          const count = products.filter((p) => p.category === t.name).length;
          return (
            <article className="panel type-card" key={t.id}>
              <div>
                <h3>{t.name}</h3>
                <p className="muted">
                  {count} {count === 1 ? "prenda" : "prendas"}
                </p>
              </div>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(t);
                  setName(t.name);
                  setSuccess("");
                  setError("");
                }}
                aria-label={`Editar tipo ${t.name}`}
              >
                Editar nombre
              </button>
            </article>
          );
        })}
      </div>
      <p className="muted">
        Los tipos aparecen como filtros en la tienda cuando tienen prendas
        publicadas.
      </p>
    </>
  );
}
