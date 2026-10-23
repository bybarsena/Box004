import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Box 004 · Pedidos",
  description: "Reserva tu equipación Box 004",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
