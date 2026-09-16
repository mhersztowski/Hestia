import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { buildIndex, resolveReference } from '@hestia/core-sci';
import { ReaderView } from './ReaderView';
import { readDocument } from './test/documents';

const DOK = '3-2-kinematyka.md';
const pliki = [DOK, '3-1-mechanika.md', 'Slownik.md'].map((p) => ({
  path: p,
  markdown: readDocument(p),
}));
const index = buildIndex(pliki);
const bodies = Object.fromEntries(pliki.map((f) => [f.path, f.markdown]));
const resolveRef = (id: string) => {
  const cel = resolveReference(id, { anchors: index.anchors, formulaHome: index.formulaHome }, DOK);
  if (!cel.found || !cel.path) return undefined;
  const m = new RegExp(`^ {0,3}\`\`\`${cel.kind}:${id}\\n([\\s\\S]*?)\`\`\``, 'm').exec(
    bodies[cel.path] ?? ''
  );
  return { code: m?.[1], kind: cel.kind, sameDocument: cel.sameDocument };
};
const widok = () =>
  render(<ReaderView markdown={bodies[DOK]} path={DOK} resolveRef={resolveRef} />);

describe('3-2 w czytniku', () => {
  it('baza spójna', () => expect(index.issues).toEqual([]));

  it('podrozdział bez wzorów, z jednym rysunkiem', () => {
    const d = index.documents.find((x) => x.path === DOK);
    expect(d?.formulas).toHaveLength(0);
    expect(d?.figures?.map((f) => f.id)).toEqual(['rh1-3-rys1']);
  });

  // Rysunek wchodzi jako `data:` URI, bo dokumenty bazy leżą poza katalogiem,
  // który backend serwuje po HTTP — ścieżka do pliku obok nie zostałaby podana.
  it('rysunek 3-1 jest osadzonym skanem, nie ścieżką', () => {
    const { container } = widok();
    const img = container.querySelectorAll('img');
    expect(img).toHaveLength(1);
    expect(img[0].getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('podpis rysunku przepisany dosłownie', () => {
    const { container } = widok();
    expect(container.textContent).toContain(
      'Ruch postępowy może odbywać się w przestrzeni trójwymiarowej'
    );
  });

  it('dwa nowe hasła z odsyłaczem, trzecie tylko w słowniku', () => {
    for (const id of ['rh1-poj-punkt-materialny', 'rh1-poj-ruch-postepowy']) {
      expect(index.anchors.get(id)?.kind, id).toBe('term');
      expect(bodies[DOK], id).toContain(`((${id}|`);
    }
    // „kinematyka punktu materialnego" to tytuł paragrafu, a nie kursywa
    // w zdaniu — hasło jest, odsyłacza nie ma i to jest stan poprawny.
    expect(index.anchors.get('rh1-poj-kinematyka-punktu')?.kind).toBe('term');
    expect(bodies[DOK]).not.toContain('((rh1-poj-kinematyka-punktu|');
  });

  // Synonim podany przez książkę w nawiasie zostaje kursywą przy haśle głównym,
  // bo skorowidz też trzyma oba w jednym wpisie.
  it('„translacyjnym" nie ma własnego hasła', () => {
    expect(bodies[DOK]).toContain('(*translacyjnym*)');
    expect([...index.anchors.keys()]).not.toContain('rh1-poj-translacyjny');
  });

  it('odsyłacz do rysunku prowadzi do tego samego dokumentu', () => {
    const cel = resolveReference(
      'rh1-3-rys1',
      { anchors: index.anchors, formulaHome: index.formulaHome },
      DOK
    );
    expect(cel.found).toBe(true);
    expect(cel.kind).toBe('figure');
    expect(cel.sameDocument).toBe(true);
  });

  it('nic nie zostaje surowym zapisem', () => {
    const { container } = widok();
    expect(container.textContent).not.toMatch(/\(\(rh1-/);
    expect(container.textContent).not.toMatch(/\$|```/);
  });
});
