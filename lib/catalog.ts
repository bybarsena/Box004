import type { Product } from "./types";
export type Category = "Todas" | "Camisetas" | "Crop tops" | "Sudaderas";
export const categories: Category[] = [
  "Todas",
  "Camisetas",
  "Crop tops",
  "Sudaderas",
];
export function categoryOf(value: string | Product): Category {
  if (typeof value !== "string" && value.category) return value.category;
  const name = typeof value === "string" ? value : value.name;
  if (/sudadera/i.test(name)) return "Sudaderas";
  if (/crop/i.test(name)) return "Crop tops";
  return "Camisetas";
}
export function productImage(p: Product, color?: string) {
  const images = p.product_color_images || [];
  return (
    (color
      ? images.find(
          (i) => i.color.trim().toLowerCase() === color.trim().toLowerCase(),
        )
      : images.find((i) => i.color === "Portada")
    )?.image_url ||
    images[0]?.image_url ||
    ""
  );
}
export function swatch(color: string) {
  const c = color.toLowerCase();
  if (/negro|black/.test(c)) return "#191919";
  if (/blanco|white/.test(c)) return "#ffffff";
  if (/verde|green/.test(c)) return "#62725a";
  if (/gris|grey|gray/.test(c)) return "#969696";
  if (/azul|blue/.test(c)) return "#476b8e";
  if (/turquesa/.test(c)) return "#4caaaa";
  return "#d6bc8c";
}
