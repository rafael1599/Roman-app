import { z } from 'zod';

/**
 * Enum for log action types - prevents typos like 'DEDIT' instead of 'DEDUCT'
 */
export const LogActionType = z.enum(['MOVE', 'ADD', 'EDIT', 'DEDUCT', 'DELETE']);

/**
 * Schema for inventory logs from the database
 */
export const InventoryLogSchema = z.object({
    id: z.string().uuid(),
    sku: z.string(),
    from_warehouse: z.string().nullable(),
    from_location: z.string().nullable(),
    to_warehouse: z.string().nullable(),
    to_location: z.string().nullable(),
    quantity: z.coerce.number().int(),
    prev_quantity: z.coerce.number().int().nonnegative().nullable(),
    new_quantity: z.coerce.number().int().nonnegative().nullable(),
    is_reversed: z.boolean().default(false),
    action_type: LogActionType,
    performed_by: z.string(),
    created_at: z.coerce.date(),
    previous_sku: z.string().optional().nullable(),
    item_id: z.union([z.string(), z.number()]).optional().nullable(),
});

/**
 * Schema for creating new logs
 */
export const InventoryLogInputSchema = z.object({
    sku: z.string().min(1),
    from_warehouse: z.string().optional(),
    from_location: z.string().optional(),
    to_warehouse: z.string().optional(),
    to_location: z.string().optional(),
    quantity: z.coerce.number().int().positive(),
    prev_quantity: z.coerce.number().int().nonnegative().optional(),
    new_quantity: z.coerce.number().int().nonnegative().optional(),
    is_reversed: z.boolean().optional(),
    action_type: LogActionType,
    performed_by: z.string().optional(),
    previous_sku: z.string().optional().nullable(),
    item_id: z.union([z.string(), z.number()]).optional().nullable(),
});

// Type exports
export type InventoryLog = z.infer<typeof InventoryLogSchema>;
export type InventoryLogInput = z.infer<typeof InventoryLogInputSchema>;
export type LogActionTypeValue = z.infer<typeof LogActionType>;
