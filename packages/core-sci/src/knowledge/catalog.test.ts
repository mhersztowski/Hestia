import { describe, it, expect } from 'vitest';
import { buildIndex } from './index';
import { search, layoutKnowledgeGraph, learningOrder, tagCounts, odmiana } from './catalog';

const doc = (title: string, tags: string[], requires: string[], extra = '') => [
  '---',
  `title: ${title}`,
  `tags: [${tags.join(', ')}]`,
  ...(requires.length ? [`requires: [${requires.join(', ')}]`] : []),
  '---',
  `# ${title}`,
  '',
  extra,
].join('\n');

const files = [
  { path: 'm/wahadlo.md', markdown: doc('Wahadło matematyczne', ['mechanika', 'drgania'], [], [
    '```formula:okres',
    'T = 2\\pi\\sqrt{\\frac{L}{g}}',
    '@vars T: s, L: m, g: m/s^2',
    '```',
    '',
    '```exercise:z1',
    'Policz okres wahadła zegarowego.',
    '@answer T',
    '@uses okres',
    '```',
  ].join('\n')) },
  { path: 'm/rezonans.md', markdown: doc('Rezonans', ['mechanika', 'drgania'], ['Wahadło matematyczne']) },
  { path: 'e/rlc.md', markdown: doc('Obwód RLC', ['elektronika', 'drgania'], ['Rezonans']) },
  { path: 'a/orbita.md', markdown: doc('Orbita keplerowska', ['astronomia'], []) },
];

const index = buildIndex(files);

describe('wyszukiwanie', () => {
  it('znajduje po tytule', () => {
    expect(search(index, 'rezonans')[0].document.meta.title).toBe('Rezonans');
  });

  it('nie rozróżnia wielkości liter ani polskich znaków', () => {
    // „wahadlo" bez ogonka to najczęstsze zapytanie — musi trafiać.
    expect(search(index, 'WAHADLO')[0].document.path).toBe('m/wahadlo.md');
    expect(search(index, 'wahadło')[0].document.path).toBe('m/wahadlo.md');
  });

  it('znajduje po tagu i mówi, że to tag', () => {
    const hits = search(index, 'drgania');
    expect(hits.length).toBe(3);
    expect(hits[0].matches[0].kind).toBe('tag');
  });

  it('znajduje po nazwie wzoru i po zadaniu', () => {
    expect(search(index, 'okres')[0].matches.some((m) => m.kind === 'formula')).toBe(true);
    expect(search(index, 'zegarowego')[0].matches.some((m) => m.kind === 'exercise')).toBe(true);
  });

  it('szuka w treści, gdy dostanie treści, i pokazuje kontekst', () => {
    const bodies = { 'a/orbita.md': 'Planeta krąży po elipsie, w której ognisku stoi Słońce.' };
    const hits = search(index, 'ognisku', bodies);
    expect(hits[0].document.path).toBe('a/orbita.md');
    expect(hits[0].matches[0].detail).toContain('elipsie');
  });

  it('fragment treści nie pokazuje nagłówka YAML', () => {
    const bodies = {
      'a/orbita.md': '---\ntitle: Orbita keplerowska\ntags: [astronomia]\n---\n# Orbita\n\nPlaneta krąży po elipsie.',
    };
    const hit = search(index, 'elipsie', bodies)[0];
    expect(hit.matches.find((m) => m.kind === 'text')!.detail).not.toContain('title:');
    expect(hit.matches.find((m) => m.kind === 'text')!.detail).toContain('Planeta');
  });

  it('trafienie w tytuł waży więcej niż w treść', () => {
    const bodies = { 'a/orbita.md': 'Tu pada słowo rezonans, ale to nie jest dokument o rezonansie.' };
    expect(search(index, 'rezonans', bodies)[0].document.meta.title).toBe('Rezonans');
  });

  it('puste zapytanie nie zwraca wszystkiego', () => {
    expect(search(index, '   ')).toEqual([]);
  });

  it('brak trafień to pusta lista, nie błąd', () => {
    expect(search(index, 'kwantowa grawitacja')).toEqual([]);
  });
});

