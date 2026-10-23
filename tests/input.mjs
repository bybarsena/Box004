import test from "node:test";
import assert from "node:assert/strict";
import { orderInput } from "../lib/order-input.ts";
import { csvText } from "../lib/csv.ts";
const good = {
  requestId: "11111111-1111-4111-8111-111111111111",
  firstName: "Ana",
  lastName: "Test",
  email: "ana@example.test",
  phone: "",
  notes: "",
  lines: [{ variantId: "22222222-2222-4222-8222-222222222222", quantity: 2 }],
};
test("reject missing contact, invalid quantities, duplicated variants and invalid email", () => {
  assert.equal(orderInput.safeParse(good).success, true);
  for (const bad of [
    { email: "" },
    { lines: [{ ...good.lines[0], quantity: 21 }] },
    { lines: [good.lines[0], good.lines[0]] },
    { email: "invalid" },
  ])
    assert.equal(orderInput.safeParse({ ...good, ...bad }).success, false);
});
test("prices from the browser are stripped; schema has no price input", () => {
  const parsed = orderInput.parse({
    ...good,
    totalCents: 1,
    lines: [{ ...good.lines[0], unitPrice: 1 }],
  });
  assert.equal("totalCents" in parsed, false);
  assert.equal("unitPrice" in parsed.lines[0], false);
});
test("CSV escapes formulas, quotes and separators", () => {
  assert.equal(
    csvText([["=SUM(1)", 'a"b', "a;b", "\t=1"]]),
    '"\'=SUM(1)";"a""b";"a;b";"\'\t=1"',
  );
});
