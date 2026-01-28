import { z } from 'zod';
import { InventoryItemSchema } from './inventory.schema';

/**
 * Zod schema for Picking List items (items column in picking_lists)
 */
export const PickingListItemSchema = InventoryItemSchema.extend({
    pickingQty: z.number().int().positive(),
    checked: z.boolean().optional(),
});

export type PickingListItem = z.infer<typeof PickingListItemSchema>;

/**
 * Zod schema for the picking_lists table
 */
export const PickingListSchema = z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid().nullable(),
    order_number: z.string().nullable(),
    customer_name: z.string().nullable(),
    pallets_qty: z.number().int().nonnegative().nullable(),
    status: z.enum(['active', 'ready_to_double_check', 'double_checking', 'needs_correction', 'completed']),
    items: z.array(PickingListItemSchema).nullable(),
    correction_notes: z.string().nullable(),
    checked_by: z.string().uuid().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});

export type PickingList = z.infer<typeof PickingListSchema>;
