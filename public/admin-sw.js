/* Admin navigation is always online. Never store orders, API responses or sessions in Cache Storage. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    event.request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    !(url.pathname === "/admin" || url.pathname.startsWith("/admin/"))
  )
    return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Box 004 · Sin conexión</title><style>body{margin:0;padding:30px;min-height:90vh;display:grid;place-items:center;background:#f7f7f2;color:#1b1c1b;font:16px system-ui}main{max-width:380px}strong{font-size:30px}span{color:#c59400}h1{font-size:24px}p{line-height:1.6}a{display:inline-block;padding:14px 22px;background:#ffc400;color:#1b1c1b;border-radius:10px;text-decoration:none;font-weight:700}</style><main><strong>BOX <span>004</span></strong><h1>Necesitas conexión</h1><p>Conéctate a internet para consultar y gestionar los pedidos actualizados.</p><a href="/admin">Volver a intentar</a></main></html>`,
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        ),
    ),
  );
});
