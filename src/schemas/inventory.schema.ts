import { z } from 'zod';
import { SKUMetadataSchema } from './skuMetadata.schema';

/**
 * Raw DB Schema - What Supabase returns from the 'inventory' table
 */
export const InventoryItemDBSchema = z.object({
  id: z.coerce.number().int().positive('ID must be a positive integer'),
  sku: z
    .string()
    .trim()
    .min(1, 'sku cannot be empty')
    .refine((s) => !s.includes(' '), 'sku cannot contain spaces'),
  quantity: z.coerce.number().int(),
  location: z.string().nullable(),
  location_id: z.string().nullable().optional(),
  sku_note: z.string().nullable().optional(),
  warehouse: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toUpperCase() : val),
    z.enum(['LUDLOW', 'ATS'])
  ),
  status: z.string().nullable().optional(),
  capacity: z.coerce.number().int().positive().optional().nullable(),
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
  sku: z
    .string()
    .trim()
    .min(1, 'sku is required')
    .transform((s) => s.replace(/\s/g, '')),
  quantity: z.coerce.number().int().nonnegative(),
  location: z.string().trim().min(1, "location is required"),
  location_id: z.string().uuid().optional().nullable(),
  sku_note: z.string().optional().nullable(),
  warehouse: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toUpperCase() : val),
    z.enum(['LUDLOW', 'ATS'])
  ),
  status: z.string().optional().nullable(),
  capacity: z.coerce.number().int().positive().optional(),
  // Internal/System fields
  force_id: z.coerce.number().int().positive().optional(),
  isReversal: z.boolean().optional(),
});

// Type exports
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type InventoryItemDB = z.infer<typeof InventoryItemDBSchema>;
export type InventoryItemInput = z.infer<typeof InventoryItemInputSchema>;

export const InventoryItemWithMetadataSchema = InventoryItemSchema.extend({
  sku_metadata: SKUMetadataSchema.nullable().optional(),
  _lastUpdateSource: z.enum(['local', 'remote']).optional(),
});

export type InventoryItemWithMetadata = z.infer<typeof InventoryItemWithMetadataSchema>;
