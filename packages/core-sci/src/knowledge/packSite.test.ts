/**
 * Pakowanie bazy do pobrania.
 *
 * Eksport z linii poleceń zapisuje pliki na dysk; eksport z przeglądarki musi
 * złożyć to samo w pamięci i oddać jako archiwum. Wspólna jest lista plików —
 * różni się tylko to, skąd bierze się bundel: z buildu albo z sieci.
 *
 * Testy pilnują rzeczy, na której takie pakowanie się wykłada: niekompletnego
 * archiwum, które wygląda na poprawne i dopiero po rozpakowaniu okazuje się
 * pustą stroną.
 */
import { describe, it, expect } from 'vitest';
import { planPack } from './packSite';

const DOKUMENTY = [
  { path: 'mechanika/wahadlo.md', markdown: '---\ntitle: Wahadło\n---\n# Wahadło\n\nTreść.' },
  { path: 'chaos/lorenz.md', markdown: '---\ntitle: Lorenz\n---\n# Lorenz\n\nTreść.' },
];

const ASSETS = ['assets/sci.js', 'assets/KaTeX_Main-Regular.woff2'];

describe('planPack', () => {
  it('składa strony razem z plikami bundla', () => {
    const plan = planPack(DOKUMENTY, ASSETS, { title: 'Baza wiedzy' });

    const sciezki = plan.entries.map((e) => e.path);
    expect(sciezki).toContain('index.html');
    expect(sciezki).toContain('mechanika/wahadlo.html');
    expect(sciezki).toContain('assets/sci.js');
    expect(sciezki).toContain('assets/KaTeX_Main-Regular.woff2');
  });

  it('rozróżnia treść tekstową od plików do pobrania', () => {
    // Strony powstają w pamięci; bundel i fonty trzeba dociągnąć. Pomylenie
    // tych dwóch dałoby archiwum z tekstem „[object Response]" zamiast fontu.
    const plan = planPack(DOKUMENTY, ASSETS, { title: 'B' });

    const strona = plan.entries.find((e) => e.path === 'index.html')!;
    expect(strona.kind).toBe('text');
    expect(strona.content).toContain('<!doctype html>');

    const font = plan.entries.find((e) => e.path.endsWith('.woff2'))!;
    expect(font.kind).toBe('fetch');
    expect(font.content).toBeUndefined();
  });

  it('bez bundla mówi wprost, że archiwum będzie martwe', () => {
    // Strona bez `sci.js` wyświetli tekst z `<noscript>` i nic więcej — żadnej
    // symulacji. Lepiej odmówić, niż wydać archiwum wyglądające na kompletne.
    const plan = planPack(DOKUMENTY, ['assets/KaTeX_Main-Regular.woff2'], { title: 'B' });
    expect(plan.issues).toContainEqual(expect.stringMatching(/sci\.js/));
  });

  it('bez dokumentów nie ma czego pakować', () => {
    expect(planPack([], ASSETS, { title: 'B' }).issues)
      .toContainEqual(expect.stringMatching(/dokument/i));
  });

  it('nazwa archiwum nie zawiera znaków, których nie zniesie system plików', () => {
    const plan = planPack(DOKUMENTY, ASSETS, { title: 'Baza wiedzy: fizyka / 2026' });
    expect(plan.filename).toMatch(/^[\w-]+\.zip$/);
    expect(plan.filename).toContain('baza-wiedzy');
  });
});
