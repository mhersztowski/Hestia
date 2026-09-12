/**
 * Edycja specyfikacji klasy.
 *
 * Sedno: składowa trzyma zapis źródłowy w `raw` i to on trafia do pliku. Każda
 * zmiana musi go przeliczyć — inaczej edytor pokazuje jedno, a zapis niesie co
 * innego. Testy sprawdzają więc nie tylko pola modelu, ale i to, co z nich
 * wychodzi w Mermaidzie.
 */
import { describe, it, expect } from 'vitest';
import { emptyDiagram, type DiagramDocument } from './diagram';
import {
  addMember, updateMember, removeMember, moveMember, setStereotype, formatMember, emptyMember,
} from './classMembers';
import { serializeClassDiagram } from '../formats/mermaid/classDiagram';

function klasa(): DiagramDocument {
  const doc = emptyDiagram('class');
  doc.nodes = [{
    id: 'Zwierze', label: 'Zwierze', shape: 'rectangle',
    members: [
      { raw: '+String imie', kind: 'field', visibility: 'public', type: 'String', name: 'imie' },
      { raw: '+opis() String', kind: 'method', visibility: 'public', name: 'opis', type: 'String' },
    ],
  }];
  return doc;
}
const members = (doc: DiagramDocument) => doc.nodes[0].members!;
const zapis = (doc: DiagramDocument) => serializeClassDiagram(doc);

describe('zapis kanoniczny składowej', () => {
  it.each([
    [{ kind: 'field', visibility: 'public', type: 'String', name: 'imie' }, '+String imie'],
    [{ kind: 'field', visibility: 'private', type: 'int', name: 'wiek' }, '-int wiek'],
    [{ kind: 'field', visibility: 'protected', name: 'stan' }, '#stan'],
    [{ kind: 'field', visibility: 'package', type: 'bool', name: 'flaga' }, '~bool flaga'],
    [{ kind: 'method', visibility: 'public', name: 'opis', type: 'String' }, '+opis() String'],
    [{ kind: 'method', visibility: 'public', name: 'sum', params: 'int a, int b', type: 'int' }, '+sum(int a, int b) int'],
    [{ kind: 'method', visibility: 'public', name: 'policz', isStatic: true, type: 'int' }, '+policz()$ int'],
    [{ kind: 'method', visibility: 'public', name: 'rysuj', isAbstract: true }, '+rysuj()*'],
    [{ kind: 'field', visibility: 'public', type: 'int', name: 'licznik', isStatic: true }, '+int licznik$'],
  ] as const)('%o → %s', (member, expected) => {
    expect(formatMember({ raw: '', ...member })).toBe(expected);
  });

  it('nierozpoznana składowa zostaje nietknięta', () => {
    // Rozbiór się nie udał (brak `name`), więc nie wolno nam zapisu odtwarzać.
    expect(formatMember({ raw: '+Map~String, int~ dane', kind: 'field' })).toBe('+Map~String, int~ dane');
  });
});

describe('dodawanie', () => {
  it('dopisuje pole na koniec', () => {
    const after = addMember(klasa(), 'Zwierze', 'field');
    expect(members(after)).toHaveLength(3);
    expect(members(after)[2].kind).toBe('field');
  });

  it('nowa składowa ma od razu poprawny zapis', () => {
    const after = addMember(klasa(), 'Zwierze', 'method');
    expect(members(after)[2].raw).toBe('+metoda()');
  });

  it('nie powiela nazw', () => {
    let doc = addMember(klasa(), 'Zwierze', 'field');
    doc = addMember(doc, 'Zwierze', 'field');
    const nazwy = members(doc).map((m) => m.name);
    expect(new Set(nazwy).size).toBe(nazwy.length);
  });

  it('działa na klasie bez ciała', () => {
    const doc = emptyDiagram('class');
    doc.nodes = [{ id: 'Pusta', label: 'Pusta', shape: 'rectangle' }];
    expect(addMember(doc, 'Pusta', 'field').nodes[0].members).toHaveLength(1);
  });
});

