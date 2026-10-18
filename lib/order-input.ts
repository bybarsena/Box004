import { z } from "zod";
export const orderInput = z
  .object({
    requestId: z.uuid(),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(120),
    email: z.union([z.literal(""), z.email().max(160)]),
    phone: z.string().trim().max(40),
    notes: z.string().max(500),
    discount: z.string().trim().max(40).default(""),
    manual: z.boolean().default(false),
    lines: z
      .array(
        z.object({
          variantId: z.uuid(),
          quantity: z.number().int().min(1).max(20),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine((v) => Boolean(v.email || v.phone), "Indica un email o teléfono.")
  .refine(
    (v) => new Set(v.lines.map((l) => l.variantId)).size === v.lines.length,
    "Agrupa las prendas iguales.",
  );
