"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
function subscribeDisplay(onChange: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function browserMode() {
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone
  )
    return "installed";
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ? "ios"
    : "browser";
}
export function AdminInstall() {
  const mode = useSyncExternalStore(
    subscribeDisplay,
    browserMode,
    () => "loading",
  );
  const [isInstalled, setInstalled] = useState(false);
  const ios = mode === "ios";
  const [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [help, setHelp] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const offer = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const installed = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/admin-sw.js", { scope: "/admin", updateViaCache: "none" })
        .catch(() => {
          /* Installation instructions remain available when service workers are unsupported. */
        });
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  async function install() {
    if (!prompt) {
      setHelp((v) => !v);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      setPrompt(null);
      if (result.outcome === "accepted")
        setMessage(
          "Instalación solicitada. Confirma los pasos del móvil y abre el icono de Box 004 Admin.",
        );
      else setHelp(true);
    } catch {
      setPrompt(null);
      setHelp(true);
    } finally {
      setBusy(false);
    }
  }
  if (isInstalled || mode === "loading" || mode === "installed") return null;
  return (
    <section
      className="admin-install panel"
      aria-label="Instalar administración"
    >
      <div className="admin-install-main">
        <div>
          <strong>El panel, a un toque.</strong>
          <p>
            Instala Box 004 Admin y abre tus pedidos desde la pantalla de
            inicio.
          </p>
        </div>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => void install()}
        >
          {busy ? "Abriendo…" : "Instalar administración"}
        </button>
      </div>
      {help && (
        <div className="admin-install-help">
          <p>
            {ios
              ? "En Safari, pulsa Compartir y después «Añadir a pantalla de inicio». Si aparece «Abrir como app», actívalo y pulsa Añadir."
              : "Abre esta página en Chrome. Pulsa el menú ⋮ y elige «Añadir a pantalla de inicio» → «Instalar». Si no aparece, recarga la página y vuelve a intentarlo."}
          </p>
          <p className="muted">
            La app necesita conexión a internet. Accederás con tu cuenta de
            administración.
          </p>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
