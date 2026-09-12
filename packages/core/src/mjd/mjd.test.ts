import { describe, it, expect } from 'vitest';
import {
  createMjdDocument,
  createMjdField,
  createMjdView,
  getFieldsForView,
} from './helpers';
import { mjdDocumentSchema, mjdFieldDefSchema } from './schemas';
import { generateJsonSchema } from './jsonSchema';
import type { MjdDocument } from './types';

describe('mjd helpers', () => {
  it('createMjdDocument uses default version and empty collections', () => {
    const doc = createMjdDocument();
    expect(doc.version).toBe('1.0');
    expect(doc.tags).toEqual([]);
    expect(doc.fields).toEqual([]);
    expect(doc.views).toEqual([]);
  });

  it('createMjdDocument respects an explicit version', () => {
    expect(createMjdDocument('2.5').version).toBe('2.5');
  });

  it('createMjdField initializes options for enum type', () => {
    const f = createMjdField('color', 'enum');
    expect(f.type).toBe('enum');
    expect(f.options).toEqual([]);
    expect(f.itemType).toBeUndefined();
  });

  it('createMjdField initializes itemType for array type', () => {
    const f = createMjdField('tags', 'array');
    expect(f.itemType).toBe('string');
    expect(f.options).toBeUndefined();
  });

  it('createMjdField leaves scalar types minimal', () => {
    const f = createMjdField('age', 'number');
    expect(f).toEqual({ name: 'age', type: 'number', tags: [] });
  });

  it('createMjdView builds a form view bound to a tag', () => {
    expect(createMjdView('Main', 'main')).toEqual({ name: 'Main', type: 'form', tag: 'main' });
  });

  describe('getFieldsForView', () => {
    const doc: MjdDocument = {
      version: '1.0',
      tags: ['a', 'b'],
      fields: [
        { name: 'f1', type: 'string', tags: ['a'] },
        { name: 'f2', type: 'string', tags: ['b'] },
        { name: 'f3', type: 'string', tags: ['a', 'b'] },
      ],
      views: [],
    };

    it('returns only fields tagged for the view', () => {
      const a = getFieldsForView(doc, 'a').map((f) => f.name);
      expect(a).toEqual(['f1', 'f3']);
    });

    it('returns empty array when no field carries the tag', () => {
      expect(getFieldsForView(doc, 'z')).toEqual([]);
    });
  });
});

describe('mjd schemas', () => {
  it('accepts a valid string field', () => {
    expect(mjdFieldDefSchema.safeParse({ name: 'x', type: 'string', tags: [] }).success).toBe(true);
  });

  it('rejects an empty field name', () => {
    expect(mjdFieldDefSchema.safeParse({ name: '', type: 'string', tags: [] }).success).toBe(false);
  });

  it('enum field requires at least one option', () => {
    expect(mjdFieldDefSchema.safeParse({ name: 'e', type: 'enum', tags: [], options: [] }).success).toBe(false);
    expect(mjdFieldDefSchema.safeParse({ name: 'e', type: 'enum', tags: [], options: ['x'] }).success).toBe(true);
  });

  it('array field requires an itemType', () => {
    expect(mjdFieldDefSchema.safeParse({ name: 'a', type: 'array', tags: [] }).success).toBe(false);
    expect(mjdFieldDefSchema.safeParse({ name: 'a', type: 'array', tags: [], itemType: 'number' }).success).toBe(true);
  });

  it('validates a full document round-trip via helpers', () => {
    const doc = createMjdDocument();
    doc.fields.push(createMjdField('name', 'string'));
    doc.views.push(createMjdView('Form', 'main'));
    expect(mjdDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe('generateJsonSchema', () => {
  it('maps scalar types and marks required fields', () => {
    const doc: MjdDocument = {
      version: '1.0',
      tags: [],
      fields: [
        { name: 'name', type: 'string', tags: [], required: true },
        { name: 'age', type: 'number', tags: [] },
        { name: 'active', type: 'boolean', tags: [] },
        { name: 'born', type: 'date', tags: [] },
      ],
      views: [],
    };
    const schema = generateJsonSchema(doc);
    expect(schema.type).toBe('object');
    expect(schema.$schema).toContain('json-schema.org');
    expect(schema.properties.name).toEqual({ type: 'string' });
    expect(schema.properties.age).toEqual({ type: 'number' });
    expect(schema.properties.active).toEqual({ type: 'boolean' });
    expect(schema.properties.born).toEqual({ type: 'string', format: 'date-time' });
    expect(schema.required).toEqual(['name']);
  });

  it('omits required key when no field is required', () => {
    const doc: MjdDocument = {
      version: '1.0', tags: [], views: [],
      fields: [{ name: 'x', type: 'string', tags: [] }],
    };
    expect(generateJsonSchema(doc).required).toBeUndefined();
  });

  it('emits enum values and includes description/default', () => {
    const doc: MjdDocument = {
      version: '1.0', tags: [], views: [],
      fields: [
        { name: 'color', type: 'enum', tags: [], options: ['red', 'blue'], description: 'a color', defaultValue: 'red' },
      ],
    };
    const prop = generateJsonSchema(doc).properties.color as Record<string, unknown>;
    expect(prop.type).toBe('string');
    expect(prop.enum).toEqual(['red', 'blue']);
    expect(prop.description).toBe('a color');
    expect(prop.default).toBe('red');
  });

  it('emits array with typed items', () => {
    const doc: MjdDocument = {
      version: '1.0', tags: [], views: [],
      fields: [{ name: 'nums', type: 'array', tags: [], itemType: 'number' }],
    };
    const prop = generateJsonSchema(doc).properties.nums as Record<string, unknown>;
    expect(prop.type).toBe('array');
    expect(prop.items).toEqual({ type: 'number' });
  });
});
