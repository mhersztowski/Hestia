/**
 * Tryb czytania: podział dokumentu na segmenty.
 *
 * Testy pilnują tego, co przy renderowaniu najłatwiej zepsuć — kolejności i
 * kompletności. Dokument, w którym blok wypadł albo przeskoczył, przestaje być
 * wykładem.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { splitDocument } from './ReaderView';

const DIR = resolve(__dirname, '../dokumenty');
const read = (name: string) => readFileSync(resolve(DIR, name), 'utf8');

describe('podział dokumentu', () => {
  const DOK = [
    '---',
    'title: Test',
    '---',
    '# Nagłówek',
    '',
    'Akapit przed wzorem.',
    '',
    '```formula:okres',
    'T = 2\\pi',
    '```',
    '',
    'Akapit między.',
    '',
    '```sim:x',
    '{}',
    '```',
    '',
    '```exercise:z1',
    'Policz.',
    '@answer T',
    '```',
    '',
    '```python',
    'print(1)',
    '```',
    '',
    'Koniec.',
  ].join('\n');

  const segments = splitDocument(DOK);

  it('rozpoznaje wszystkie rodzaje bloków', () => {
    expect(segments.map((s) => s.kind)).toEqual([
      'text', 'formula', 'text', 'sim', 'exercise', 'code', 'text',
    ]);
  });

  it('zachowuje kolejność z pliku', () => {
    const teksty = segments.filter((s) => s.kind === 'text').map((s) => (s as { content: string }).content);
    expect(teksty[0]).toContain('Nagłówek');
    expect(teksty[1]).toContain('między');
    expect(teksty[2]).toContain('Koniec');
  });

  it('nagłówek YAML nie trafia do treści', () => {
    const pierwszy = segments[0] as { content: string };
    expect(pierwszy.content).not.toContain('title:');
  });

  it('blok kodu w innym języku zostaje kodem', () => {
    const kod = segments.find((s) => s.kind === 'code') as { language: string; body: string };
    expect(kod.language).toBe('python');
    expect(kod.body.trim()).toBe('print(1)');
  });

  it('simscript nie jest mylony z sim', () => {
    const ze = splitDocument('```simscript:a\nkod\n```\n\n```sim:b\n{}\n```');
    expect(ze.map((s) => s.kind)).toEqual(['simscript', 'sim']);
  });

  it('dokument bez bloków to jeden segment tekstu', () => {
    expect(splitDocument('# Tylko tekst\n\nAkapit.').map((s) => s.kind)).toEqual(['text']);
  });
});

describe('prawdziwe dokumenty', () => {
  const names = readdirSync(DIR).filter((f) => f.endsWith('.md'));

  for (const name of names) {
    it(`${name}: każdy blok jest rozpoznany`, () => {
      const segments = splitDocument(read(name));
      // Żaden blok sci nie może wylądować jako surowy kod — to znaczyłoby, że
      // czytelnik zobaczy listing zamiast symulacji.
      const nierozpoznane = segments.filter(
        (s) => s.kind === 'code' && /^(formula|sim|simscript|exercise)/.test((s as { language: string }).language),
      );
      expect(nierozpoznane).toEqual([]);
      // Dokument z blokami musi się na nie rozpaść. Dokument bez bloków —
      // Pytania rozdziału to sam tekst — zostaje jednym segmentem i to jest
      // stan poprawny, więc warunku nie stawiamy wszystkim po równo.
      const maBloki = /^ {0,3}```(formula|sim|simscript|exercise|figure|table|term):/m.test(read(name));
      expect(segments.length).toBeGreaterThan(maBloki ? 2 : 0);
    });

    it(`${name}: treść nie ginie`, () => {
      const segments = splitDocument(read(name));
      const tekst = segments
        .filter((s) => s.kind === 'text')
        .map((s) => (s as { content: string }).content)
        .join(' ');
      // Każdy dokument ma nagłówek pierwszego poziomu i co najmniej kilkaset
      // znaków wyjaśnienia — inaczej to nie jest artykuł, tylko demo.
      expect(tekst).toMatch(/^#\s|\n#\s/);
      expect(tekst.length).toBeGreaterThan(400);
    });
  }
});

describe('artefakty edytora', () => {
  it('znaczniki bloków nie trafiają do treści', () => {
    // MdEditor dokłada `<!-- bid:… -->` przy każdym zapisie. W trybie czytania
    // wyglądały jak zrzut z bazy danych między akapitami.
    const segments = splitDocument([
      '<!-- bid:71f5ddf2-d3a0-4af2-ae86-7fc77f7c6e91 -->',
      '',
      '# Orbita',
      '',
      '<!-- bid:7c973d37-fa02-4607-85b0-69bb690d77ef -->',
      '',
      'Planeta krąży po elipsie.',
    ].join('\n'));

    const tekst = segments.map((s) => (s.kind === 'text' ? s.content : '')).join('');
    expect(tekst).not.toContain('bid:');
    expect(tekst).toContain('Orbita');
    expect(tekst).toContain('elipsie');
  });

  it('nagłówek YAML z zakończeniami CRLF też jest odcinany', () => {
    const segments = splitDocument('---\r\ntitle: X\r\n---\r\n# Nagłówek\r\n');
    const tekst = segments.map((s) => (s.kind === 'text' ? s.content : '')).join('');
    expect(tekst).not.toContain('title:');
    expect(tekst).toContain('Nagłówek');
  });

  it('komentarz w środku zdania zostaje — usuwamy tylko całe linie', () => {
    const segments = splitDocument('Tekst <!-- uwaga --> dalej.');
    const tekst = segments.map((s) => (s.kind === 'text' ? s.content : '')).join('');
    expect(tekst).toContain('uwaga');
  });
});
