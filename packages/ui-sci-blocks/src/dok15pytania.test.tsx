import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const pliki = [
  '15-Pytania.md', 'Slownik.md', '15-1-ruch-harmoniczny.md', '15-2-oscylator.md',
  '15-3-ruch-prosty.md', '15-4-energia.md', '15-5-zastosowania.md', '15-6-okrag.md',
  '15-7-skladanie.md', '15-8-dwa-ciala.md', '15-9-tlumiony.md', '15-10-rezonans.md',
].map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '15-Pytania.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['15-Pytania.md']} path="15-Pytania.md" resolveRef={resolveRef} />,
);

describe('Pytania rozdziału 15', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('trzydzieści pytań, numeracja biegnie przez przerwę', () => {
    const { container } = widok();
    const pozycje = [...container.querySelectorAll('ol > li')];
    expect(pozycje).toHaveLength(30);
    const listy = [...container.querySelectorAll('ol')];
    expect(listy).toHaveLength(2);
    expect(listy[0].getAttribute('start')).toBe('1');
    expect(listy[1].getAttribute('start')).toBe('19');
  });

  it('akapit pytania 18 stoi osobno, a nie doklejony do pozycji', () => {
    const { container } = widok();
    const akapity = [...container.querySelectorAll('p')].map((p) => p.textContent ?? '');
    expect(akapity.some((t) => t.startsWith('Czy któryś przypadek'))).toBe(true);
  });

  it('odsyłacze do rysunku i wzorów rozdziału działają', () => {
    expect(index.anchors.get('rh1-15-rys9')?.path).toBe('15-4-energia.md');
    expect(index.anchors.get('rh1-15-eq20')?.path).toBe('15-5-zastosowania.md');
    expect(index.anchors.get('rh1-15-eq26')?.path).toBe('15-5-zastosowania.md');
  });

  it('dokument ma identyfikator rozdziałowy, a pytania nie mają własnych', () => {
    expect(index.anchors.get('rh1-pyt-15')?.kind).toBe('section');
    expect(index.anchors.has('rh1-pyt-15-11')).toBe(false);
  });

  it('matematyka w pytaniach się składa', () => {
    const { container } = widok();
    expect(container.textContent).not.toContain('$');
    expect(container.querySelectorAll('ol > li .katex').length).toBeGreaterThan(10);
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
  });
});
