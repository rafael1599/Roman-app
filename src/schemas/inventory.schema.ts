import { z } from 'zod';
import { SKUMetadataSchema } from './skuMetadata.schema';

/**
 * Raw DB Schema - What Supabase returns from the 'inventory' table
 */
export const InventoryItemDBSchema = z.object({
    id: z.union([z.string(), z.number()]),
    SKU: z.string().trim().min(1, 'SKU cannot be empty').refine(s => !s.includes(' '), 'SKU cannot contain spaces'),
    Quantity: z.coerce.number().int().nonnegative(),
    Location: z.string().nullable(),
    location_id: z.string().nullable().optional(),
    Location_Detail: z.string().nullable().optional(),
    Warehouse: z.enum(['LUDLOW', 'ATS']),
    Status: z.string().nullable().optional(),
    Capacity: z.coerce.number().int().positive().optional().nullable(),
    created_at: z.coerce.date(),
});

/**
 * Frontend Schema
 */
export const InventoryItemSchema = InventoryItemDBSchema;

/**
 * Schema for creating/updating inventory items
 */
export const InventoryItemInputSchema = z.object({
    SKU: z.string().trim().min(1, 'SKU is required').transform(s => s.replace(/\s/g, '')),
    Quantity: z.coerce.number().int().nonnegative(),
    Location: z.string().optional(),
    location_id: z.string().uuid().optional().nullable(),
    Location_Detail: z.string().optional().nullable(),
    Warehouse: z.enum(['LUDLOW', 'ATS']),
    Status: z.string().optional().nullable(),
    Capacity: z.coerce.number().int().positive().optional(),
});

// Type exports
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type InventoryItemDB = z.infer<typeof InventoryItemDBSchema>;
export type InventoryItemInput = z.infer<typeof InventoryItemInputSchema>;

export const InventoryItemWithMetadataSchema = InventoryItemSchema.extend({
    sku_metadata: SKUMetadataSchema.nullable().optional()
});

export type InventoryItemWithMetadata = z.infer<typeof InventoryItemWithMetadataSchema>;
