import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['1-3-dlugosc.md', '1-1-wielkosci.md', '1-2-si.md', 'Slownik.md'].map((p) => ({
  path: p,
  markdown: readDocument(p),
}));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(
    id,
    { anchors: index.anchors, formulaHome: index.formulaHome },
    '1-3-dlugosc.md'
  );
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[cel.path] ?? ''
  );
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () =>
  render(
    <ReaderView markdown={bodies['1-3-dlugosc.md']} path="1-3-dlugosc.md" resolveRef={resolveRef} />
  );

describe('1-3 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('dwie tablice i jeden rysunek z kotwicami', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-1-tab2')).toBeTruthy();
    expect(container.querySelector('#ref-rh1-1-tab3')).toBeTruthy();
    expect(container.querySelector('#ref-rh1-1-rys1 img')).toBeTruthy();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('tablica przedrostków ma sześć kolumn i osiem wierszy', () => {
    const { container } = widok();
    const tab = container.querySelector('#ref-rh1-1-tab2');
    expect(tab?.querySelectorAll('thead th')).toHaveLength(6);
    expect(tab?.querySelectorAll('tbody tr')).toHaveLength(8);
    // Potęgi w komórkach idą przez renderer matematyki.
    expect(tab?.querySelectorAll('.katex').length).toBeGreaterThan(15);
  });

  it('tablica długości ma dwanaście wierszy', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-1-tab3')?.querySelectorAll('tbody tr')).toHaveLength(
      12
    );
  });

  it('odsyłacz z 1-2 do tablicy 1-2 został podpięty wstecznie', () => {
    expect(bodies['1-2-si.md']).toContain('((rh1-1-tab2|tablicy 1-2))');
    expect(index.anchors.get('rh1-1-tab2')?.path).toBe('1-3-dlugosc.md');
  });

  it('pięć nowych haseł, trzy z odsyłaczem z tekstu', () => {
    for (const id of [
      'rh1-poj-wzorzec-dlugosci',
      'rh1-poj-wzorzec-metra',
      'rh1-poj-metr',
      'rh1-poj-atomowy-wzorzec-dlugosci',
      'rh1-poj-przedrostki',
    ]) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
    const zrodlo = bodies['1-3-dlugosc.md'];
    expect(zrodlo).toContain('((rh1-poj-wzorzec-metra|wzorcem metra))');
    expect(zrodlo).toContain('((rh1-poj-metr|jeden metr))');
  });

  it('przypis stoi przy tytule podrozdziału', () => {
    const { container } = widok();
    expect(container.querySelector('blockquote')?.textContent).toContain('H. Barrell');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
