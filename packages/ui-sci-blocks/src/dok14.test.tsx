import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const pliki = ['1-4-masa.md', '1-1-wielkosci.md', '1-2-si.md', '1-3-dlugosc.md', 'Slownik.md'].map(
  (p) => ({ path: p, markdown: readDocument(p) })
);
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(
    id,
    { anchors: index.anchors, formulaHome: index.formulaHome },
    '1-4-masa.md'
  );
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[cel.path] ?? ''
  );
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () =>
  render(
    <ReaderView markdown={bodies['1-4-masa.md']} path="1-4-masa.md" resolveRef={resolveRef} />
  );

describe('1-4 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('dwie tablice i fotografia wzorca', () => {
    const { container } = widok();
    expect(container.querySelector('#ref-rh1-1-tab4')?.querySelectorAll('tbody tr')).toHaveLength(
      15
    );
    expect(container.querySelector('#ref-rh1-1-tab5')?.querySelectorAll('tbody tr')).toHaveLength(
      7
    );
    expect(container.querySelector('#ref-rh1-1-rys2 img')).toBeTruthy();
  });

  it('niepewności pomiaru składają się jako matematyka', () => {
    const { container } = widok();
    const tab5 = container.querySelector('#ref-rh1-1-tab5');
    expect(tab5?.textContent).toContain('±');
    expect(tab5?.textContent).toContain('(dokładnie)');
    expect(container.textContent).not.toContain('$');
  });

  it('rozdział 1 ma teraz komplet tablic 1-1…1-5', () => {
    for (let n = 1; n <= 5; n += 1) {
      expect(index.anchors.has(`rh1-1-tab${n}`), `tab${n}`).toBe(true);
    }
    expect(index.anchors.get('rh1-1-tab4')?.path).toBe('1-4-masa.md');
  });

  it('odsyłacz do paragrafu 16.3 zachowuje kropkę z druku', () => {
    expect(bodies['1-4-masa.md']).toContain('((rh1-sec-16-3|paragraf 16.3))');
  });

  it('dwa nowe hasła z odsyłaczami z tekstu', () => {
    for (const id of ['rh1-poj-wzorzec-masy', 'rh1-poj-masa-atomowa']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
      expect(bodies['1-4-masa.md']).toContain(`((${id}|`);
    }
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
  });
});
