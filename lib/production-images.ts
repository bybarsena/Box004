import type { Order, Product } from "./types";
import type { ProductionLine } from "./production";
import { productionSummary } from "./production";
import { productImage } from "./catalog";
export const productionImageKey = (
  row: Pick<ProductionLine, "product" | "model" | "color">,
) => JSON.stringify([row.product, row.model, row.color]);
export function productionPhotoSources(orders: Order[], products: Product[]) {
  const byVariant = new Map(
    products.flatMap((p) => p.product_variants.map((v) => [v.id, p] as const)),
  );
  return productionSummary(orders).map((row) => {
    const item = orders
      .flatMap((o) => (o.status === "cancelled" ? [] : o.order_items))
      .find(
        (i) =>
          i.product_name === row.product &&
          i.model === row.model &&
          i.color === row.color,
      );
    const product = item ? byVariant.get(item.variant_id) : undefined;
    const match = product || products.find((p) => p.name === row.product);
    return {
      key: productionImageKey(row),
      label: `${row.product} · ${row.color}`,
      urls: match
        ? [
            ...new Set(
              [productImage(match, row.color), productImage(match)].filter(
                Boolean,
              ),
            ),
          ]
        : [],
    };
  });
}
export async function loadProductionImages(
  orders: Order[],
  products: Product[],
) {
  const sources = [
    ...new Map(
      productionPhotoSources(orders, products).map((s) => [s.key, s]),
    ).values(),
  ];
  const images: Record<string, string> = {};
  const cached = new Map<string, Promise<string>>();
  function imageData(url: string): Promise<string> {
    if (cached.has(url)) return cached.get(url)!;
    const promise = new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timeout = setTimeout(() => {
        img.src = "";
        reject(new Error("image_timeout"));
      }, 12000);
      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 300;
          canvas.height = 300;
          const ctx = canvas.getContext("2d");
          if (!ctx || !img.naturalWidth) throw new Error("image_invalid");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 300, 300);
          const ratio = Math.min(
            300 / img.naturalWidth,
            300 / img.naturalHeight,
          );
          const w = img.naturalWidth * ratio,
            h = img.naturalHeight * ratio;
          ctx.drawImage(img, (300 - w) / 2, (300 - h) / 2, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("image_unavailable"));
      };
      img.src = url;
    });
    cached.set(url, promise);
    return promise;
  }
  // Small batches avoid opening a connection for every size of every garment.
  for (let offset = 0; offset < sources.length; offset += 4)
    await Promise.all(
      sources.slice(offset, offset + 4).map(async (source) => {
        for (const url of source.urls) {
          try {
            images[source.key] = await imageData(url);
            return;
          } catch {
            /* Try the product cover if an older color photo was removed. */
          }
        }
        throw new Error(
          `No se pudo cargar la foto de ${source.label}. Revisa su imagen en Prendas y vuelve a descargar el PDF.`,
        );
      }),
    );
  return images;
}
