import { z } from "zod";

export const ExpressSellOrderSchema = z.object({
  mint: z.string(),
  deposit: z.number().positive(),
  pricePerToken: z.number().min(0.000001, "Price per token must be greater than zero"),
  currency: z.string().length(3, "Currency must be exactly 3 characters"),
  paymentType: z.string().max(100, "Payment type too long"),
  additionalInstructions: z.string().max(200).optional(),
});

export type ExpressSellOrderSchemaType = z.infer<typeof ExpressSellOrderSchema>;

// Extended schema for sell orders with Flutterwave credentials
export const ExtendedExpressSellOrderSchema = ExpressSellOrderSchema.extend({
  flutterwaveCredentialId: z.string().optional(),
  usePlatformCredentials: z.boolean().optional(),
});

export type ExtendedExpressSellOrderSchemaType = z.infer<typeof ExtendedExpressSellOrderSchema>;