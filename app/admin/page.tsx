import type { Metadata, Viewport } from "next";
import { AdminInstall } from "@/components/admin-install";
export const metadata: Metadata = {
  title: "Box 004 · Administración",
  description: "Panel de pedidos de Box 004 Santiago",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Box 004 Admin",
    statusBarStyle: "default",
  },
  icons: { icon: "/admin/app-icon/192.png", apple: "/admin/app-icon/180.png" },
  robots: { index: false, follow: false },
  other: { "apple-mobile-web-app-capable": "yes" },
};
export const viewport: Viewport = { themeColor: "#1b1c1b" };
import { Brand } from "@/components/brand";
import { AdminDashboard } from "@/components/admin-dashboard";
import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="shell admin-shell">
      <header className="topbar">
        <Brand />
        <Link className="nav-link" href="/">
          ← Volver a pedidos
        </Link>
      </header>
      <div className="container">
        <AdminInstall />
        <AdminDashboard />
      </div>
    </main>
  );
}
