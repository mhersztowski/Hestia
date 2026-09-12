/**
 * Callout przez pełny konwerter markdown ⇄ HTML.
 *
 * Testy w `callout.test.ts` sprawdzają sam format; tutaj chodzi o to, że blok
 * przechodzi przez showdown i turndown bez gubienia typu i treści — czyli że
 * zapis dokumentu nie zamienia wyróżnienia w zwykły cytat.
 */
import { describe, it, expect } from 'vitest';
import { markdownToHtml, htmlToMarkdown } from './markdownConverter';

describe('markdownToHtml — alerty GitHuba stają się blokiem callout', () => {
  it('rozpoznaje typ i przenosi treść', () => {
    const html = markdownToHtml('> [!TIP]\n> Rada dnia');
    expect(html).toContain('data-callout="tip"');
    expect(html).toContain('Rada dnia');
  });

  it('treść wewnętrzna jest przetwarzana jak reszta dokumentu', () => {
    const html = markdownToHtml('> [!NOTE]\n> - jeden\n> - dwa');
    expect(html).toContain('data-callout="note"');
    expect(html).toMatch(/<ul>[\s\S]*jeden[\s\S]*dwa[\s\S]*<\/ul>/);
  });

  it('zwykły cytat pozostaje cytatem', () => {
    const html = markdownToHtml('> Zwykły cytat');
    expect(html).not.toContain('data-callout');
    expect(html).toContain('<blockquote>');
  });

  it('nieznany typ alertu nie tworzy callouta', () => {
    const html = markdownToHtml('> [!INFO]\n> co to jest');
    expect(html).not.toContain('data-callout');
  });
});

describe('htmlToMarkdown — callout wraca jako alert', () => {
  it('zapisuje znacznik typu i prefiksuje treść', () => {
    const md = htmlToMarkdown('<div data-callout="warning"><p>Uważaj</p></div>');
    expect(md.trim()).toBe('> [!WARNING]\n> Uważaj');
  });

  it('brak typu daje domyślną notatkę', () => {
    const md = htmlToMarkdown('<div data-callout=""><p>Treść</p></div>');
    expect(md.trim().startsWith('> [!NOTE]')).toBe(true);
  });
});

describe('round-trip', () => {
  it('markdown → HTML → markdown zachowuje typ i treść', () => {
    const source = '> [!CAUTION]\n> Pierwsza linia';
    const round = htmlToMarkdown(markdownToHtml(source)).trim();
    expect(round).toBe(source);
  });

  it('dwa akapity w calloucie zostają dwoma akapitami', () => {
    // Pusta linia zapisana jako samo `>` — bez tego cytat urywa się w połowie
    // i druga część wypada poza blok.
    const source = '> [!NOTE]\n> Pierwszy akapit\n>\n> Drugi akapit';
    const round = htmlToMarkdown(markdownToHtml(source)).trim();
    expect(round).toBe(source);
  });

  it('złamanie linii wewnątrz akapitu scala się — tak działa markdown, nie tylko tutaj', () => {
    const round = htmlToMarkdown(markdownToHtml('> [!TIP]\n> Pierwsza\n> Druga')).trim();
    expect(round).toBe('> [!TIP]\n> Pierwsza Druga');
  });

  it('lista wewnątrz callouta przeżywa obieg', () => {
    const source = '> [!IMPORTANT]\n> - jeden\n> - dwa';
    const round = htmlToMarkdown(markdownToHtml(source)).trim();
    expect(round).toContain('[!IMPORTANT]');
    expect(round).toContain('jeden');
    expect(round).toContain('dwa');
    // Każda linia treści musi zostać w cytacie — inaczej lista wypada z bloku.
    for (const line of round.split('\n')) expect(line.startsWith('>')).toBe(true);
  });

  it('tekst wokół callouta zostaje na swoim miejscu', () => {
    const source = 'Przed\n\n> [!TIP]\n> Rada\n\nPo';
    const round = htmlToMarkdown(markdownToHtml(source)).trim();
    expect(round.indexOf('Przed')).toBeLessThan(round.indexOf('[!TIP]'));
    expect(round.indexOf('[!TIP]')).toBeLessThan(round.indexOf('Po'));
  });
});
