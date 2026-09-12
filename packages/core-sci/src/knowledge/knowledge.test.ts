import { describe, it, expect } from 'vitest';
import {
  buildIndex, readDocument, parseFrontMatter, learningGraph,
  allExercises, exercisesFor, documentsByTag,
} from './index';

const WAHADLO = [
  '---',
  'title: Wahadło matematyczne',
  'tags: [mechanika, drgania]',
  '---',
  '# Wahadło',
  '',
  '```formula:okres',
  'T = 2\\pi\\sqrt{\\frac{L}{g}}',
  '@vars T: s, L: m, g: m/s^2',
  '```',
  '',
  '```sim:wahadlo',
  '{}',
  '```',
  '',
  '```exercise:z1',
  'Policz okres.',
  '@given L: 1..2 m',
  '@answer T',
  '@uses okres',
  '```',
].join('\n');

const REZONANS = [
  '---',
  'title: Rezonans',
  'tags: [mechanika, drgania, elektronika]',
  'requires: [Wahadło matematyczne]',
  '---',
  '# Rezonans',
  '',
  '```formula:amplituda',
  'A = \\frac{F_0}{k}',
  '@vars A: m, F_0: N, k: N/m',
  '@derivedFrom okres',
  '```',
].join('\n');

const files = [
  { path: 'mechanika/wahadlo.md', markdown: WAHADLO },
  { path: 'mechanika/rezonans.md', markdown: REZONANS },
];

describe('nagłówek dokumentu', () => {
  it('czyta tytuł, tagi i prerekwizyty', () => {
    const { meta } = parseFrontMatter(WAHADLO);
    expect(meta.title).toBe('Wahadło matematyczne');
    expect(meta.tags).toEqual(['mechanika', 'drgania']);
    expect(parseFrontMatter(REZONANS).meta.requires).toEqual(['Wahadło matematyczne']);
  });

  it('dokument bez nagłówka bierze tytuł z pierwszego nagłówka markdown', () => {
    expect(readDocument('x.md', '# Rzut ukośny\n\ntreść').meta.title).toBe('Rzut ukośny');
  });

  it('nagłówek nie zostaje w treści', () => {
    expect(parseFrontMatter(WAHADLO).body.startsWith('# Wahadło')).toBe(true);
  });
});

describe('skan dokumentu', () => {
  const document = readDocument('mechanika/wahadlo.md', WAHADLO);

  it('znajduje wzory, zadania i symulacje', () => {
    expect(document.formulas.map((f) => f.id)).toEqual(['okres']);
    expect(document.exercises.map((e) => e.id)).toEqual(['z1']);
    expect(document.simCount).toBe(1);
  });
});

describe('indeks całej bazy', () => {
  const index = buildIndex(files);

  it('powstaje bez uwag dla spójnej bazy', () => {
    expect(index.issues).toEqual([]);
  });

  it('wie, w którym dokumencie mieszka wzór', () => {
    expect(index.formulaHome.get('okres')).toBe('mechanika/wahadlo.md');
    expect(index.formulaHome.get('amplituda')).toBe('mechanika/rezonans.md');
  });

  it('duplikat wzoru między dokumentami jest błędem', () => {
    const zDuplikatem = buildIndex([...files, { path: 'inne/kopia.md', markdown: WAHADLO }]);
    expect(zDuplikatem.issues.some((i) => /dwóch dokumentach/.test(i.message))).toBe(true);
  });

  it('wywód do wzoru spoza bazy jest błędem', () => {
    const zWiszacym = buildIndex([{
      path: 'x.md',
      markdown: '```formula:a\nA = 1\n@derivedFrom nieistnieje\n```',
    }]);
    expect(zWiszacym.issues.some((i) => i.message.includes('nieistnieje'))).toBe(true);
  });

  it('wywód do innego dokumentu jest poprawny — to sedno grafu wiedzy', () => {
    // `amplituda` w rezonansie wywodzi się z `okres` w wahadle i to musi przejść.
    expect(index.issues.filter((i) => i.formulaId === 'amplituda')).toEqual([]);
  });

  it('zadanie odwołujące się do nieistniejącego wzoru jest zgłaszane', () => {
    const zle = buildIndex([{
      path: 'x.md',
      markdown: '```exercise:z\nTreść.\n@answer T\n@uses nieistnieje\n```',
    }]);
    expect(zle.issues.some((i) => i.message.includes('nieistnieje'))).toBe(true);
  });

  it('brakujący prerekwizyt jest zgłaszany', () => {
    const zle = buildIndex([{ path: 'x.md', markdown: '---\nrequires: [Nie ma tego]\n---\n# X' }]);
    expect(zle.issues.some((i) => /wymaga/.test(i.message))).toBe(true);
  });
});

describe('katalog powstaje ze skanu', () => {
  const index = buildIndex(files);

  it('lista zadań całej bazy', () => {
    expect(allExercises(index).map(({ exercise }) => exercise.id)).toEqual(['z1']);
  });

  it('zadania dotyczące danego wzoru', () => {
    expect(exercisesFor(index, 'okres').length).toBe(1);
    expect(exercisesFor(index, 'amplituda')).toEqual([]);
  });

  it('dokumenty po tagu', () => {
    expect(documentsByTag(index, 'drgania').length).toBe(2);
    expect(documentsByTag(index, 'elektronika').map((d) => d.meta.title)).toEqual(['Rezonans']);
  });
});

describe('graf wiedzy', () => {
  const edges = learningGraph(buildIndex(files));

  it('prerekwizyt daje krawędź między dokumentami', () => {
    expect(edges).toContainEqual({
      from: 'mechanika/wahadlo.md', to: 'mechanika/rezonans.md', kind: 'requires',
    });
  });

  it('wywód wzoru z innego dokumentu też daje krawędź', () => {
    expect(edges).toContainEqual({
      from: 'mechanika/wahadlo.md', to: 'mechanika/rezonans.md', kind: 'derivedFrom',
    });
  });

  it('wywód wewnątrz jednego dokumentu nie tworzy pętli', () => {
    const jeden = buildIndex([{
      path: 'x.md',
      markdown: ['```formula:a\nA = 1\n```', '```formula:b\nB = A\n@derivedFrom a\n```'].join('\n'),
    }]);
    expect(learningGraph(jeden)).toEqual([]);
  });
});
