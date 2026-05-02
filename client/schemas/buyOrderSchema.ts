import { z } from "zod";
export const CreateBuyOrderSchema = z.object({
  mint: z.string(),
  deposit: z.coerce.number().positive(),
  pricePerToken: z.number().min(0.000001, "Price per token must be greater than zero"),
  currency: z.string().length(3, "Currency must be exactly 3 characters"),
  paymentType: z.string().max(100, "Bank name too long"),
  additionalInstructions: z.string().max(200).optional(),
})

export type CreateBuyOrderSchemaType = z.infer<typeof CreateBuyOrderSchema>;