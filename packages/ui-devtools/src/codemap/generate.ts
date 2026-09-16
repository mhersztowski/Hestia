/**
 * Output files generated from the diagrams: JSON Schema and TypeScript
 * declarations. Pure functions — the editor decides where the results go and
 * writes them through the store.
 */
import type { UmlDiagram } from '@hestia/node-devtools/format';

interface GenField {
  name: string;
  type: string;
  optional: boolean;
}

function stripSigil(text: string): string {
  let t = text.trim();
  if (t && ['+', '-', '#', '~'].includes(t[0])) t = t.slice(1).trim();
  return t;
}

function parseField(text: string): GenField {
  const t = stripSigil(text);
  const i = t.indexOf(':');
  let namePart = (i < 0 ? t : t.slice(0, i)).trim();
  const type = i < 0 ? 'any' : t.slice(i + 1).trim();
  // `name?: type` → an optional field (the `?` is not part of the property name).
  const optional = namePart.endsWith('?');
  if (optional) namePart = namePart.slice(0, -1).trim();
  return { name: namePart, type, optional };
}

/**
 * Every class and enum across ALL diagrams. A type drawn on more than one
 * diagram (often once with members, once as a bare reference) is MERGED by
 * name — fields, methods and enum values are unioned — so an emptier later
 * occurrence does not overwrite the rich one.
 */
export function collectTypes(diagrams: UmlDiagram[]): {
  classes: { name: string; fields: GenField[]; methods: string[] }[];
  enums: { name: string; values: string[] }[];
} {
  interface ClassAcc {
    name: string;
    fields: GenField[];
    fieldNames: Set<string>;
    methods: string[];
    methodSet: Set<string>;
  }
  interface EnumAcc {
    name: string;
    values: string[];
    valueSet: Set<string>;
  }
  const classes = new Map<string, ClassAcc>();
  const enums = new Map<string, EnumAcc>();
  for (const d of diagrams)
    for (const n of d.nodes) {
      const data = n.data;
      const name = (data.name || '').trim();
      if (!name) continue;
      if (data.kind === 'enum') {
        let e = enums.get(name);
        if (!e) {
          e = { name, values: [], valueSet: new Set() };
          enums.set(name, e);
        }
        for (const m of data.members) {
          if (m.kind !== 'field') continue;
          const v = stripSigil(m.text);
          if (v && !e.valueSet.has(v)) {
            e.valueSet.add(v);
            e.values.push(v);
          }
        }
      } else {
        let c = classes.get(name);
        if (!c) {
          c = { name, fields: [], fieldNames: new Set(), methods: [], methodSet: new Set() };
          classes.set(name, c);
        }
        for (const m of data.members) {
          if (m.kind === 'field') {
            const p = parseField(m.text);
            if (!p.name || c.fieldNames.has(p.name)) continue;
            c.fieldNames.add(p.name);
            c.fields.push({ ...p, optional: p.optional || m.category === 'optional' });
          } else {
            const t = stripSigil(m.text);
            if (t && !c.methodSet.has(t)) {
              c.methodSet.add(t);
              c.methods.push(t);
            }
          }
        }
      }
    }
  return {
    classes: [...classes.values()].map((c) => ({
      name: c.name,
      fields: c.fields,
      methods: c.methods,
    })),
    enums: [...enums.values()].map((e) => ({ name: e.name, values: e.values })),
  };
}

const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * A UML/TS-ish type string as a JSON Schema fragment. `ref` turns a named type
 * into a `$ref` target (a sibling file, `X.schema.json`).
 */
export function jsonTypeFromTs(ts: string, ref: (name: string) => string): Record<string, unknown> {
  const t = ts.trim().replace(/;$/, '');
  const arr = t.match(/^(.+)\[\]$/) || t.match(/^Array<(.+)>$/);
  if (arr) return { type: 'array', items: jsonTypeFromTs(arr[1], ref) };
  // Literal types are constant values, NOT references — a discriminator such as
  // `type: "person"` must become `const`, not a bogus `$ref`.
  const strLit = t.match(/^"([^"]*)"$/) || t.match(/^'([^']*)'$/);
  if (strLit) return { type: 'string', const: strLit[1] };
  if (/^(['"][^'"]*['"]\s*\|\s*)+['"][^'"]*['"]$/.test(t)) {
    return { type: 'string', enum: t.split('|').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) };
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return { type: 'number', const: Number(t) };
  if (t === 'true' || t === 'false') return { type: 'boolean', const: t === 'true' };
  switch (t.toLowerCase()) {
    case 'string':
      return { type: 'string' };
    case 'number':
    case 'int':
    case 'integer':
    case 'long':
    case 'float':
    case 'double':
      return { type: 'number' };
    case 'boolean':
    case 'bool':
      return { type: 'boolean' };
    case '':
    case 'any':
    case 'unknown':
    case 'object':
      return {};
    default:
      return { $ref: ref(t) };
  }
}

