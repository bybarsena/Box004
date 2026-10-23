import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export function getSupabase() {
  if (!configured)
    throw new Error(
      "La conexión con la base de datos está pendiente de configurar.",
    );
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  ));
}
export function errorMessage(e: unknown) {
  const m =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String(e.message)
        : "";
  return /fetch|network/i.test(m)
    ? "No se puede conectar con la base de datos. Inténtalo de nuevo."
    : m || "No se pudo completar la operación.";
}
