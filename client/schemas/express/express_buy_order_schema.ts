import { z } from "zod";

export const ExpressBuyOrderSchema = z.object({
  mint: z.string(),
  deposit: z.number().positive(), 
  pricePerToken: z.number().min(0.000001, "Price per token must be greater than zero"),
  currency: z.string().length(3, "Currency must be exactly 3 characters"),
  paymentType: z.string().max(100, "Bank name too long"),
  additionalInstructions: z.string().max(200).optional(),
});

export type ExpressBuyOrderSchemaType = z.infer<typeof ExpressBuyOrderSchema>;

// Extended schema for buy orders with Flutterwave credentials
export const ExtendedExpressBuyOrderSchema = ExpressBuyOrderSchema.extend({
  flutterwaveCredentialId: z.string().optional(),
  usePlatformCredentials: z.boolean().optional(),
});

export type ExtendedExpressBuyOrderSchemaType = z.infer<typeof ExtendedExpressBuyOrderSchema>;