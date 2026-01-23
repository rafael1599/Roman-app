import { z } from 'zod';

export const ZoneTypeSchema = z.enum(['HOT', 'WARM', 'COLD', 'UNASSIGNED']);

export const WarehouseZoneSchema = z.object({
  id: z.string().uuid(),
  warehouse: z.enum(['LUDLOW', 'ATS']),
  location: z.string(),
  zone: ZoneTypeSchema,
  picking_order: z.coerce.number().int().optional().nullable(),
  is_shipping_area: z.boolean().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_at: z.string().datetime().optional(),
});

export const WarehouseZoneInputSchema = z.object({
  warehouse: z.enum(['LUDLOW', 'ATS']),
  location: z.string(),
  zone: ZoneTypeSchema,
  picking_order: z.coerce.number().int().optional(),
  is_shipping_area: z.boolean().optional(),
  notes: z.string().optional(),
});

export type ZoneType = z.infer<typeof ZoneTypeSchema>;
export type WarehouseZone = z.infer<typeof WarehouseZoneSchema>;
export type WarehouseZoneInput = z.infer<typeof WarehouseZoneInputSchema>;
