/**
 * Nagłówek YAML w cyklu edycji.
 *
 * Dokument bazy wiedzy otwarty w edytorze tracił tytuł, tagi i prerekwizyty:
 * TipTap nie ma węzła dla front mattera, więc `---` stawało się poziomą linią,
 * a `requires: [...]` nagłówkiem. Autosave zapisywał uszkodzoną wersję.
 */
import { describe, it, expect } from 'vitest';
import { splitFrontMatter, withFrontMatter, markdownToHtml, htmlToMarkdown } from './markdownConverter';

const DOKUMENT = [
  '---',
  'title: Orbita keplerowska',
  'tags: [astronomia, mechanika]',
  'requires: [Rzut ukośny z oporem powietrza]',
  '---',
  '# Orbita keplerowska',
  '',
  'Planeta krąży po elipsie.',
].join('\n');

describe('rozdzielanie nagłówka', () => {
  it('odcina nagłówek i zostawia treść', () => {
    const { frontMatter, body } = splitFrontMatter(DOKUMENT);
    expect(frontMatter).toContain('title: Orbita keplerowska');
    expect(frontMatter).toContain('requires:');
    expect(body.startsWith('# Orbita keplerowska')).toBe(true);
    expect(body).not.toContain('tags:');
  });

  it('dokument bez nagłówka przechodzi bez zmian', () => {
    const { frontMatter, body } = splitFrontMatter('# Sam tytuł\n\ntreść');
    expect(frontMatter).toBeUndefined();
    expect(body).toBe('# Sam tytuł\n\ntreść');
  });

  it('pozioma linia w treści nie jest brana za nagłówek', () => {
    // `---` w środku dokumentu to `<hr>`, nie metadane.
    const { frontMatter } = splitFrontMatter('Tekst\n\n---\n\nDalszy tekst');
    expect(frontMatter).toBeUndefined();
  });

  it('sklejanie odtwarza dokument co do znaku', () => {
    const { frontMatter, body } = splitFrontMatter(DOKUMENT);
    expect(withFrontMatter(frontMatter, body)).toBe(DOKUMENT);
  });

  it('sklejanie nie mnoży pustych linii przy każdym zapisie', () => {
    const { frontMatter, body } = splitFrontMatter(DOKUMENT);
    let wynik = withFrontMatter(frontMatter, body);
    for (let i = 0; i < 5; i += 1) {
      const kolejne = splitFrontMatter(wynik);
      wynik = withFrontMatter(kolejne.frontMatter, kolejne.body);
    }
    expect(wynik).toBe(DOKUMENT);
  });
});

describe('pełny cykl edycji', () => {
  it('metadane przeżywają konwersję przez HTML', () => {
    // To jest dokładnie ta droga, którą dokument przechodzi w edytorze.
    const { frontMatter, body } = splitFrontMatter(DOKUMENT);
    const poEdycji = withFrontMatter(frontMatter, htmlToMarkdown(markdownToHtml(body)));

    expect(poEdycji).toContain('title: Orbita keplerowska');
    expect(poEdycji).toContain('tags: [astronomia, mechanika]');
    expect(poEdycji).toContain('requires: [Rzut ukośny z oporem powietrza]');
    // I nie zamieniły się w treść dokumentu.
    expect(poEdycji).not.toContain('* * *');
    expect(poEdycji).not.toMatch(/^##\s+requires/m);
  });

  it('bez rozdzielenia nagłówek faktycznie się psuje — kontrola testu', () => {
    // Gdyby ktoś kiedyś usunął `splitFrontMatter` z edytora, ten test pokaże,
    // co się wtedy dzieje.
    const bezRozdzielenia = htmlToMarkdown(markdownToHtml(DOKUMENT));
    expect(bezRozdzielenia).not.toContain('title: Orbita keplerowska\ntags:');
  });
});
