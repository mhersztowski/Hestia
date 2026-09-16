import { describe, it, expect } from 'vitest';
import type { UmlDiagram } from '@hestia/node-devtools/format';
import { collectTypes, generateDts, jsonTypeFromTs, outputKind, planOutput } from './generate';

const node = (
  name: string,
  kind: 'class' | 'enum',
  members: ['field' | 'method', string, string?][]
) => ({
  id: name,
  type: 'umlClass' as const,
  position: { x: 0, y: 0 },
  data: {
    kind,
    name,
    members: members.map(([k, text, category], i) => ({
      id: `${name}${i}`,
      kind: k,
      text,
      category,
    })),
  },
});
const dia = (...nodes: ReturnType<typeof node>[]): UmlDiagram => ({
  id: 'd',
  name: 'D',
  nodes,
  edges: [],
});

describe('JSON Schema types', () => {
  const ref = (n: string) => `${n}.schema.json`;
  it('maps primitives, arrays, literals and references', () => {
    expect(jsonTypeFromTs('string', ref)).toEqual({ type: 'string' });
    expect(jsonTypeFromTs('int', ref)).toEqual({ type: 'number' });
    expect(jsonTypeFromTs('Pet[]', ref)).toEqual({
      type: 'array',
      items: { $ref: 'Pet.schema.json' },
    });
    expect(jsonTypeFromTs('Array<boolean>', ref)).toEqual({
      type: 'array',
      items: { type: 'boolean' },
    });
    expect(jsonTypeFromTs('"person"', ref)).toEqual({ type: 'string', const: 'person' });
    expect(jsonTypeFromTs("'a' | 'b'", ref)).toEqual({ type: 'string', enum: ['a', 'b'] });
    expect(jsonTypeFromTs('42', ref)).toEqual({ type: 'number', const: 42 });
    expect(jsonTypeFromTs('unknown', ref)).toEqual({});
  });
});

describe('collecting types across diagrams', () => {
  it('merges a type drawn twice instead of letting the emptier one win', () => {
    const rich = dia(
      node('Pet', 'class', [
        ['field', '+ name: string'],
        ['method', '+ feed(): void'],
      ])
    );
    const bare = dia(node('Pet', 'class', [['field', '+ age?: number']]));
    const { classes } = collectTypes([rich, bare]);
    expect(classes).toHaveLength(1);
    expect(classes[0].fields.map((f) => `${f.name}${f.optional ? '?' : ''}`)).toEqual([
      'name',
      'age?',
    ]);
    expect(classes[0].methods).toEqual(['feed(): void']);
  });

  it('treats the "optional" category as optional too', () => {
    const { classes } = collectTypes([
      dia(node('A', 'class', [['field', '+ x: number', 'optional']])),
    ]);
    expect(classes[0].fields[0].optional).toBe(true);
  });
});

describe('TypeScript declarations', () => {
  it('writes enums as unions and classes as interfaces', () => {
    const out = generateDts([
      dia(
        node('Kind', 'enum', [
          ['field', 'CAT'],
          ['field', 'DOG'],
        ]),
        node('Pet', 'class', [
          ['field', '- name: string'],
          ['field', '+ first-name?: string'],
          ['method', '+ feed(food: string): void'],
        ])
      ),
    ]);
    expect(out).toBe(
      [
        'export type Kind = "CAT" | "DOG";',
        '',
        'export interface Pet {',
        '  name: string;',
        '  "first-name"?: string;',
        '  feed(food: string): void;',
        '}',
        '',
      ].join('\n')
    );
  });

  it('says so when there is nothing to declare', () => {
    expect(generateDts([dia()])).toBe('// (no classes/enums in the model)\n');
  });
});

describe('planning output files', () => {
  const model = [dia(node('Pet', 'class', [['field', '+ name: string']]))];

  it('picks the generator by extension', () => {
    expect(outputKind('x/Model.schema.json')).toBe('json-schema');
    expect(outputKind('x/Model.d.ts')).toBe('dts');
    expect(outputKind('x/Model.json')).toBeNull();
  });

  it('writes a .d.ts as one file and a schema as a folder of files', () => {
    expect(planOutput('out/Model.d.ts', model).map((f) => f.path)).toEqual(['out/Model.d.ts']);
    expect(planOutput('out/Model.schema.json', model).map((f) => f.path)).toEqual([
      'out/Model/Pet.schema.json',
      'out/Model/Model.schema.json',
    ]);
    expect(planOutput('Model.schema.json', model).map((f) => f.path)).toEqual([
      'Model/Pet.schema.json',
      'Model/Model.schema.json',
    ]);
  });

  it('refuses an extension it has no generator for', () => {
    expect(() => planOutput('out/Model.json', model)).toThrow('unsupported output');
  });
});
