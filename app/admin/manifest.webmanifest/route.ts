import type { MetadataRoute } from "next";
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: "/admin",
    name: "Box 004 · Administración",
    short_name: "Box 004 Admin",
    description:
      "Gestiona los pedidos, las prendas y los lotes de producción de Box 004 Santiago.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    background_color: "#f7f7f2",
    theme_color: "#1b1c1b",
    lang: "es",
    prefer_related_applications: false,
    icons: [
      {
        src: "/admin/app-icon/192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/admin/app-icon/512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/admin/app-icon/512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
