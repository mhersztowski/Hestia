import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';

const rozdzial = ['1-1-wielkosci.md', '1-2-si.md', '1-3-dlugosc.md', '1-4-masa.md', '1-5-czas.md'];
const pliki = [...rozdzial, 'Slownik.md']
  .map((p) => ({ path: p, markdown: readFileSync(`documents/${p}`, 'utf8') }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, '1-5-czas.md');
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(bodies[cel.path] ?? '');
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () => render(
  <ReaderView markdown={bodies['1-5-czas.md']} path="1-5-czas.md" resolveRef={resolveRef} />,
);

describe('1-5 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('tablica 1-6 ma pusty nagłówek pierwszej kolumny', () => {
    const { container } = widok();
    const tab = container.querySelector('#ref-rh1-1-tab6');
    const naglowki = [...(tab?.querySelectorAll('thead th') ?? [])].map((t) => t.textContent);
    expect(naglowki).toEqual(['', 'sekundy']);
    expect(tab?.querySelectorAll('tbody tr')).toHaveLength(15);
  });

  it('dwa rysunki: fotografia i wykres', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(container.querySelector('#ref-rh1-1-rys3 img')).toBeTruthy();
    expect(container.querySelector('#ref-rh1-1-rys4 img')).toBeTruthy();
  });

  it('dwa przypisy jako cytaty blokowe', () => {
    const { container } = widok();
    const cytaty = [...container.querySelectorAll('blockquote')].map((b) => b.textContent ?? '');
    expect(cytaty).toHaveLength(2);
    expect(cytaty[0]).toContain('Louis Essen');
    expect(cytaty[1]).toBe('* National Physical Laboratory.');
  });

  it('odsyłacz dostaje tylko hasło wyróżnione w druku kursywą', () => {
    const zrodlo = bodies['1-5-czas.md'];
    expect(zrodlo).toContain('((rh1-poj-czas-uniwersalny|czasem uniwersalnym))');
    // Pozostałe cztery hasła są w słowniku, ale bez odsyłacza z tekstu.
    expect((zrodlo.match(/\(\(rh1-poj-/g) ?? [])).toHaveLength(1);
    for (const id of ['rh1-poj-wzorzec-czasu', 'rh1-poj-zegary-atomowe',
      'rh1-poj-zegar-cezowy', 'rh1-poj-sekunda']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
  });

  it('rozdział 1 jest kompletny: sześć tablic, cztery rysunki, pięć podrozdziałów', () => {
    for (let n = 1; n <= 6; n += 1) expect(index.anchors.has(`rh1-1-tab${n}`), `tab${n}`).toBe(true);
    for (let n = 1; n <= 4; n += 1) expect(index.anchors.has(`rh1-1-rys${n}`), `rys${n}`).toBe(true);
    for (let n = 1; n <= 5; n += 1) expect(index.anchors.has(`rh1-sec-1-${n}`), `sec${n}`).toBe(true);
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
