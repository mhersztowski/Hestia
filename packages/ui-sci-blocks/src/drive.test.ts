/**
 * Baza wiedzy w układzie katalogów z raportu: `knowledge/{dziedzina}/{temat}.md`.
 *
 * Ten sam zestaw dokumentów co w podglądzie, tylko rozłożony po katalogach —
 * sprawdzamy, czy indeks, prerekwizyty i graf działają na ścieżkach z podfolderami.
 */
import { describe, it, expect } from 'vitest';
import { buildIndex, layoutKnowledgeGraph, learningOrder } from '@hestia/core-sci';
import { collectMarkdown, hasKnowledge, knowledgeDir } from './test/knowledge';

// The base lives on a user's drive, outside the repository — collecting it
// returns nothing when it is not on this machine, and the suite is skipped.
const files = collectMarkdown(knowledgeDir('admin'));

describe.runIf(hasKnowledge('admin'))('baza rozłożona po katalogach', () => {
  const index = buildIndex(files);

  it('wszystkie dokumenty są w podkatalogach dziedzin', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) expect(file.path).toMatch(/^[a-z-]+\/[\w-]+\.md$/);
  });

  it('indeks jest spójny mimo podkatalogów', () => {
    expect(index.issues.map((i) => `${i.path}: ${i.message}`)).toEqual([]);
  });

  it('prerekwizyty działają przez granice katalogów', () => {
    // „Orbita keplerowska" w astronomii wymaga rzutu ukośnego z mechaniki.
    const orbita = index.documents.find((d) => d.path.endsWith('orbita.md'))!;
    expect(orbita.meta.requires).toContain('Rzut ukośny z oporem powietrza');

    const layout = layoutKnowledgeGraph(index);
    const level = (fragment: string) => layout.nodes.find((n) => n.path.includes(fragment))!.level;
    expect(level('orbita')).toBeGreaterThan(level('rzut-ukosny'));
  });

  it('kolejność nauki obejmuje całą bazę', () => {
    expect(learningOrder(index).length).toBe(files.length);
  });

  it('wywód wzoru między dziedzinami jest widoczny w grafie', () => {
    const edges = layoutKnowledgeGraph(index).edges;
    // Obwód RLC (elektronika) wywodzi się z rezonansu (mechanika) — to jest
    // dokładnie ta krawędź, dla której warto mieć graf ponad katalogami.
    expect(edges.some((e) => e.from.includes('mechanika') && e.to.includes('elektronika'))).toBe(true);
  });
});
