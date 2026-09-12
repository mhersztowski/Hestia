import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const pliki = [
  '15-8-dwa-ciala.md', 'Slownik.md', '15-1-ruch-harmoniczny.md', '15-2-oscylator.md',
  '15-3-ruch-prosty.md', '15-4-energia.md', '15-5-zastosowania.md', '15-6-okrag.md',
  '15-7-skladanie.md',
].map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '15-8-dwa-ciala.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['15-8-dwa-ciala.md']} path="15-8-dwa-ciala.md" resolveRef={resolveRef} />,
);
const dokument = () => index.documents.find((d) => d.path === '15-8-dwa-ciala.md');

describe('15-8 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('sześć wzorów z kotwicami, cztery bez przypisania', () => {
    const { container } = widok();
    for (let n = 31; n <= 36; n += 1) {
      expect(container.querySelector(`#ref-rh1-15-eq${n}`), `eq${n}`).toBeTruthy();
    }
    const rodzaje = Object.fromEntries((dokument()?.formulas ?? []).map((f) => [f.id, f.kind]));
    expect(rodzaje['rh1-15-eq31']).toBe('definition');
    expect(rodzaje['rh1-15-eq33']).toBe('definition');
    for (const n of [32, 34, 35, 36]) {
      expect(rodzaje[`rh1-15-eq${n}`], `eq${n}`).toBe('relation');
    }
  });

  it('masa zredukowana używa symbolu mu i nie zgłasza problemów', () => {
    const eq33 = dokument()?.formulas.find((f) => f.id === 'rh1-15-eq33');
    expect(eq33?.target).toBe('mu');
    expect(eq33?.issues).toEqual([]);
  });

  it('rysunek 15-17 na miejscu, dwa panele', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('#ref-rh1-15-rys17 img')).toBeTruthy();
    expect(dokument()?.figures.find((f) => f.id === 'rh1-15-rys17')?.panels).toEqual(['a', 'b']);
  });

  it('odsyłacz do hasła stoi przy wystąpieniu definiującym, nie przy zapowiedzi', () => {
    const zrodlo = bodies['15-8-dwa-ciala.md'];
    expect(zrodlo).toContain('pojęcie (*masy zredukowanej*)');
    expect(zrodlo).toContain('((rh1-poj-masa-zredukowana|masą zredukowaną)) układu');
    expect(index.anchors.get('rh1-poj-masa-zredukowana')?.kind).toBe('term');
  });

  it('odsyłacze sięgają do 15-2, 15-3 i 15-4', () => {
    expect(index.anchors.get('rh1-15-eq5')?.path).toBe('15-2-oscylator.md');
    expect(index.anchors.get('rh1-15-rys4')?.path).toBe('15-2-oscylator.md');
    expect(index.anchors.get('rh1-15-eq6')?.path).toBe('15-3-ruch-prosty.md');
    expect(index.anchors.get('rh1-15-rys9')?.path).toBe('15-4-energia.md');
  });

  it('pierwiastek szóstego stopnia z rys. 8-7a przepisany', () => {
    const { container } = widok();
    expect(bodies['15-8-dwa-ciala.md']).toContain('\\sqrt[6]{2a/b}');
    expect(container.textContent).toContain('rys. 8-7a');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
