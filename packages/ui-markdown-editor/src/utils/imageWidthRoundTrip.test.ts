/**
 * Szerokość obrazka w drodze tam i z powrotem.
 *
 * Uchwyt w narożniku zmienia atrybut `width` w dokumencie edytora. To jest
 * połowa drogi — druga połowa to zapis do pliku i odczytanie go z powrotem
 * przy następnym otwarciu. Bez tej drugiej połowy przeciąganie działałoby
 * do pierwszego zamknięcia karty.
 */
import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, markdownToHtml } from './markdownConverter';

const OBRAZ = 'https://example.com/schemat.png';

describe('zapis szerokości do markdownu', () => {
  it('obrazek bez szerokości zostaje zwykłym markdownem', () => {
    const md = htmlToMarkdown(`<img src="${OBRAZ}" alt="Schemat" style="display: block" />`);
    expect(md.trim()).toBe(`![Schemat](${OBRAZ})`);
  });

  it('obrazek z szerokością zapisuje się jako HTML, bo markdown tego nie umie', () => {
    const md = htmlToMarkdown(`<img src="${OBRAZ}" alt="Schemat" style="width: 60%" />`);

    expect(md).toContain('width: 60%');
    expect(md).toContain(`src="${OBRAZ}"`);
  });

  it('szerokość wraca po ponownym odczytaniu pliku', () => {
    const html = markdownToHtml(`<img src="${OBRAZ}" alt="Schemat" style="width: 45%" />`);
    expect(html).toContain('45%');

    // I jeszcze raz do markdownu — po dwóch przejściach wartość ma być ta sama.
    expect(htmlToMarkdown(html)).toContain('width: 45%');
  });

  it('sto procent nie jest zapisywane — brak wpisu znaczy „naturalna szerokość"', () => {
    const md = htmlToMarkdown(`<img src="${OBRAZ}" alt="Schemat" style="width: 100%" />`);
    expect(md.trim()).toBe(`![Schemat](${OBRAZ})`);
  });

  it('szerokość nie gubi wyrównania ani tekstu alternatywnego', () => {
    const md = htmlToMarkdown(`<img src="${OBRAZ}" alt="Po lewej" style="width: 30%; float: left" />`);

    expect(md).toContain('width: 30%');
    expect(md).toContain('float: left');
    expect(md).toContain('alt="Po lewej"');
  });
});
