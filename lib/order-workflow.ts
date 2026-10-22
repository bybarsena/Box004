import type { Order } from "./types";
export const isArchived = (o: Order) =>
  Boolean(o.archived_at) || o.status === "cancelled";
export const outstanding = (o: Order) =>
  Math.max(0, o.total_cents - o.paid_cents);
export const stageLabel: Record<string, string> = {
  pending: "Nuevo",
  ordered: "En preparación",
  ready: "En el centro",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
