import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const pliki = [
  '15-6-okrag.md', 'Slownik.md', '15-1-ruch-harmoniczny.md', '15-2-oscylator.md',
  '15-3-ruch-prosty.md', '15-4-energia.md', '15-5-zastosowania.md',
].map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '15-6-okrag.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['15-6-okrag.md']} path="15-6-okrag.md" resolveRef={resolveRef} />,
);
const dokument = () => index.documents.find((d) => d.path === '15-6-okrag.md');

describe('15-6 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('dwa wzory z kotwicami, oba przypisania', () => {
    const { container } = widok();
    for (const n of [28, 29]) {
      expect(container.querySelector(`#ref-rh1-15-eq${n}`), `eq${n}`).toBeTruthy();
    }
    const rodzaje = Object.fromEntries((dokument()?.formulas ?? []).map((f) => [f.id, f.kind]));
    expect(rodzaje['rh1-15-eq28']).toBe('definition');
    expect(rodzaje['rh1-15-eq29']).toBe('definition');
  });

  it('(15-28) ma własny identyfikator, choć powtarza treść (15-8)', () => {
    // Rozstrzyga numer w druku, nie treść: książka nadała temu wzorowi nowy numer.
    expect(index.anchors.get('rh1-15-eq28')?.path).toBe('15-6-okrag.md');
    expect(index.anchors.get('rh1-15-eq8')?.path).toBe('15-3-ruch-prosty.md');
  });

  it('dwa rysunki na miejscu, oba ze skanu', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(2);
    for (const n of [14, 15]) {
      expect(container.querySelector(`#ref-rh1-15-rys${n} img`), `rys ${n}`).toBeTruthy();
    }
  });

  it('cztery panele rysunku 15-14 dzielą jeden identyfikator', () => {
    const rys = dokument()?.figures.find((f) => f.id === 'rh1-15-rys14');
    expect(rys?.panels).toEqual(['a', 'b', 'c', 'd']);
  });

  it('podpis rysunku 15-15 odsyła do rysunku 15-14', () => {
    const { container } = widok();
    const podpis = container.querySelector('#ref-rh1-15-rys15 figcaption');
    expect(podpis?.textContent).toContain('rys. 15-14');
    expect(podpis?.textContent).not.toContain('((');
  });

  it('odsyłacz do (15-13) wychodzi do 15-3', () => {
    expect(index.anchors.get('rh1-15-eq13')?.path).toBe('15-3-ruch-prosty.md');
  });

  it('ten podrozdział nie dodaje haseł do słownika', () => {
    // `ruch → po okręgu` ma w skorowidzu s. 364, ale książka definiuje je na
    // s. 74 — hasło czekało więc na rozdział 4 i tam (4-4) zostało postawione.
    // Tutaj sprawdzamy tylko, że 15-6 go nie stawia i się do niego nie odsyła.
    expect(bodies['Slownik.md']).not.toContain('@source 15-6');
    expect(bodies['15-6-okrag.md']).not.toContain('rh1-poj-ruch-po-okregu');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
