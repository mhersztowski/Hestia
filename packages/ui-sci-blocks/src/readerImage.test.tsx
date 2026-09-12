/**
 * Obrazki w trybie czytania.
 *
 * Rysunki z podręcznika, których nie da się policzyć ze wzoru (diagram sił,
 * jakościowa krzywa `U(x)` bez podanego równania), wchodzą do dokumentu jako
 * **wycinek skanu**. Bez tego czytelnik widzi surowe `![Rys. 15-1](…)`.
 *
 * Obrazek niesiony jest w `data:` URI, a nie ścieżką do pliku, i to jest sedno:
 * dokument bazy leży w `drive/knowledge`, czyli poza katalogiem serwowanym po
 * HTTP, więc plik obok dokumentu i tak nie zostałby podany. Przy okazji
 * przeniesienie katalogu z książką niczego nie psuje, a eksport statyczny
 * działa z `file://`.
 *
 * Dlatego testy pilnują dwóch rzeczy naraz: że obrazek się pojawia **i** że
 * `src` nie jest bramą na skrypt — dokument bazy bywa cudzy.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReaderView } from './ReaderView';

afterEach(cleanup);

const PIKSEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

const dokument = (tresc: string) => ['---', 'title: Test', '---', '', tresc, ''].join('\n');

describe('obrazek w trybie czytania', () => {
  it('renderuje obrazek z data: URI', () => {
    render(<ReaderView markdown={dokument(`![Rys. 15-1](${PIKSEL})`)} path="t.md" />);

    const img = screen.getByRole('img', { name: 'Rys. 15-1' });
    expect(img.getAttribute('src')).toBe(PIKSEL);
  });

  it('nie skaluje obrazka ponad szerokość kolumny', () => {
    // Wycinek skanu ma 1410 px szerokości — bez ograniczenia rozpycha stronę
    // i wymusza przewijanie w poziomie.
    render(<ReaderView markdown={dokument(`![Rys](${PIKSEL})`)} path="t.md" />);
    expect(screen.getByRole('img').style.maxWidth).toBe('100%');
  });

  it('odrzuca src z protokołem skryptu', () => {
    // Dokument bazy bywa cudzy. `javascript:` w `src` jest wprawdzie martwe dla
    // <img>, ale przepuszczenie go tutaj oznacza, że nie ma żadnej kontroli
    // źródła — a stąd już blisko do `onerror`.
    render(<ReaderView markdown={dokument('![zły](javascript:alert(1))')} path="t.md" />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('przepuszcza zwykły adres http i ścieżkę względną', () => {
    render(<ReaderView markdown={dokument('![a](https://example.test/a.png)\n\n![b](rys/b.png)')} path="t.md" />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('obrazek nie zjada tekstu wokół siebie', () => {
    render(<ReaderView markdown={dokument(`Przed. ![R](${PIKSEL}) Po.`)} path="t.md" />);

    expect(screen.getByRole('img')).toBeTruthy();
    expect(screen.getByText(/Przed\./)).toBeTruthy();
    expect(screen.getByText(/Po\./)).toBeTruthy();
  });

  it('nie myli obrazka ze zwykłym odsyłaczem w nawiasach', () => {
    // `[tekst](url)` bez wykrzyknika to link, nie obrazek — nie wolno go
    // zamienić w <img> z pustym alt-em.
    render(<ReaderView markdown={dokument('[nie obrazek](https://example.test/a.png)')} path="t.md" />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
