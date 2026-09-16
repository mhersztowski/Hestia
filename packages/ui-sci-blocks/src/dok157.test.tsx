import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = [
  '15-7-skladanie.md',
  'Slownik.md',
  '15-1-ruch-harmoniczny.md',
  '15-2-oscylator.md',
  '15-3-ruch-prosty.md',
  '15-4-energia.md',
  '15-5-zastosowania.md',
  '15-6-okrag.md',
].map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(
    id,
    { anchors: index.anchors, formulaHome: index.formulaHome },
    '15-7-skladanie.md'
  );
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[cel.path] ?? ''
  );
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () =>
  render(
    <ReaderView
      markdown={bodies['15-7-skladanie.md']}
      path="15-7-skladanie.md"
      resolveRef={resolveRef}
    />
  );
const dokument = () => index.documents.find((d) => d.path === '15-7-skladanie.md');

describe('15-7 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('jedyny numerowany wzór to (15-30) i jest równaniem bez przypisania', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-15-eq30')).toBeTruthy();
    const wzory = dokument()?.formulas ?? [];
    expect(wzory.map((f) => f.id)).toEqual(['rh1-15-eq30']);
    expect(wzory[0].kind).toBe('relation');
    expect(wzory[0].issues).toEqual([]);
  });

  it('rysunek 15-16 ma sześć paneli pod jednym identyfikatorem', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('#ref-rh1-15-rys16 img')).toBeTruthy();
    expect(dokument()?.figures.find((f) => f.id === 'rh1-15-rys16')?.panels).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });

  it('podpis rysunku składa się z matematyką i cudzysłowami', () => {
    const { container } = widok();
    const podpis = container.querySelector('#ref-rh1-15-rys16 figcaption');
    expect(podpis?.textContent).toContain('„');
    expect(podpis?.textContent).not.toContain('$');
    expect(podpis?.querySelectorAll('.katex').length).toBeGreaterThan(5);
  });

  it('ten podrozdział nie dodaje haseł — skorowidz nie ma jego stron', () => {
    const przed = [
      '15-1-ruch-harmoniczny.md',
      '15-2-oscylator.md',
      '15-3-ruch-prosty.md',
      '15-4-energia.md',
      '15-5-zastosowania.md',
      '15-6-okrag.md',
    ];
    expect(dokument()?.terms ?? []).toHaveLength(0);
    expect(przed.length).toBe(6);
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });

  it('usterka podpisu (f) jest opisana, a nie poprawiona', () => {
    const { container } = widok();
    const tekst = container.textContent ?? '';
    // W podpisie zostaje „(f) Tak samo jak w (c)", a uwaga tłumaczy dlaczego.
    expect(tekst).toContain('(f) Tak samo jak w (c)');
    expect(tekst).toContain('a panel (f) jest wariantem');
  });
});