/**
 * JSON Schema split into one file per type (cross-referenced by sibling-file
 * `$ref`), plus a `{baseName}.schema.json` index that refers to every type.
 */
export function generateJsonSchemaFiles(
  diagrams: UmlDiagram[],
  baseName: string
): { name: string; content: string }[] {
  const { classes, enums } = collectTypes(diagrams);
  const ref = (n: string) => `${n}.schema.json`;
  const files: { name: string; content: string }[] = [];
  for (const e of enums) {
    files.push({
      name: `${e.name}.schema.json`,
      content:
        JSON.stringify(
          {
            $schema: JSON_SCHEMA_DIALECT,
            $id: `${e.name}.schema.json`,
            title: e.name,
            enum: e.values,
          },
          null,
          2
        ) + '\n',
    });
  }
  for (const c of classes) {
    const properties: Record<string, unknown> = {};
    for (const f of c.fields) properties[f.name] = jsonTypeFromTs(f.type, ref);
    const required = c.fields.filter((f) => !f.optional).map((f) => f.name);
    files.push({
      name: `${c.name}.schema.json`,
      content:
        JSON.stringify(
          {
            $schema: JSON_SCHEMA_DIALECT,
            $id: `${c.name}.schema.json`,
            title: c.name,
            type: 'object',
            properties,
            ...(required.length ? { required } : {}),
          },
          null,
          2
        ) + '\n',
    });
  }
  const $defs: Record<string, unknown> = {};
  for (const e of enums) $defs[e.name] = { $ref: ref(e.name) };
  for (const c of classes) $defs[c.name] = { $ref: ref(c.name) };
  files.push({
    name: `${baseName}.schema.json`,
    content:
      JSON.stringify({ $schema: JSON_SCHEMA_DIALECT, title: baseName, $defs }, null, 2) + '\n',
  });
  return files;
}

const TS_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** TypeScript declarations: enums as string unions, classes as interfaces. */
export function generateDts(diagrams: UmlDiagram[]): string {
  const { classes, enums } = collectTypes(diagrams);
  const blocks: string[] = [];
  for (const e of enums) {
    const union = e.values.length ? e.values.map((v) => JSON.stringify(v)).join(' | ') : 'never';
    blocks.push(`export type ${e.name} = ${union};`);
  }
  for (const c of classes) {
    const lines: string[] = [];
    for (const f of c.fields)
      lines.push(
        `  ${TS_IDENT.test(f.name) ? f.name : JSON.stringify(f.name)}${f.optional ? '?' : ''}: ${f.type || 'unknown'};`
      );
    for (const m of c.methods) lines.push(`  ${m.replace(/;$/, '')};`);
    blocks.push(`export interface ${c.name} {\n${lines.join('\n')}\n}`);
  }
  return (blocks.length ? blocks.join('\n\n') : '// (no classes/enums in the model)') + '\n';
}

export type OutputKind = 'json-schema' | 'dts';

/** Which generator an output path asks for — decided by the extension; `null` when none. */
export function outputKind(file: string): OutputKind | null {
  if (/\.schema\.json$/i.test(file)) return 'json-schema';
  if (/\.d\.ts$/i.test(file)) return 'dts';
  return null;
}

/**
 * The files to write for one output entry, as store paths with contents.
 *
 * `x/Model.d.ts` is one file. `x/Model.schema.json` is a folder, `x/Model/`,
 * with a file per type and `Model.schema.json` as the index — one schema per
 * type is what other tools can `$ref` individually.
 */
export function planOutput(
  file: string,
  diagrams: UmlDiagram[]
): { path: string; content: string }[] {
  const kind = outputKind(file);
  if (!kind) throw new Error(`unsupported output "${file}" — use *.schema.json or *.d.ts`);
  if (kind === 'dts') return [{ path: file, content: generateDts(diagrams) }];
  const base = (file.split('/').pop() || file).replace(/\.schema\.json$/i, '');
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  const subdir = (dir ? `${dir}/` : '') + base;
  return generateJsonSchemaFiles(diagrams, base).map((f) => ({
    path: `${subdir}/${f.name}`,
    content: f.content,
  }));
}
