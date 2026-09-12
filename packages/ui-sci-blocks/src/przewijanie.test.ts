import { describe, it, expect, vi } from 'vitest';
import { kontenerPrzewijania, pozycjaPrzewijania, przewinDo } from './przewijanie';

/** Buduje drzewo `dziadek > rodzic > dziecko` z zadanym `overflowY`. */
function drzewo(overflow: string, wysokoscTresci = 3000, wysokoscOkna = 600) {
  const dziadek = document.createElement('div');
  const rodzic = document.createElement('div');
  const dziecko = document.createElement('article');
  rodzic.style.overflowY = overflow;
  dziadek.appendChild(rodzic);
  rodzic.appendChild(dziecko);
  document.body.appendChild(dziadek);

  Object.defineProperty(rodzic, 'scrollHeight', { value: wysokoscTresci, configurable: true });
  Object.defineProperty(rodzic, 'clientHeight', { value: wysokoscOkna, configurable: true });
  return { dziadek, rodzic, dziecko };
}

describe('kto przewija', () => {
  it('znajduje przodka z własnym przewijaniem', () => {
    const { rodzic, dziecko } = drzewo('auto');
    expect(kontenerPrzewijania(dziecko)).toBe(rodzic);
  });

  it('„scroll" i „overlay" liczą się tak samo jak „auto"', () => {
    expect(kontenerPrzewijania(drzewo('scroll').dziecko)).not.toBeNull();
    expect(kontenerPrzewijania(drzewo('overlay').dziecko)).not.toBeNull();
  });

  it('bez przewijającego przodka odpowiedzią jest okno', () => {
    expect(kontenerPrzewijania(drzewo('visible').dziecko)).toBeNull();
  });

  it('przodek, w którym treść się mieści, nie przewija — mimo „auto"', () => {
    // Pasek boczny z `overflow: auto` i krótką listą nie jest kontenerem
    // przewijania dokumentu; wzięcie go dawałoby pozycję zawsze zerową.
    const { dziecko } = drzewo('auto', 400, 600);
    expect(kontenerPrzewijania(dziecko)).toBeNull();
  });

  it('bez elementu nie zgaduje', () => {
    expect(kontenerPrzewijania(null)).toBeNull();
  });
});

describe('pozycja i skok', () => {
  it('czyta pozycję z kontenera, gdy to on przewija', () => {
    const { rodzic, dziecko } = drzewo('auto');
    rodzic.scrollTop = 750;
    expect(pozycjaPrzewijania(kontenerPrzewijania(dziecko))).toBe(750);
  });

  it('czyta pozycję z okna, gdy przewija okno', () => {
    Object.defineProperty(window, 'scrollY', { value: 320, configurable: true, writable: true });
    expect(pozycjaPrzewijania(null)).toBe(320);
  });

  it('nie przewija przed początek dokumentu', () => {
    const { rodzic } = drzewo('auto');
    rodzic.scrollTo = vi.fn();
    przewinDo(rodzic, -500);
    expect(rodzic.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});
