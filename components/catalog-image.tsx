"use client";
import type { ImgHTMLAttributes } from "react";
/** Keep the product visible if a legacy color photo no longer exists. */
export function CatalogImage({
  fallback,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { fallback?: string }) {
  return (
    <img
      {...props}
      onError={(event) => {
        const image = event.currentTarget;
        if (fallback && image.getAttribute("src") !== fallback)
          image.src = fallback;
      }}
    />
  );
}
