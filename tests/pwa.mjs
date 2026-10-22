import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const handlers = {};
let offline = false;
vm.runInNewContext(
  await readFile(new URL("../public/admin-sw.js", import.meta.url), "utf8"),
  {
    self: {
      location: { origin: "https://box.test" },
      addEventListener: (name, fn) => (handlers[name] = fn),
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    },
    URL,
    Response,
    fetch: async () => {
      if (offline) throw new Error("offline");
      return new Response("fresh data");
    },
  },
);
async function navigate(path, mode = "navigate", method = "GET") {
  let response;
  handlers.fetch({
    request: { url: `https://box.test${path}`, mode, method },
    respondWith: (p) => (response = p),
  });
  return response;
}
assert.equal(await (await navigate("/admin")).text(), "fresh data");
offline = true;
const fallback = await navigate("/admin");
assert.equal(fallback.status, 503);
assert.equal(fallback.headers.get("cache-control"), "no-store");
assert.match(await fallback.text(), /Necesitas conexión/);
for (const p of ["/", "/api/orders", "/administrator"])
  assert.equal(await navigate(p), undefined);
assert.equal(await navigate("/admin", "cors"), undefined);
assert.equal(await navigate("/admin", "navigate", "POST"), undefined);
const base = process.env.PWA_TEST_BASE_URL;
if (base) {
  const admin = await fetch(`${base}/admin`);
  assert.equal(admin.status, 200);
  const html = await admin.text();
  assert.match(html, /rel="manifest" href="\/admin\/manifest.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  const publicPage = await (await fetch(base)).text();
  assert.doesNotMatch(publicPage, /rel="manifest"/);
  const manifest = await (
    await fetch(`${base}/admin/manifest.webmanifest`)
  ).json();
  assert.equal(manifest.start_url, "/admin");
  assert.equal(manifest.scope, "/admin");
  assert.equal(manifest.display, "standalone");
  for (const size of [180, 192, 512]) {
    const icon = await fetch(`${base}/admin/app-icon/${size}.png`);
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get("content-type"), "image/png");
    const png = Buffer.from(await icon.arrayBuffer());
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  const worker = await fetch(`${base}/admin-sw.js`);
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get("cache-control"), /no-store/);
  assert.equal(worker.headers.get("service-worker-allowed"), "/admin");
}
console.log(
  "PASS: admin-only navigation, fresh network responses, offline notice; no interception of API requests, storefront or mutations." +
    (base
      ? " Manifest, admin metadata, PNG dimensions and worker headers verified over HTTP."
      : ""),
);
