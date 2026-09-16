import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = [
  '2-4-mnozenie.md',
  '2-1-wektory.md',
  '2-2-dodawanie.md',
  '2-3-skladowe.md',
  'Slownik.md',
].map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(
    id,
    { anchors: index.anchors, formulaHome: index.formulaHome },
    '2-4-mnozenie.md'
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
      markdown={bodies['2-4-mnozenie.md']}
      path="2-4-mnozenie.md"
      resolveRef={resolveRef}
    />
  );
const dokument = () => index.documents.find((d) => d.path === '2-4-mnozenie.md');

describe('2-4 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('(2-11) to relacja, (2-12) wchodzi do grafu', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-2-eq11')).toBeTruthy();
    expect(container.querySelector('#ref-rh1-2-eq12')).toBeTruthy();
    const rodzaje = Object.fromEntries((dokument()?.formulas ?? []).map((f) => [f.id, f.kind]));
    expect(rodzaje['rh1-2-eq11']).toBe('relation');
    expect(rodzaje['rh1-2-eq12']).toBe('definition');
  });

  it('żaden blok nie używa varphi — silnik czytałby je jako złoty podział', () => {
    for (const f of dokument()?.formulas ?? []) {
      expect(f.issues, f.id).toEqual([]);
    }
    // Sprawdzamy **bloki wzorów**, nie cały dokument: uwaga redakcyjna wspomina
    // `\varphi` w kodzie w linii, opisując właśnie tę decyzję.
    for (const f of dokument()?.formulas ?? []) {
      expect(JSON.stringify(f), f.id).not.toContain('varphi');
    }
  });

  it('trzy rysunki, w tym trzypanelowy 2-12', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(dokument()?.figures.find((f) => f.id === 'rh1-2-rys12')?.panels).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('trzy przypisy jako cytaty blokowe', () => {
    const { container } = widok();
    const cytaty = [...container.querySelectorAll('blockquote')].map((b) => b.textContent ?? '');
    expect(cytaty).toHaveLength(3);
    expect(cytaty[0]).toContain('rozdziale 7');
    expect(cytaty[1]).toContain('dwa kąty');
    expect(cytaty[2]).toContain('umownym');
  });

  it('cztery nowe hasła; trzy z odsyłaczem z tekstu', () => {
    for (const id of [
      'rh1-poj-iloczyn-skalarny',
      'rh1-poj-iloczyn-wektorowy',
      'rh1-poj-tensor',
      'rh1-poj-mnozenie-wektorow',
    ]) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
    expect(bodies['2-4-mnozenie.md'].match(/\(\(rh1-poj-/g) ?? []).toHaveLength(3);
  });

  it('2-3 dostało brakujący koniec: rysunek 2-10', () => {
    expect(index.anchors.get('rh1-2-rys10')?.path).toBe('2-3-skladowe.md');
    expect(bodies['2-3-skladowe.md']).toContain('pages: 28-33');
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
