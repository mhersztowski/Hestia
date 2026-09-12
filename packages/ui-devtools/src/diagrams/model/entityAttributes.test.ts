/**
 * Edycja atrybutów encji.
 *
 * Jak przy składowych klasy, sedno jest w `raw`: to on trafia do pliku, więc
 * każda zmiana musi go przeliczyć. Testy sprawdzają nie tylko pola modelu, ale
 * i to, co z nich wychodzi w Mermaidzie.
 */
import { describe, it, expect } from 'vitest';
import { emptyDiagram, type DiagramDocument } from './diagram';
import {
  addAttribute, updateAttribute, toggleAttributeKey, removeAttribute, moveAttribute,
  formatAttribute, emptyAttribute,
} from './entityAttributes';
import { serializeErDiagram } from '../formats/mermaid/erDiagram';

function encja(): DiagramDocument {
  const doc = emptyDiagram('er');
  doc.nodes = [{
    id: 'DEVICE', label: 'DEVICE', shape: 'rectangle',
    attributes: [
      { raw: 'int id PK "autoincrement"', type: 'int', name: 'id', keys: ['PK'], comment: 'autoincrement' },
      { raw: 'string mac UK', type: 'string', name: 'mac', keys: ['UK'] },
    ],
  }];
  return doc;
}
const atrybuty = (doc: DiagramDocument) => doc.nodes[0].attributes!;
const zapis = (doc: DiagramDocument) => serializeErDiagram(doc);

describe('zapis kanoniczny atrybutu', () => {
  it.each([
    [{ type: 'int', name: 'id' }, 'int id'],
    [{ type: 'int', name: 'id', keys: ['PK'] as const }, 'int id PK'],
    [{ type: 'int', name: 'id', keys: ['PK', 'FK'] as const }, 'int id PK, FK'],
    [{ type: 'string', name: 'mac', keys: ['UK'] as const, comment: 'adres MAC' }, 'string mac UK "adres MAC"'],
    [{ type: 'string', name: 'nazwa', comment: 'bez klucza' }, 'string nazwa "bez klucza"'],
  ])('%o → %s', (attribute, expected) => {
    expect(formatAttribute({ raw: '', ...attribute })).toBe(expected);
  });

  it('nierozpoznany atrybut zostaje nietknięty', () => {
    expect(formatAttribute({ raw: 'dziwny zapis bez struktury' })).toBe('dziwny zapis bez struktury');
  });
});

describe('dodawanie i zmiana', () => {
  it('dopisuje atrybut na koniec', () => {
    expect(atrybuty(addAttribute(encja(), 'DEVICE'))).toHaveLength(3);
  });

  it('nowy atrybut ma poprawny zapis', () => {
    expect(atrybuty(addAttribute(encja(), 'DEVICE'))[2].raw).toBe('string pole');
  });

  it('nie powiela nazw', () => {
    let doc = addAttribute(encja(), 'DEVICE');
    doc = addAttribute(doc, 'DEVICE');
    const nazwy = atrybuty(doc).map((a) => a.name);
    expect(new Set(nazwy).size).toBe(nazwy.length);
  });

  it('zmienia typ i przelicza zapis', () => {
    expect(atrybuty(updateAttribute(encja(), 'DEVICE', 0, { type: 'bigint' }))[0].raw)
      .toBe('bigint id PK "autoincrement"');
  });

  it('zmienia komentarz', () => {
    expect(atrybuty(updateAttribute(encja(), 'DEVICE', 1, { comment: 'unikalny' }))[1].raw)
      .toBe('string mac UK "unikalny"');
  });

  it('pusty komentarz znika z zapisu', () => {
    expect(atrybuty(updateAttribute(encja(), 'DEVICE', 0, { comment: '' }))[0].raw).toBe('int id PK');
  });
});

describe('role kluczy', () => {
  it('przełącza klucz obcy', () => {
    expect(atrybuty(toggleAttributeKey(encja(), 'DEVICE', 0, 'FK'))[0].keys).toEqual(['PK', 'FK']);
  });

  it('powtórne przełączenie zdejmuje rolę', () => {
    const doc = toggleAttributeKey(encja(), 'DEVICE', 0, 'PK');
    expect(doc.nodes[0].attributes![0].keys).toBeUndefined();
  });

  it('role są niezależne — `PK, FK` to poprawna kombinacja', () => {
    let doc = toggleAttributeKey(encja(), 'DEVICE', 1, 'PK');
    doc = toggleAttributeKey(doc, 'DEVICE', 1, 'FK');
    expect(atrybuty(doc)[1].keys).toEqual(['UK', 'PK', 'FK']);
  });

  it('zmiana ról wychodzi do Mermaida', () => {
    expect(zapis(toggleAttributeKey(encja(), 'DEVICE', 0, 'FK'))).toContain('int id PK, FK "autoincrement"');
  });
});

describe('usuwanie i kolejność', () => {
  it('usuwa wskazany atrybut', () => {
    const after = removeAttribute(encja(), 'DEVICE', 0);
    expect(atrybuty(after)).toHaveLength(1);
    expect(atrybuty(after)[0].name).toBe('mac');
  });

  it('przesuwa atrybut w górę', () => {
    expect(atrybuty(moveAttribute(encja(), 'DEVICE', 1, 0))[0].name).toBe('mac');
  });

  it('kolejność w zapisie odpowiada kolejności na liście', () => {
    const lines = zapis(moveAttribute(encja(), 'DEVICE', 1, 0)).split('\n').map((l) => l.trim());
    expect(lines.indexOf('string mac UK')).toBeLessThan(lines.indexOf('int id PK "autoincrement"'));
  });
});

describe('nowy atrybut', () => {
  it('ma domyślny typ', () => {
    expect(emptyAttribute('x').type).toBe('string');
  });
});
