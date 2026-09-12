import { describe, it, expect } from 'vitest';
import { dataUrlZObrazu, type Rysownik } from './textureData';

/** Rysownik zapisujący, o co go poproszono — zamiast prawdziwego płótna. */
function atrapa(wynik: string | null = 'data:image/png;base64,AAAA') {
  const wywolania: Array<{ w: number; h: number; format: string }> = [];
  const rysownik: Rysownik = {
    narysuj: (_z, w, h, format) => { wywolania.push({ w, h, format }); return wynik; },
  };
  return { rysownik, wywolania };
}

describe('obraz tekstury do zapisu', () => {
  it('przerysowuje w oryginalnym rozmiarze, gdy nikt nie prosi o skalowanie', () => {
    const { rysownik, wywolania } = atrapa();
    const wynik = dataUrlZObrazu({ width: 512, height: 256 }, { rysownik });

    expect(wynik.dataUrl).toContain('data:image/png');
    expect(wywolania[0]).toEqual({ w: 512, h: 256, format: 'image/png' });
  });

  it('skaluje do zadanego boku, zachowując proporcje', () => {
    const { rysownik, wywolania } = atrapa();
    dataUrlZObrazu({ width: 4096, height: 2048 }, { rysownik, maxRozmiar: 1024 });

    expect(wywolania[0].w).toBe(1024);
    expect(wywolania[0].h).toBe(512);
  });

  it('nie powiększa obrazu mniejszego niż granica', () => {
    // Powiększenie nie doda szczegółów, a scenę rozdmucha.
    const { rysownik, wywolania } = atrapa();
    dataUrlZObrazu({ width: 64, height: 64 }, { rysownik, maxRozmiar: 1024 });
    expect(wywolania[0]).toMatchObject({ w: 64, h: 64 });
  });

  it('liczy wagę zapisu, żeby dało się ostrzec o ciężkiej scenie', () => {
    const duzy = `data:image/png;base64,${'A'.repeat(40000)}`;
    const { rysownik } = atrapa(duzy);
    expect(dataUrlZObrazu({ width: 8, height: 8 }, { rysownik }).kb).toBeGreaterThan(25);
  });

  it('brak obrazu to powód, a nie cisza', () => {
    expect(dataUrlZObrazu(null).powod).toMatch(/nie ma obrazu/i);
    expect(dataUrlZObrazu({ width: 0, height: 0 }).powod).toMatch(/wymiar/i);
  });

  it('nieudane przerysowanie zgłasza powód zamiast udawać sukces', () => {
    const { rysownik } = atrapa(null);
    const wynik = dataUrlZObrazu({ width: 10, height: 10 }, { rysownik });

    expect(wynik.dataUrl).toBeNull();
    expect(wynik.powod).toMatch(/przerysować/i);
  });

  it('poza przeglądarką nie wywala się, tylko mówi, że się nie da', () => {
    // Domyślny rysownik używa `document`, którego w Node nie ma.
    expect(dataUrlZObrazu({ width: 10, height: 10 }).dataUrl).toBeNull();
  });
});
