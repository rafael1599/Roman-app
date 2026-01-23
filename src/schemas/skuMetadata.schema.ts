import { z } from 'zod';

export const SKUMetadataSchema = z.object({
  sku: z.string(),
  length_ft: z.coerce.number().default(5),
  width_in: z.coerce.number().default(6),
  created_at: z.coerce.date().optional(),
});

export type SKUMetadata = z.infer<typeof SKUMetadataSchema>;

export const SKUMetadataInputSchema = SKUMetadataSchema.omit({ created_at: true });
export type SKUMetadataInput = z.infer<typeof SKUMetadataInputSchema>;
