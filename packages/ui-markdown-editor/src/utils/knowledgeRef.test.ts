/**
 * Odsyłacz `((id))` w edytorze Markdown — round-trip.
 *
 * Zapis `[[…]]` należy w tym edytorze do obsidianowych linków do plików, więc
 * odsyłacz do hasła bazy wiedzy musi mieć własny nawias. Testy pilnują dwóch
 * rzeczy naraz: że `((…))` staje się odsyłaczem **i** że `[[…]]` obok niego
 * dalej jest linkiem do pliku.
 */
import { describe, it, expect } from 'vitest';
import { markdownToHtml, htmlToMarkdown } from './markdownConverter';

describe('((id)) w drodze do HTML', () => {
  it('staje się węzłem odsyłacza, a nie linkiem do pliku', () => {
    const html = markdownToHtml('nazywamy ((rh1-poj-czestosc|Częstością)) ruchu.');

    expect(html).toContain('data-type="knowledge-ref"');
    expect(html).toContain('data-ref-id="rh1-poj-czestosc"');
    expect(html).toContain('Częstością');
    // Sedno usterki: dotąd powstawał link do drive/rh1-poj-czestosc.md.
    expect(html).not.toContain('drive/rh1-poj-czestosc.md');
  });

  it('bez podpisu pokazuje identyfikator', () => {
    const html = markdownToHtml('patrz ((rh1-15-eq1)).');
    expect(html).toContain('data-ref-id="rh1-15-eq1"');
  });

  it('nie rusza obsidianowego linku do pliku', () => {
    const html = markdownToHtml('patrz [[notatka]] oraz ((rh1-poj-czestosc|częstość)).');
    expect(html).toContain('data-wikilink="true"');
    expect(html).toContain('drive/notatka.md');
    expect(html).toContain('data-type="knowledge-ref"');
  });

  it('zwykły nawias w zdaniu zostaje tekstem', () => {
    const html = markdownToHtml('zgodnie z tym (patrz (a) wyżej) mamy wynik.');
    expect(html).not.toContain('knowledge-ref');
  });
});

/**
 * Edytor wstawia **twardą spację** wokół każdego elementu w linii — pogrubienia,
 * kursywy, kodu i obsidianowego linku tak samo. Robi to przebieg zachowujący
 * odstępy (`markdownConverter.ts`, „interior run: keep 1 space"). To zachowanie
 * zastane; tutaj sprawdzamy odsyłacz, a nie tamten przebieg, więc porównujemy
 * po ujednoliceniu białych znaków.
 */
const bezTwardych = (s: string) => s.replace(/\u00A0/g, ' ').trim();

describe('powrót do markdownu', () => {
  it('odsyłacz z podpisem wraca w tej samej postaci', () => {
    const zrodlo = 'nazywamy ((rh1-poj-czestosc|Częstością)) ruchu.';
    expect(bezTwardych(htmlToMarkdown(markdownToHtml(zrodlo)))).toBe(zrodlo);
  });

  it('odsyłacz bez podpisu wraca bez pionowej kreski', () => {
    const zrodlo = 'patrz ((rh1-15-eq1)).';
    expect(bezTwardych(htmlToMarkdown(markdownToHtml(zrodlo)))).toBe(zrodlo);
  });

  it('odsyłacz i link do pliku obok siebie przeżywają obieg', () => {
    const zrodlo = 'patrz [[notatka]] oraz ((rh1-poj-czestosc|częstość)).';
    expect(bezTwardych(htmlToMarkdown(markdownToHtml(zrodlo)))).toBe(zrodlo);
  });
});

describe('podpis złamany na wiersze', () => {
  it('też staje się odsyłaczem', () => {
    // Plik źródłowy jest zawijany, więc „paragrafu\n6-3" to zapis normalny.
    // Wcześniej taki odsyłacz zostawał w dokumencie surowym tekstem.
    const html = markdownToHtml('siła dośrodkowa z ((rh1-sec-6-3|paragrafu\n6-3)), oraz');
    expect(html).toContain('data-ref-id="rh1-sec-6-3"');
    expect(html).toContain('paragrafu 6-3');
    expect(html).not.toContain('((rh1-sec-6-3');
  });
});
