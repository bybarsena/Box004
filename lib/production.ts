import type { Order } from "./types";
export type ProductionLine = {
  product: string;
  model: string;
  color: string;
  size: string;
  quantity: number;
};
export function productionSummary(orders: Order[]): ProductionLine[] {
  const groups = new Map<string, ProductionLine>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    for (const i of o.order_items) {
      const key = JSON.stringify([i.product_name, i.model, i.color, i.size]);
      const row = groups.get(key);
      if (row) row.quantity += i.quantity;
      else
        groups.set(key, {
          product: i.product_name,
          model: i.model,
          color: i.color,
          size: i.size,
          quantity: i.quantity,
        });
    }
  }
  const sizes = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
  return [...groups.values()].sort((a, b) => {
    for (const field of ["product", "model", "color"] as const) {
      const diff = a[field].localeCompare(b[field], "es", { numeric: true });
      if (diff) return diff;
    }
    const ai = sizes.indexOf(a.size.toUpperCase()),
      bi = sizes.indexOf(b.size.toUpperCase());
    return ai >= 0 && bi >= 0
      ? ai - bi
      : a.size.localeCompare(b.size, "es", { numeric: true });
  });
}
export function productionOrders(orders: Order[]) {
  return orders
    .filter((o) => o.status !== "cancelled")
    .toSorted((a, b) => a.sequence - b.sequence);
}
