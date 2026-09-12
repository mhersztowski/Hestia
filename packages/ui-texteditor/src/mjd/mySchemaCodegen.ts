// mySchemaCodegen — turn a *.myschema.json document (classes + enums) into a
// JSON Schema (draft-07) and a TypeScript .d.ts. Pure functions (no I/O).

export interface SchemaType {
  kind: 'text' | 'number' | 'boolean' | 'ref';
  default?: string | number | boolean;
  ref?: string;
}
export interface MySchemaDoc {
  classes?: Record<string, { fields?: Record<string, SchemaType> }>;
  enums?: Record<string, { values?: unknown[] }>;
}

function asDoc(value: unknown): MySchemaDoc {
  const v = (value && typeof value === 'object') ? (value as MySchemaDoc) : {};
  return {
    classes: v.classes && typeof v.classes === 'object' ? v.classes : {},
    enums: v.enums && typeof v.enums === 'object' ? v.enums : {},
  };
}

// ── JSON Schema (draft-07) ──────────────────────────────────────────────────
function jsonTypeForField(t: SchemaType): Record<string, unknown> {
  switch (t.kind) {
    case 'number': return { type: 'number', default: typeof t.default === 'number' ? t.default : 0 };
    case 'boolean': return { type: 'boolean', default: !!t.default };
    case 'ref': return { $ref: `#/$defs/${t.ref ?? ''}` };
    case 'text':
    default: return { type: 'string', default: t.default != null ? String(t.default) : '' };
  }
}

export function generateJsonSchema(value: unknown, title: string): string {
  const doc = asDoc(value);
  const $defs: Record<string, unknown> = {};

  for (const [name, def] of Object.entries(doc.enums ?? {})) {
    const values = Array.isArray(def?.values) ? def!.values! : [];
    $defs[name] = { title: name, enum: values };
  }
  for (const [name, def] of Object.entries(doc.classes ?? {})) {
    const fields = def?.fields && typeof def.fields === 'object' ? def.fields : {};
    const properties: Record<string, unknown> = {};
    for (const [fname, ftype] of Object.entries(fields)) properties[fname] = jsonTypeForField(ftype);
    $defs[name] = { title: name, type: 'object', properties };
  }

  return JSON.stringify({
    // Use the 2020-12 dialect because `$defs` (and `#/$defs/...` $refs) are the
    // standard keyword there — keeps the declared dialect consistent with the
    // output so any validator / the editor's JSON language service resolves it.
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title,
    $defs,
  }, null, 2) + '\n';
}

// ── TypeScript .d.ts ────────────────────────────────────────────────────────
function tsType(t: SchemaType): string {
  switch (t.kind) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'ref': return t.ref?.trim() || 'unknown';
    case 'text':
    default: return 'string';
  }
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const propKey = (name: string): string => (IDENT.test(name) ? name : JSON.stringify(name));

export function generateDts(value: unknown): string {
  const doc = asDoc(value);
  const blocks: string[] = [];

  for (const [name, def] of Object.entries(doc.enums ?? {})) {
    const values = Array.isArray(def?.values) ? def!.values! : [];
    const union = values.length ? values.map((v) => JSON.stringify(String(v))).join(' | ') : 'never';
    blocks.push(`export type ${name} = ${union};`);
  }
  for (const [name, def] of Object.entries(doc.classes ?? {})) {
    const fields = def?.fields && typeof def.fields === 'object' ? def.fields : {};
    const lines = Object.entries(fields).map(([fname, ftype]) => `  ${propKey(fname)}: ${tsType(ftype)};`);
    blocks.push(`export interface ${name} {\n${lines.join('\n')}\n}`);
  }

  return (blocks.length ? blocks.join('\n\n') : '// (empty schema)') + '\n';
}
