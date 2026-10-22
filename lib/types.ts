export type Variant = {
  id: string;
  product_id: string;
  model: string;
  size: string;
  color: string;
  active: boolean;
};
export type Photo = {
  id: string;
  product_id: string;
  color: string;
  image_url: string;
};
export type Product = {
  category?: string;
  id: string;
  name: string;
  description: string;
  price_cents: number;
  active: boolean;
  product_variants: Variant[];
  product_color_images: Photo[];
};
export type Item = {
  variant_id: string;
  id: string;
  product_name: string;
  model: string;
  size: string;
  color: string;
  quantity: number;
  unit_price_cents: number;
};
export type Order = {
  archived_at: string | null;
  id: string;
  sequence: number;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string;
  admin_notes: string;
  source: string;
  status: string;
  subtotal_cents: number;
  discount_code: string | null;
  discount_cents: number;
  total_cents: number;
  paid_cents: number;
  order_items: Item[];
};
export type Discount = {
  eligible_product_ids: string[] | null;
  code: string;
  percent: number;
  active: boolean;
  expires_at: string | null;
};
export const statuses: Record<string, string> = {
  pending: "Nuevo",
  ordered: "En preparación",
  ready: "En el centro",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
export const money = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    n / 100,
  );
export const number = (n: number) => `004-${String(n).padStart(5, "0")}`;

export type ProductType = { id: string; name: string; created_at: string };