describe('zmiana składowej', () => {
  it('zmienia nazwę i przelicza zapis', () => {
    const after = updateMember(klasa(), 'Zwierze', 0, { name: 'nazwa' });
    expect(members(after)[0].raw).toBe('+String nazwa');
  });

  it('zmienia widoczność', () => {
    expect(members(updateMember(klasa(), 'Zwierze', 0, { visibility: 'private' }))[0].raw).toBe('-String imie');
  });

  it('zmienia typ', () => {
    expect(members(updateMember(klasa(), 'Zwierze', 1, { type: 'void' }))[1].raw).toBe('+opis() void');
  });

  it('dodaje parametry metody', () => {
    expect(members(updateMember(klasa(), 'Zwierze', 1, { params: 'bool krotki' }))[1].raw)
      .toBe('+opis(bool krotki) String');
  });

  it('modyfikatory wykluczają się nawzajem', () => {
    let doc = updateMember(klasa(), 'Zwierze', 1, { isAbstract: true });
    doc = updateMember(doc, 'Zwierze', 1, { isStatic: true });
    expect(members(doc)[1].isAbstract).toBe(false);
    expect(members(doc)[1].raw).toBe('+opis()$ String');
  });

  it('nie rusza pozostałych składowych', () => {
    const after = updateMember(klasa(), 'Zwierze', 0, { name: 'nazwa' });
    expect(members(after)[1].raw).toBe('+opis() String');
  });

  it('zmiana rodzaju z pola na metodę daje nawiasy', () => {
    expect(members(updateMember(klasa(), 'Zwierze', 0, { kind: 'method' }))[0].raw).toBe('+imie() String');
  });
});

describe('usuwanie i kolejność', () => {
  it('usuwa wskazaną składową', () => {
    const after = removeMember(klasa(), 'Zwierze', 0);
    expect(members(after)).toHaveLength(1);
    expect(members(after)[0].name).toBe('opis');
  });

  it('przesuwa składową w górę', () => {
    expect(members(moveMember(klasa(), 'Zwierze', 1, 0))[0].name).toBe('opis');
  });

  it('przesunięcie poza zakres nic nie psuje', () => {
    expect(members(moveMember(klasa(), 'Zwierze', 0, 9))).toHaveLength(2);
  });
});

describe('stereotyp', () => {
  it('ustawia adnotację', () => {
    expect(setStereotype(klasa(), 'Zwierze', 'interface').nodes[0].stereotype).toBe('interface');
  });

  it('pusty tekst adnotację zdejmuje', () => {
    const doc = setStereotype(klasa(), 'Zwierze', 'interface');
    expect(setStereotype(doc, 'Zwierze', '  ').nodes[0].stereotype).toBeUndefined();
  });
});

describe('zmiany wychodzą do Mermaida', () => {
  it('dodane pole pojawia się w zapisie', () => {
    let doc = addMember(klasa(), 'Zwierze', 'field');
    doc = updateMember(doc, 'Zwierze', 2, { name: 'wiek', type: 'int', visibility: 'private' });
    expect(zapis(doc)).toContain('-int wiek');
  });

  it('usunięte pole znika z zapisu', () => {
    expect(zapis(removeMember(klasa(), 'Zwierze', 0))).not.toContain('imie');
  });

  it('kolejność w zapisie odpowiada kolejności na liście', () => {
    const lines = zapis(moveMember(klasa(), 'Zwierze', 1, 0)).split('\n').map((l) => l.trim());
    expect(lines.indexOf('+opis() String')).toBeLessThan(lines.indexOf('+String imie'));
  });

  it('stereotyp trafia do zapisu', () => {
    expect(zapis(setStereotype(klasa(), 'Zwierze', 'interface'))).toContain('<<interface>>');
  });

  it('pusta składowa nie tworzy niepoprawnej linii', () => {
    // Świeżo dodana składowa ma nazwę zastępczą, więc zapis pozostaje poprawny.
    expect(zapis(addMember(klasa(), 'Zwierze', 'field'))).toContain('+pole');
  });
});

describe('nowa składowa', () => {
  it('pole ma domyślnie widoczność publiczną', () => {
    expect(emptyMember('field', 'x').visibility).toBe('public');
  });

  it('metoda ma nawiasy w zapisie', () => {
    expect(emptyMember('method', 'x').raw).toBe('+x()');
  });
});
