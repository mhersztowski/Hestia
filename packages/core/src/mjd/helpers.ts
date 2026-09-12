import type { MjdDocument, MjdFieldDef, MjdFieldType, MjdViewDef } from './types';

export function createMjdDocument(version = '1.0'): MjdDocument {
  return { version, tags: [], fields: [], views: [] };
}

export function createMjdField(name: string, type: MjdFieldType): MjdFieldDef {
  const field: MjdFieldDef = { name, type, tags: [] };
  if (type === 'enum') field.options = [];
  if (type === 'array') field.itemType = 'string';
  return field;
}

export function createMjdView(name: string, tag: string): MjdViewDef {
  return { name, type: 'form', tag };
}

/** Get fields visible in a given view (by matching tag). */
export function getFieldsForView(doc: MjdDocument, viewTag: string): MjdFieldDef[] {
  return doc.fields.filter((f) => f.tags.includes(viewTag));
}
