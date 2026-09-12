/**
 * Relacje klas jako pojęcie modelu.
 *
 * Test pisany z perspektywy **generatora kodu**: chce wiedzieć „Pies dziedziczy
 * po Zwierze", a nie „krawędź ma trójkąt po lewej i linię ciągłą". Sprawdzamy
 * więc, że rodzaj relacji da się odczytać wprost, że strony są jednoznaczne
 * niezależnie od zapisu w źródle, i że zmiana rodzaju pociąga za sobą wygląd.
 */
import { describe, it, expect } from 'vitest';
import { mermaidFormat } from '../formats/mermaid';
import {
  classRelations, relationOf, setEdgeRelation, swapRelationSides,
  RELATION_LOOK, RELATION_MEANING, CLASS_RELATION_KINDS,
} from './classRelations';
import type { ClassRelationKind } from './diagram';

const parse = (text: string) => mermaidFormat.parse(`classDiagram\n  ${text}`).document;
const relacja = (text: string) => classRelations(parse(text))[0];

describe('rodzaj relacji czytany wprost ze źródła', () => {
  it.each([
    ['Zwierze <|-- Pies', 'inheritance'],
    ['Lot <|.. Pies', 'realization'],
    ['Dom *-- Pokoj', 'composition'],
    ['Zespol o-- Osoba', 'aggregation'],
    ['Zamowienie --> Pozycja', 'association'],
    ['Klient ..> Faktura', 'dependency'],
    ['A -- B', 'link'],
  ] as const)('%s → %s', (source, kind) => {
    expect(relacja(source).kind).toBe(kind);
  });
});

describe('strony relacji są jednoznaczne', () => {
  it('dziedziczenie: `from` to nadklasa, `to` podklasa', () => {
    expect(relacja('Zwierze <|-- Pies')).toMatchObject({ from: 'Zwierze', to: 'Pies' });
  });

  it('zapis odwrotny daje te same strony', () => {
    // `Pies --|> Zwierze` znaczy dokładnie to samo, co `Zwierze <|-- Pies`.
    expect(relacja('Pies --|> Zwierze')).toMatchObject({ from: 'Zwierze', to: 'Pies' });
  });

  it('kompozycja: `from` to całość', () => {
    expect(relacja('Dom *-- Pokoj')).toMatchObject({ from: 'Dom', to: 'Pokoj' });
  });

  it('asocjacja: `from` to klasa odwołująca się', () => {
    expect(relacja('Zamowienie --> Pozycja')).toMatchObject({ from: 'Zamowienie', to: 'Pozycja' });
  });

  it('krotności idą za stronami, także przy zapisie odwrotnym', () => {
    const wprost = relacja('Zamowienie "1" --> "0..*" Pozycja');
    expect(wprost).toMatchObject({ fromCardinality: '1', toCardinality: '0..*' });
    const odwrotnie = relacja('Pozycja "0..*" <-- "1" Zamowienie');
    expect(odwrotnie).toMatchObject({ from: 'Zamowienie', fromCardinality: '1', toCardinality: '0..*' });
  });

  it('opis relacji zostaje', () => {
    expect(relacja('Klient ..> Faktura : tworzy').label).toBe('tworzy');
  });
});

describe('znaczenie stron jest opisane dla każdego rodzaju', () => {
  it.each(CLASS_RELATION_KINDS)('%s ma opis stron', (kind) => {
    const meaning = RELATION_MEANING[kind];
    expect(meaning.label.length).toBeGreaterThan(0);
    expect(meaning.from.length).toBeGreaterThan(0);
    expect(meaning.to.length).toBeGreaterThan(0);
  });
});

describe('zmiana rodzaju relacji', () => {
  const doc = () => parse('Zwierze <|-- Pies');

  it.each(CLASS_RELATION_KINDS)('%s zapisuje się poprawnie w Mermaidzie', (kind) => {
    const after = setEdgeRelation(doc(), doc().edges[0].id, kind);
    // Wygląd musi wynikać z rodzaju, nie odwrotnie.
    const relation = classRelations(after)[0];
    expect(relation.kind).toBe(kind);
    // I musi przetrwać zapis oraz ponowny odczyt.
    const again = mermaidFormat.parse(mermaidFormat.serialize(after)).document;
    expect(classRelations(again)[0].kind).toBe(kind);
  });

  it('zmiana rodzaju nie odwraca stron', () => {
    const after = setEdgeRelation(doc(), doc().edges[0].id, 'composition');
    expect(classRelations(after)[0]).toMatchObject({ from: 'Zwierze', to: 'Pies' });
  });

  it('wygląd odpowiada tabeli rodzajów', () => {
    for (const kind of CLASS_RELATION_KINDS) {
      const edge = setEdgeRelation(doc(), doc().edges[0].id, kind).edges[0];
      expect(edge.lineStyle).toBe(RELATION_LOOK[kind].lineStyle);
    }
  });
});

