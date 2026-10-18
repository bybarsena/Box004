import { Brand } from "@/components/brand";
import { AdminDashboard } from "@/components/admin-dashboard";
import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <Brand />
        <Link className="nav-link" href="/">
          ← Volver a pedidos
        </Link>
      </header>
      <div className="container">
        <AdminDashboard />
      </div>
    </main>
  );
}
