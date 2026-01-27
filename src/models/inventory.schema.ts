import { z } from 'zod';
import type { Database } from '../integrations/supabase/types';

/**
 * Type alias for the raw row from Supabase to use in 'satisfies'
 */
type DBInventory = Database['public']['Tables']['inventory']['Row'];

/**
 * Zod Schema for Inventory validation and transformation.
 * Using 'satisfies' to ensure it never gets out of sync with the Supabase Database types.
 */
export const inventorySchema = z.object({
    id: z.number(),
    sku: z.string().min(1, 'SKU is required'),
    quantity: z.number().nullable(),
    location: z.string().nullable(),
    location_detail: z.string().nullable(),
    warehouse: z.string().nullable(),
    status: z.string().nullable(),
    capacity: z.number().nullable(),
    location_id: z.string().nullable(),
    created_at: z.string().nullable(),
}) satisfies z.ZodType<DBInventory>;

/**
 * Application-level type inferred from the Zod Schema.
 * This is the "Truth" for the UI layer.
 */
export type InventoryModel = z.infer<typeof inventorySchema>;

/**
 * Optional: Schema for Insert/Update operations if specific validation is needed.
 */
export const insertInventorySchema = inventorySchema.omit({
    id: true,
    created_at: true
});
export type InsertInventoryRequest = z.infer<typeof insertInventorySchema>;