describe('zamiana stron', () => {
  it('odwraca znaczenie relacji', () => {
    const before = parse('Zwierze <|-- Pies');
    const after = swapRelationSides(before, before.edges[0].id);
    expect(classRelations(after)[0]).toMatchObject({ from: 'Pies', to: 'Zwierze' });
  });

  it('nie zmienia rodzaju', () => {
    const before = parse('Dom *-- Pokoj');
    const after = swapRelationSides(before, before.edges[0].id);
    expect(classRelations(after)[0].kind).toBe('composition');
  });

  it('przeżywa zapis do Mermaida', () => {
    const before = parse('Zwierze <|-- Pies');
    const after = swapRelationSides(before, before.edges[0].id);
    const again = mermaidFormat.parse(mermaidFormat.serialize(after)).document;
    expect(classRelations(again)[0]).toMatchObject({ from: 'Pies', to: 'Zwierze', kind: 'inheritance' });
  });
});

describe('diagram bez zadeklarowanych relacji', () => {
  it('rodzaj odczytujemy wstecz z wyglądu', () => {
    // Krawędź zbudowana ręcznie, bez pola `relation` — tak wyglądają dokumenty
    // zapisane wcześniej albo przyniesione z formatu, który relacji nie zna.
    const doc = parse('A -- B');
    const edge = { ...doc.edges[0], relation: undefined, arrow: 'triangle' as const, lineStyle: 'dotted' as const };
    expect(relationOf(edge)).toBe('realization');
  });
});

describe('generowanie kodu na podstawie modelu', () => {
  /** Namiastka generatora — sprawdza, że model wystarcza bez znajomości Mermaida. */
  function generuj(source: string): string[] {
    const doc = mermaidFormat.parse(source).document;
    const rozszerza = new Map<string, string>();
    const implementuje = new Map<string, string[]>();
    const pola = new Map<string, string[]>();

    for (const relation of classRelations(doc)) {
      if (relation.kind === 'inheritance') rozszerza.set(relation.to, relation.from);
      if (relation.kind === 'realization') {
        implementuje.set(relation.to, [...(implementuje.get(relation.to) ?? []), relation.from]);
      }
      if (relation.kind === 'composition' || relation.kind === 'aggregation' || relation.kind === 'association') {
        const wiele = (relation.toCardinality ?? '').includes('*');
        const typ = wiele ? `List<${relation.to}>` : relation.to;
        pola.set(relation.from, [...(pola.get(relation.from) ?? []), typ]);
      }
    }

    return doc.nodes.map((node) => {
      const extend = rozszerza.get(node.id) ? ` extends ${rozszerza.get(node.id)}` : '';
      const impl = implementuje.get(node.id)?.length ? ` implements ${implementuje.get(node.id)!.join(', ')}` : '';
      const body = (pola.get(node.id) ?? []).map((t) => `${t} pole;`).join(' ');
      return `class ${node.id}${extend}${impl} { ${body}}`.replace(/\s+}/, ' }');
    });
  }

  const SOURCE = [
    'classDiagram',
    '  class Zwierze',
    '  class Pies',
    '  class Lot',
    '  class Zamowienie',
    '  class Pozycja',
    '  Zwierze <|-- Pies',
    '  Lot <|.. Pies',
    '  Zamowienie "1" --> "0..*" Pozycja',
  ].join('\n');

  it('dziedziczenie trafia do `extends`', () => {
    expect(generuj(SOURCE)).toContain('class Pies extends Zwierze implements Lot { }');
  });

  it('krotność `0..*` daje kolekcję', () => {
    expect(generuj(SOURCE).find((l) => l.startsWith('class Zamowienie'))).toContain('List<Pozycja>');
  });

  it('klasa bez relacji zostaje pusta', () => {
    expect(generuj(SOURCE)).toContain('class Zwierze { }');
  });
});