describe('układ grafu wiedzy', () => {
  const layout = layoutKnowledgeGraph(index);

  it('dokument bez prerekwizytów leży w warstwie zerowej', () => {
    expect(layout.nodes.find((n) => n.path === 'm/wahadlo.md')!.level).toBe(0);
    expect(layout.nodes.find((n) => n.path === 'a/orbita.md')!.level).toBe(0);
  });

  it('każdy dokument stoi za swoimi prerekwizytami', () => {
    const level = (path: string) => layout.nodes.find((n) => n.path === path)!.level;
    for (const edge of layout.edges) {
      expect(level(edge.to), `${edge.from} → ${edge.to}`).toBeGreaterThan(level(edge.from));
    }
  });

  it('łańcuch prerekwizytów daje kolejne warstwy', () => {
    const level = (path: string) => layout.nodes.find((n) => n.path === path)!.level;
    expect(level('m/rezonans.md')).toBe(1);
    expect(level('e/rlc.md')).toBe(2);
    expect(layout.levels).toBe(3);
  });

  it('węzły niosą to, czego potrzebuje widok', () => {
    const wahadlo = layout.nodes.find((n) => n.path === 'm/wahadlo.md')!;
    expect(wahadlo).toMatchObject({ title: 'Wahadło matematyczne', formulaCount: 1, exerciseCount: 1 });
    expect(wahadlo.tags).toContain('drgania');
  });

  it('cykl nie zapętla układu', () => {
    const zapetlony = buildIndex([
      { path: 'a.md', markdown: doc('A', ['x'], ['B']) },
      { path: 'b.md', markdown: doc('B', ['x'], ['A']) },
    ]);
    expect(() => layoutKnowledgeGraph(zapetlony)).not.toThrow();
    expect(layoutKnowledgeGraph(zapetlony).nodes.length).toBe(2);
  });
});

describe('kolejność nauki', () => {
  it('prerekwizyt zawsze przed dokumentem, który go wymaga', () => {
    const kolejnosc = learningOrder(index).map((d) => d.path);
    expect(kolejnosc.indexOf('m/wahadlo.md')).toBeLessThan(kolejnosc.indexOf('m/rezonans.md'));
    expect(kolejnosc.indexOf('m/rezonans.md')).toBeLessThan(kolejnosc.indexOf('e/rlc.md'));
  });

  it('obejmuje wszystkie dokumenty', () => {
    expect(learningOrder(index).length).toBe(index.documents.length);
  });
});

describe('tagi', () => {
  it('liczy dokumenty i sortuje od najczęstszego', () => {
    const counts = tagCounts(index);
    expect(counts[0]).toEqual({ tag: 'drgania', count: 3 });
    expect(counts.find((c) => c.tag === 'astronomia')).toEqual({ tag: 'astronomia', count: 1 });
  });
});

describe('odmiana liczebników', () => {
  const wzor = (n: number) => `${n} ${odmiana(n, ['wzór', 'wzory', 'wzorów'])}`;

  it('liczba pojedyncza', () => {
    expect(wzor(1)).toBe('1 wzór');
  });

  it('mnoga „mała" dla 2–4', () => {
    expect(wzor(2)).toBe('2 wzory');
    expect(wzor(4)).toBe('4 wzory');
    expect(wzor(23)).toBe('23 wzory');
  });

  it('dopełniacz dla 5+ i dla nastek', () => {
    expect(wzor(5)).toBe('5 wzorów');
    expect(wzor(12)).toBe('12 wzorów');
    // 12–14 to pułapka: kończą się na 2–4, ale odmieniają się jak 5+.
    expect(wzor(13)).toBe('13 wzorów');
    expect(wzor(14)).toBe('14 wzorów');
    expect(wzor(112)).toBe('112 wzorów');
  });

  it('zero jak dopełniacz', () => {
    expect(wzor(0)).toBe('0 wzorów');
  });

  it('działa dla innych rzeczowników', () => {
    expect(odmiana(1, ['zadanie', 'zadania', 'zadań'])).toBe('zadanie');
    expect(odmiana(3, ['zadanie', 'zadania', 'zadań'])).toBe('zadania');
    expect(odmiana(7, ['zadanie', 'zadania', 'zadań'])).toBe('zadań');
  });
});
