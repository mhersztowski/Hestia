import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = [
  '15-4-energia.md',
  'Slownik.md',
  '15-1-ruch-harmoniczny.md',
  '15-2-oscylator.md',
  '15-3-ruch-prosty.md',
].map((p) => ({ path: p, markdown: readDocument(p) }));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(
    id,
    { anchors: index.anchors, formulaHome: index.formulaHome },
    '15-4-energia.md'
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
      markdown={bodies['15-4-energia.md']}
      path="15-4-energia.md"
      resolveRef={resolveRef}
    />
  );

describe('15-4 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('pięć wzorów z kotwicami, w tym jedno równanie bez przypisania', () => {
    const { container } = widok();
    for (const n of [14, 15, 16, 17, 18]) {
      expect(container.querySelector(`#ref-rh1-15-eq${n}`), `eq${n}`).toBeTruthy();
    }
    const dokument = index.documents.find((d) => d.path === '15-4-energia.md');
    const rodzaje = Object.fromEntries((dokument?.formulas ?? []).map((f) => [f.id, f.kind]));
    expect(rodzaje['rh1-15-eq17']).toBe('relation');
    expect(rodzaje['rh1-15-eq14']).toBe('definition');
    expect(rodzaje['rh1-15-eq16']).toBe('definition');
  });

  it('rysunek 15-9 stoi w toku tekstu i jest wycinkiem skanu', () => {
    const { container } = widok();
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('#ref-rh1-15-rys9 img')).toBeTruthy();
    expect(container.querySelector('#ref-rh1-15-rys9 svg')).toBeNull();
  });

  it('wzór (15-8) jest przywołany, a nie przypisany temu dokumentowi', () => {
    // (15-8) mieszka w 15-3 — powtórzenie w druku nie może zabrać mu identyfikatora.
    expect(index.anchors.get('rh1-15-eq8')?.path).toBe('15-3-ruch-prosty.md');
    const dokument = index.documents.find((d) => d.path === '15-4-energia.md');
    expect((dokument?.formulas ?? []).map((f) => f.id)).not.toContain('rh1-15-eq8');
  });

  it('łańcuch równości niesie całe wyprowadzenie', () => {
    const dokument = index.documents.find((d) => d.path === '15-4-energia.md');
    const eq15 = dokument?.formulas.find((f) => f.id === 'rh1-15-eq15');
    expect(eq15?.chain).toHaveLength(3);
  });

  it('odsyłacze wychodzą do 15-2 i 15-3 oraz do jeszcze nieprzeniesionego 15-9', () => {
    expect(index.anchors.get('rh1-15-rys4')?.path).toBe('15-2-oscylator.md');
    expect(index.anchors.get('rh1-15-eq13')?.path).toBe('15-3-ruch-prosty.md');
    expect(resolveReference('rh1-15-eq2', index, '15-4-energia.md').found).toBe(true);
  });

  it('nowe hasła słownika pochodzą ze skorowidza', () => {
    for (const id of [
      'rh1-poj-energia-calkowita-drgan',
      'rh1-poj-energia-kinetyczna-drgan',
      'rh1-poj-energia-potencjalna-drgan',
      'rh1-poj-energia-w-ruchu-harmonicznym-prostym',
    ]) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
    }
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toContain('$');
  });
});
