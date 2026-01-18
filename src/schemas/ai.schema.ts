import { z } from 'zod';

/**
 * AI Order Item Schema - Validates the structure returned by AI services
 */
export const AIOrderItemSchema = z.object({
    sku: z.string().min(1, 'SKU cannot be empty'),
    qty: z.coerce.number().int().positive('Quantity must be positive'),
});

/**
 * AI Order Response Schema - Validates the full response from AI scan
 */
export const AIOrderResponseSchema = z.object({
    items: z.array(AIOrderItemSchema),
});

/**
 * AI Pallet Verification Match Schema
 */
export const AIPalletMatchSchema = z.object({
    sku: z.string(),
    expected: z.coerce.number().int().nonnegative(),
    detected: z.coerce.number().int().nonnegative(),
    match: z.boolean(),
});

/**
 * AI Pallet Verification Result Schema
 */
export const AIPalletVerificationSchema = z.object({
    matched: z.array(AIPalletMatchSchema),
    missing: z.array(AIOrderItemSchema),
    extra: z.array(AIOrderItemSchema),
});

// Type exports
export type AIOrderItem = z.infer<typeof AIOrderItemSchema>;
export type AIOrderResponse = z.infer<typeof AIOrderResponseSchema>;
export type AIPalletMatch = z.infer<typeof AIPalletMatchSchema>;
export type AIPalletVerification = z.infer<typeof AIPalletVerificationSchema>;
