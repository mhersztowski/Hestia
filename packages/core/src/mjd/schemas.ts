import { z } from 'zod';

export const mjdFieldTypeSchema = z.enum([
  'string', 'number', 'boolean', 'date', 'enum', 'array',
]);

export const mjdFieldDefSchema = z.object({
  name: z.string().min(1),
  type: mjdFieldTypeSchema,
  tags: z.array(z.string()),
  label: z.string().optional(),
  description: z.string().optional(),
  defaultValue: z.unknown().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  itemType: mjdFieldTypeSchema.optional(),
}).refine(
  (f) => f.type !== 'enum' || (f.options && f.options.length > 0),
  { message: 'Enum fields must have at least one option' },
).refine(
  (f) => f.type !== 'array' || !!f.itemType,
  { message: 'Array fields must specify itemType' },
);

export const mjdViewDefSchema = z.object({
  name: z.string().min(1),
  type: z.literal('form'),
  tag: z.string().min(1),
});

export const mjdDocumentSchema = z.object({
  version: z.string().min(1),
  tags: z.array(z.string()),
  fields: z.array(mjdFieldDefSchema),
  views: z.array(mjdViewDefSchema),
});
