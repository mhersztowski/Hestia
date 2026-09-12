import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const pliki = ['2-Pytania.md', '2-1-wektory.md', '2-2-dodawanie.md', '2-3-skladowe.md',
  '2-4-mnozenie.md', '2-5-prawa.md', 'Slownik.md']
  .map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '2-Pytania.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['2-Pytania.md']} path="2-Pytania.md" resolveRef={resolveRef} />,
);

describe('Pytania rozdziału 2', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('szesnaście pytań, numeracja od jedynki bez przerw', () => {
    const { container } = widok();
    expect(container.querySelectorAll('ol > li')).toHaveLength(16);
    const listy = [...container.querySelectorAll('ol')];
    expect(listy).toHaveLength(1);
    expect(listy[0].getAttribute('start')).toBe('1');
  });

  it('zapis wektorowy w pytaniach się składa', () => {
    const { container } = widok();
    expect(container.textContent).not.toContain('$');
    expect(container.querySelectorAll('ol > li .katex').length).toBeGreaterThan(5);
  });

  it('pytania nie wnoszą haseł i nie odsyłają do numerów', () => {
    const zrodlo = bodies['2-Pytania.md'];
    expect(zrodlo).not.toContain('((rh1-');
    expect(index.anchors.get('rh1-pyt-2')?.kind).toBe('section');
  });

  it('niekonsekwencje druku przepisane', () => {
    const z = bodies['2-Pytania.md'];
    expect(z).toContain('zależy od wybranego układu współrzędnych.');
    expect(z).toContain('wynosi 0, muszą leżeć w tej samej płaszczyźnie');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
  });
});
