/**
 * Baza wiedzy w układzie katalogów z raportu: `knowledge/{dziedzina}/{temat}.md`.
 *
 * Ten sam zestaw dokumentów co w podglądzie, tylko rozłożony po katalogach —
 * sprawdzamy, czy indeks, prerekwizyty i graf działają na ścieżkach z podfolderami.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildIndex, layoutKnowledgeGraph, learningOrder } from '@hestia/core-sci';

const DRIVE = resolve(__dirname, '../../../data/Minis/Users/admin/drive/knowledge');

/** Zbiera pliki `.md` z podkatalogów — tak jak robi to strona nad VFS. */
function collect(dir: string, prefix = ''): Array<{ path: string; markdown: string }> {
  const out: Array<{ path: string; markdown: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...collect(resolve(dir, entry.name), path));
    else if (entry.name.endsWith('.md')) out.push({ path, markdown: readFileSync(resolve(dir, entry.name), 'utf8') });
  }
  return out;
}

describe.runIf(existsSync(DRIVE))('baza rozłożona po katalogach', () => {
  const files = collect(DRIVE);
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
