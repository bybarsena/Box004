import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth,storage to anon,authenticated,service_role;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;grant select,insert,update on storage.objects to authenticated;`,
);
await db.exec(
  await readFile(new URL("../database/install.sql", import.meta.url), "utf8"),
);
await db.exec(
  await readFile(
    new URL("../database/visual-order-management.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec(
  await readFile(
    new URL("../database/product-types.sql", import.meta.url),
    "utf8",
  ),
);
const admin = randomUUID(),
  other = randomUUID(),
  product = randomUUID(),
  draft = randomUUID(),
  variant = randomUUID();
await db.query("insert into auth.users values($1,$2),($3,$4)", [
  admin,
  "admin@example.test",
  other,
  "other@example.test",
]);
await db.query("insert into public.admin_users values($1)", [admin]);
await db.query(
  "insert into public.products(id,name,price_cents,active) values($1,'Shirt',2500,true),($2,'Draft',3000,false)",
  [product, draft],
);
await db.query(
  "insert into public.product_variants(id,product_id,model,size,color) values($1,$2,'Unisex','M','Black')",
  [variant, product],
);
await db.exec("insert into public.discounts(code,percent) values('TEN',10)");
async function role(name, user = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`set role ${name}`);
}
await role("anon");
assert.equal((await db.query("select * from public.products")).rows.length, 1);
await assert.rejects(
  db.query("select * from public.orders"),
  /permission denied/,
);
await assert.rejects(
  db.query("select public.submit_order(null,null,null,null,null,null)"),
  /permission denied/,
);
await role("authenticated", other);
assert.equal((await db.query("select * from public.orders")).rows.length, 0);
await assert.rejects(
  db.exec("insert into public.products(name,price_cents) values('Bad',1)"),
  /row-level security/,
);
assert.equal(
  (await db.query("select * from public.admin_users")).rows.length,
  0,
);
await role("authenticated", admin);
assert.equal((await db.query("select * from public.products")).rows.length, 2);
await assert.rejects(
  db.exec("update public.orders set total_cents=0"),
  /permission denied/,
);
await assert.rejects(
  db.query("select public.submit_order(null,null,null,null,null,null)"),
  /permission denied/,
);
await role("service_role");
const customer = {
  first_name: "Test",
  last_name: "Buyer",
  email: "buyer@example.test",
  phone: "",
  notes: "",
};
const requestId = randomUUID();
async function submit({
  id = randomUUID(),
  qty = 2,
  discount = "",
  rate = "test",
  v = variant,
} = {}) {
  const r = await db.query(
    "select public.submit_order($1,$2,$3,$4,$5,$6) as receipt",
    [
      id,
      JSON.stringify(customer),
      JSON.stringify([{ variant_id: v, quantity: qty }]),
      discount,
      "web",
      rate,
    ],
  );
  return r.rows[0].receipt;
}
const first = await submit({ id: requestId, discount: "TEN" });
assert.equal(first.total_cents, 4500);
assert.equal(first.replayed, false);
const again = await submit({ id: requestId, discount: "TEN" });
assert.equal(again.order_id, first.order_id);
assert.equal(again.replayed, true);
assert.equal(
  (await db.query("select count(*)::int as n from public.orders")).rows[0].n,
  1,
);
await assert.rejects(submit({ discount: "MISSING" }), /invalid_discount/);
await assert.rejects(submit({ qty: 0 }), /invalid_quantity/);
await assert.rejects(submit({ v: randomUUID() }), /unavailable_variant/);
await role("authenticated", admin);
assert.equal((await db.query("select * from public.orders")).rows.length, 1);
await db.query(
  "update public.orders set status='ready',paid_cents=2000 where id=$1",
  [first.order_id],
);
await db.query("update public.products set price_cents=4000 where id=$1", [
  product,
]);
assert.equal(
  (await db.query("select unit_price_cents from public.order_items")).rows[0]
    .unit_price_cents,
  2500,
);
await role("authenticated", other);
assert.equal((await db.query("select * from public.orders")).rows.length, 0);
assert.equal(
  (await db.query("update public.orders set status='cancelled' returning id"))
    .rows.length,
  0,
);
await assert.rejects(
  db.exec("insert into storage.objects(bucket_id) values('product-images')"),
  /row-level security/,
);
await role("authenticated", admin);
await db.exec(
  "insert into storage.objects(bucket_id) values('product-images')",
);
// New workflow: partial payment stays open, full payment archives, reversal reopens.
await role("authenticated", admin);
assert.equal(
  (
    await db.query("select archived_at from public.orders where id=$1", [
      first.order_id,
    ])
  ).rows[0].archived_at,
  null,
);
await db.query("update public.orders set paid_cents=total_cents where id=$1", [
  first.order_id,
]);
assert.ok(
  (
    await db.query("select archived_at from public.orders where id=$1", [
      first.order_id,
    ])
  ).rows[0].archived_at,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from public.order_items where order_id=$1",
      [first.order_id],
    )
  ).rows[0].n,
  1,
);
await db.query(
  "update public.orders set paid_cents=2000,archived_at=null where id=$1",
  [first.order_id],
);
assert.equal(
  (
    await db.query("select archived_at from public.orders where id=$1", [
      first.order_id,
    ])
  ).rows[0].archived_at,
  null,
);
// One atomic save creates product, variants and images; updating keeps variant IDs/history.
const newProduct = randomUUID();
const savedRows = JSON.stringify([
  { model: "Unisex", size: "M", color: "Negro", active: true },
  { model: "Unisex", size: "L", color: "Negro", active: true },
]);
const saveArgs = [
  newProduct,
  "Nueva camiseta",
  "Test",
  2000,
  true,
  "Camisetas",
  savedRows,
  JSON.stringify([{ color: "Negro", image_url: "/images/test.png" }]),
];
const saveSql = "select public.save_catalog_product($1,$2,$3,$4,$5,$6,$7,$8)";
await db.query(saveSql, saveArgs);
const variantBefore = (
  await db.query(
    "select id from public.product_variants where product_id=$1 order by size",
    [newProduct],
  )
).rows;
await db.query(saveSql, [
  newProduct,
  "Camiseta actualizada",
  "Test",
  2200,
  true,
  "Camisetas",
  savedRows,
  "[]",
]);
assert.deepEqual(
  (
    await db.query(
      "select id from public.product_variants where product_id=$1 order by size",
      [newProduct],
    )
  ).rows,
  variantBefore,
);
assert.equal(
  (await db.query("select name from public.products where id=$1", [newProduct]))
    .rows[0].name,
  "Camiseta actualizada",
);
await assert.rejects(
  db.query(saveSql, [
    newProduct,
    "No debe guardarse",
    "",
    2200,
    true,
    "Camisetas",
    JSON.stringify([{ model: "", size: "M", color: "Negro", active: true }]),
    "[]",
  ]),
  /invalid_variant/,
);
assert.equal(
  (await db.query("select name from public.products where id=$1", [newProduct]))
    .rows[0].name,
  "Camiseta actualizada",
);
await role("authenticated", other);
await assert.rejects(db.query(saveSql, saveArgs), /admin_required/);
await role("anon");
await assert.rejects(db.query(saveSql, saveArgs), /permission denied/);

await role("service_role");
for (let i = 0; i < 30; i++) await submit({ qty: 1, rate: "limit" });
await assert.rejects(submit({ rate: "limit" }), /rate_limit/);
await role("authenticated", admin);
await db.query("update public.products set active=false where id=$1", [
  product,
]);
await role("service_role");
await assert.rejects(submit(), /unavailable_variant/);
await role("anon");
assert.equal(
  (
    await db.query(
      "select * from public.product_variants where product_id=$1",
      [product],
    )
  ).rows.length,
  0,
);
await role("authenticated", admin);
await db.query("insert into public.product_types(name) values($1)", [
  "Pantalones",
]);
await assert.rejects(
  db.query("insert into public.product_types(name) values($1)", ["pantalones"]),
  /unique/,
);
await assert.rejects(
  db.query("insert into public.product_types(name) values($1)", ["Todas"]),
  /check constraint/,
);
const customProduct = randomUUID();
await db.query(saveSql, [
  customProduct,
  "Pantalón de prueba",
  "",
  2500,
  true,
  "Pantalones",
  savedRows,
  "[]",
]);
assert.equal(
  (
    await db.query("select category from public.products where id=$1", [
      customProduct,
    ])
  ).rows[0].category,
  "Pantalones",
);
await db.query(
  "update public.product_types set name='Pantalones largos' where name='Pantalones'",
);
assert.equal(
  (
    await db.query("select category from public.products where id=$1", [
      customProduct,
    ])
  ).rows[0].category,
  "Pantalones largos",
);
await assert.rejects(
  db.query(saveSql, [
    customProduct,
    "Bad",
    "",
    2500,
    true,
    "No existe",
    savedRows,
    "[]",
  ]),
  /invalid_category/,
);
assert.equal(
  (
    await db.query("select name from public.products where id=$1", [
      customProduct,
    ])
  ).rows[0].name,
  "Pantalón de prueba",
);
await role("authenticated", other);
await assert.rejects(
  db.query("insert into public.product_types(name) values('Prohibido')"),
  /row-level security/,
);
assert.equal(
  (
    await db.query(
      "update public.product_types set name='Prohibido' where name='Pantalones largos' returning id",
    )
  ).rows.length,
  0,
);
await role("anon");
assert.ok(
  (await db.query("select name from public.product_types")).rows.some(
    (r) => r.name === "Pantalones largos",
  ),
);
await assert.rejects(
  db.query("insert into public.product_types(name) values('Prohibido')"),
  /permission denied/,
);
await db.close();
console.log(
  "PASS: custom types, duplicate validation, category rename cascade, admin-only type creation; payments archive and reopen, atomic product creation and rollback, variant IDs preserved, admin-only saves, checkout pricing, RLS, historic prices and rate limits.",
);
