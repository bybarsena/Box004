"use client";
import { useEffect, useRef, useState } from "react";
import type { Order, Product } from "@/lib/types";
import { number, statuses } from "@/lib/types";
import { productionSummary } from "@/lib/production";
export function ProductionExport({
  orders,
  visible,
  products,
  onClose,
}: {
  orders: Order[];
  visible: Order[];
  products: Product[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [snapshot] = useState(() =>
    orders.filter((o) => o.status !== "cancelled"),
  );
  const [visibleIds] = useState(() => new Set(visible.map((o) => o.id)));
  const [scope, setScope] = useState("pending");
  const candidates = (value: string) =>
    snapshot.filter((o) =>
      value === "visible"
        ? visibleIds.has(o.id)
        : value === "active"
          ? !o.archived_at
          : o.status === value && !o.archived_at,
    );
  const [selected, setSelected] = useState(
    () =>
      new Set(
        snapshot
          .filter((o) => o.status === "pending" && !o.archived_at)
          .map((o) => o.id),
      ),
  );
  const [title, setTitle] = useState(
    `Producción ${new Date().toLocaleDateString("es-ES")}`,
  );
  const [names, setNames] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const pool = candidates(scope),
    chosen = pool.filter((o) => selected.has(o.id)),
    summary = productionSummary(chosen);
  const units = summary.reduce((s, r) => s + r.quantity, 0);
  const scopes: Record<string, string> = {
    pending: "Pedidos nuevos",
    ordered: "En preparación",
    ready: "En el centro",
    active: "Todos en curso",
    visible: "Vista actual (sin cancelados)",
  };
  async function download(format: "pdf" | "xlsx") {
    if (!chosen.length || busy) return;
    setBusy(format);
    setError("");
    setSuccess("");
    try {
      const { downloadProduction } = await import("@/lib/production-export");
      await downloadProduction(format, chosen, {
        title: title.trim() || "Lote de producción",
        scope: scopes[scope],
        includeNames: names,
        createdAt: new Date(),
        products,
      });
      setSuccess(
        `${format === "pdf" ? "PDF" : "Excel"} preparado. La descarga se ha iniciado.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo generar el archivo. Inténtalo de nuevo.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <dialog
      ref={dialog}
      className="production-dialog"
      aria-labelledby="production-heading"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClose={onClose}
    >
      <div className="production-top">
        <div>
          <div className="eyebrow">Box 004 · Producción</div>
          <h2 id="production-heading">Prepara tu lote.</h2>
          <p className="muted">
            Selecciona los pedidos y descarga el documento para el taller.
          </p>
        </div>
        <button
          className="btn secondary"
          disabled={!!busy}
          onClick={onClose}
          aria-label="Cerrar exportación"
        >
          Cerrar ×
        </button>
      </div>
      <div className="production-settings">
        <label>
          Nombre del lote
          <input
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Qué pedidos incluir
          <select
            value={scope}
            disabled={!!busy}
            onChange={(e) => {
              setScope(e.target.value);
              setSelected(new Set(candidates(e.target.value).map((o) => o.id)));
              setSuccess("");
            }}
          >
            {Object.entries(scopes).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="production-metrics">
        <div>
          <strong>{chosen.length}</strong>
          <span>Pedidos seleccionados</span>
        </div>
        <div>
          <strong>{units}</strong>
          <span>Prendas para fabricar</span>
        </div>
        <div>
          <strong>{summary.length}</strong>
          <span>Combinaciones</span>
        </div>
      </div>
      <div className="production-columns">
        <section>
          <div className="section-heading">
            <h3>Pedidos del lote</h3>
            <button
              className="text-button"
              disabled={!!busy || !pool.length}
              onClick={() =>
                setSelected(
                  new Set(
                    selected.size === pool.length ? [] : pool.map((o) => o.id),
                  ),
                )
              }
            >
              {selected.size === pool.length
                ? "Quitar todos"
                : "Seleccionar todos"}
            </button>
          </div>
          <div className="production-order-list">
            {pool.length ? (
              pool.map((o) => (
                <label key={o.id} className="production-check">
                  <input
                    type="checkbox"
                    disabled={!!busy}
                    checked={selected.has(o.id)}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(o.id);
                        else next.delete(o.id);
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>
                      {number(o.sequence)} · {o.first_name} {o.last_name}
                    </strong>
                    <small>
                      {statuses[o.status]} ·{" "}
                      {o.order_items.reduce((s, i) => s + i.quantity, 0)}{" "}
                      prendas ·{" "}
                      {new Date(o.created_at).toLocaleDateString("es-ES")}
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <p className="muted">
                No hay pedidos en este grupo. Selecciona otro estado.
              </p>
            )}
          </div>
        </section>
        <section>
          <h3>Resumen para fabricar</h3>
          <div className="production-table">
            <table>
              <thead>
                <tr>
                  <th>Prenda / modelo</th>
                  <th>Color</th>
                  <th>Talla</th>
                  <th>Ud.</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r, index) => (
                  <tr key={index}>
                    <td>
                      {r.product}
                      <small>{r.model}</small>
                    </td>
                    <td>{r.color}</td>
                    <td>{r.size}</td>
                    <td>
                      <strong>{r.quantity}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>Total de prendas</th>
                  <th>{units}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
      <label className="production-check">
        <input
          type="checkbox"
          checked={names}
          disabled={!!busy}
          onChange={(e) => setNames(e.target.checked)}
        />
        <span>
          Incluir nombres y notas en el Excel
          <small>
            El PDF contiene solo el resumen con fotos. Por defecto, el Excel
            lleva referencias y prendas. No incluyen teléfonos, correos ni
            importes.
          </small>
        </span>
      </label>
      <p className="muted">
        Descargar no cambia el estado de los pedidos. Puedes revisarlos y
        pasarlos a «En preparación» cuando envíes el lote.
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="notice success">
          {success}
        </p>
      )}
      <div className="production-footer">
        <span>
          PDF con resumen y fotos. Excel con dos hojas, filtros y totales.
        </span>
        <div className="actions">
          <button
            className="btn secondary"
            disabled={!chosen.length || !!busy}
            onClick={() => void download("pdf")}
          >
            {busy === "pdf" ? "Preparando PDF…" : "Descargar PDF ↓"}
          </button>
          <button
            className="btn"
            disabled={!chosen.length || !!busy}
            onClick={() => void download("xlsx")}
          >
            {busy === "xlsx" ? "Preparando Excel…" : "Descargar Excel ↓"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
