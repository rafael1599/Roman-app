import { z } from 'zod';

/**
 * Location Schema from the database
 */
export const LocationSchema = z.object({
  id: z.string().uuid(),
  location: z.string(),
  warehouse: z.enum(['LUDLOW', 'ATS']),
  zone: z.string().nullable(),
  max_capacity: z.coerce.number().int().positive().nullable(),
  picking_order: z.coerce.number().int().nonnegative().nullable(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  created_at: z.string().datetime(),
  length_ft: z.coerce.number().positive().nullable(),
  bike_line: z.coerce.number().int().positive().nullable(),
});

/**
 * Schema for creating/updating locations
 */
export const LocationInputSchema = z.object({
  location: z.string().min(1, 'Location name is required'),
  warehouse: z.enum(['LUDLOW', 'ATS']),
  zone: z.string().optional(),
  max_capacity: z.coerce.number().int().positive().optional(),
  picking_order: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  is_active: z.boolean().optional(),
  length_ft: z.coerce.number().positive().optional(),
  bike_line: z.coerce.number().int().positive().optional(),
});

// Type exports
export type Location = z.infer<typeof LocationSchema>;
export type LocationInput = z.infer<typeof LocationInputSchema>;
