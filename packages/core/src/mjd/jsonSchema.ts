import type { MjdDocument, MjdFieldDef } from './types';

export interface JsonSchema {
  $schema: string;
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
}

function fieldTypeToJsonSchema(field: MjdFieldDef): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (field.description) base.description = field.description;
  if (field.defaultValue !== undefined) base.default = field.defaultValue;

  switch (field.type) {
    case 'string':
      return { ...base, type: 'string' };
    case 'number':
      return { ...base, type: 'number' };
    case 'boolean':
      return { ...base, type: 'boolean' };
    case 'date':
      return { ...base, type: 'string', format: 'date-time' };
    case 'enum':
      return { ...base, type: 'string', enum: field.options ?? [] };
    case 'array':
      return {
        ...base,
        type: 'array',
        items: fieldTypeToJsonSchema({
          ...field,
          type: field.itemType ?? 'string',
          options: undefined,
          itemType: undefined,
        }),
      };
  }
}

export function generateJsonSchema(doc: MjdDocument): JsonSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of doc.fields) {
    properties[field.name] = fieldTypeToJsonSchema(field);
    if (field.required) {
      required.push(field.name);
    }
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
