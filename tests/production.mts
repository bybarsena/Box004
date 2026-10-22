import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { productionSummary } from "../lib/production";
import { productionPdf, productionExcel } from "../lib/production-export";
import type { Order } from "../lib/types";
const item = {
  id: "i",
  variant_id: "v",
  product_name: "Camiseta Athlete",
  model: "Unisex",
  size: "M",
  color: "Negro",
  quantity: 2,
  unit_price_cents: 2000,
};
const order = {
  id: "one",
  sequence: 1,
  created_at: "2026-10-22T10:00:00Z",
  first_name: "Cliente",
  last_name: "de prueba",
  email: "not-in-export@example.test",
  phone: "private-phone",
  notes: "=SUM(A1:A2)",
  admin_notes: "Revisar serigrafía",
  source: "web",
  status: "pending",
  subtotal_cents: 4000,
  total_cents: 4000,
  discount_code: null,
  discount_cents: 0,
  paid_cents: 0,
  archived_at: null,
  order_items: [item],
} satisfies Order;
const input = [
  order,
  {
    ...order,
    id: "two",
    sequence: 2,
    order_items: [
      { ...item, quantity: 3 },
      { ...item, id: "b", size: "XL", quantity: 1 },
    ],
  },
  {
    ...order,
    id: "cancelled",
    status: "cancelled",
    order_items: [{ ...item, quantity: 100 }],
  },
];
assert.deepEqual(
  productionSummary(input).map((r) => [r.size, r.quantity]),
  [
    ["M", 5],
    ["XL", 1],
  ],
);
const options = {
  title: "Producción octubre · Box 004",
  scope: "Pedidos nuevos",
  includeNames: false,
  createdAt: new Date("2026-10-22T10:00:00Z"),
};
const wb = await productionExcel(input, options);
assert.equal(wb.worksheets.length, 2);
assert.equal(wb.worksheets[0].getCell("E8").value, 5);
assert.deepEqual(wb.worksheets[0].getCell("E10").value, {
  formula: "SUM(E8:E9)",
  result: 6,
});
const json = JSON.stringify(wb.model);
for (const privateValue of [
  order.email,
  order.phone,
  order.first_name,
  order.notes,
  order.admin_notes,
])
  assert.ok(!json.includes(privateValue));
assert.ok(wb.worksheets[1].getCell("B8").value instanceof Date);
const named = await productionExcel(input, { ...options, includeNames: true });
const note = named.worksheets[1].getCell("J8");
assert.equal(note.value, order.notes);
assert.equal(note.type, 3); // text, never executable formula
const pdf = await productionPdf(input, options);
assert.equal(pdf.getNumberOfPages(), 2);
const long = Array.from({ length: 90 }, (_, i) => ({
  ...order,
  id: String(i),
  sequence: i + 1,
  order_items: [
    {
      ...item,
      product_name: `Camiseta edición especial ${i} con nombre largo para impresión`,
      size: i % 2 ? "M" : "XL",
      quantity: 1,
    },
  ],
}));
const big = await productionPdf(long, { ...options, includeNames: true });
assert.ok(big.getNumberOfPages() > 3);
await assert.rejects(() =>
  productionExcel([{ ...order, status: "cancelled" }], options),
);
await mkdir("/tmp/box004-export-check", { recursive: true });
await writeFile(
  "/tmp/box004-export-check/production.pdf",
  Buffer.from(pdf.output("arraybuffer")),
);
await writeFile(
  "/tmp/box004-export-check/production-long.pdf",
  Buffer.from(big.output("arraybuffer")),
);
await wb.xlsx.writeFile("/tmp/box004-export-check/production.xlsx");
console.log(
  "Production exports verified: grouping, totals, cancellations, private fields, typed dates, text safety, PDF pagination and XLSX files.",
);
