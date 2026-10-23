import { Brand } from "@/components/brand";
import { OrderFlow } from "@/components/order-flow";
import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <Brand />
        <Link className="nav-link" href="/admin">
          Administración →
        </Link>
      </header>
      <div className="container">
        <section className="hero">
          <div className="eyebrow">Equipación oficial · Box 004</div>
          <h1>Elige. Reserva. Entrena.</h1>
          <p>
            Configura tus prendas, añade todo lo que necesites y envía el
            pedido. El equipo de Box 004 se encargará del resto.
          </p>
        </section>
        <OrderFlow />
      </div>
    </main>
  );
}
