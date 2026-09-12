/**
 * Efemerydy sprawdzane wobec rzeczy, które da się niezależnie zweryfikować:
 * okresów obiegu, znanych położeń i zjawisk widocznych gołym okiem.
 *
 * To jest ten rodzaj testu, o którym mówi raport przy solverach — fizyka daje
 * darmowe wzorce, więc nie trzeba wymyślać oczekiwanych liczb.
 */
import { describe, it, expect } from 'vitest';
import {
  heliocentric, heliocentricDistance, distanceFromEarth, geocentricLongitude,
  solveKepler, toJulianDate, centuriesSinceJ2000, KEPLER_J2000, BODIES,
} from './ephemeris';

const J2000 = new Date('2000-01-01T12:00:00Z');

describe('czas', () => {
  it('J2000 to data juliańska 2451545', () => {
    expect(toJulianDate(J2000)).toBeCloseTo(2451545.0, 4);
    expect(centuriesSinceJ2000(J2000)).toBeCloseTo(0, 6);
  });

  it('stulecie juliańskie to 36525 dni', () => {
    const stulecie = new Date(J2000.getTime() + 36525 * 86400_000);
    expect(centuriesSinceJ2000(stulecie)).toBeCloseTo(1, 6);
  });
});

describe('równanie Keplera', () => {
  it('dla orbity kołowej anomalia mimośrodowa równa się średniej', () => {
    expect(solveKepler(45, 0)).toBeCloseTo(45, 9);
  });

  it('spełnia M = E − e*·sin E', () => {
    const e = 0.2;
    const M = 30;
    const E = solveKepler(M, e);
    const eStar = (180 / Math.PI) * e;
    expect(E - eStar * Math.sin(E * Math.PI / 180)).toBeCloseTo(M, 5);
  });

  it('zbiega także dla dużego mimośrodu Merkurego', () => {
    const e = KEPLER_J2000.Mercury.e[0];
    for (const M of [0, 45, 90, 179, -120]) {
      const E = solveKepler(M, e);
      const eStar = (180 / Math.PI) * e;
      expect(E - eStar * Math.sin(E * Math.PI / 180)).toBeCloseTo(M, 4);
    }
  });
});

describe('położenia planet', () => {
  it('odległości w J2000 zgadzają się z półosiami wielkimi', () => {
    for (const planet of Object.keys(KEPLER_J2000)) {
      const r = heliocentricDistance(planet, J2000)!;
      const a = KEPLER_J2000[planet].a[0];
      const e = KEPLER_J2000[planet].e[0];
      // Odległość musi mieścić się między peryhelium a aphelium.
      expect(r, planet).toBeGreaterThanOrEqual(a * (1 - e) - 1e-6);
      expect(r, planet).toBeLessThanOrEqual(a * (1 + e) + 1e-6);
    }
  });

  it('Ziemia krąży w odległości około jednej jednostki astronomicznej', () => {
    expect(heliocentricDistance('Earth', J2000)).toBeCloseTo(0.983, 2);
  });

  it('orbita Ziemi leży praktycznie w płaszczyźnie ekliptyki', () => {
    // Ekliptyka jest z definicji płaszczyzną orbity Ziemi — składowa z musi
    // być znikoma i to jest sprawdzian poprawności obrotów.
    for (let dzien = 0; dzien < 365; dzien += 30) {
      const p = heliocentric('Earth', new Date(J2000.getTime() + dzien * 86400_000))!;
      expect(Math.abs(p.z)).toBeLessThan(1e-4);
    }
  });

  it('Ziemia wraca w to samo miejsce po roku', () => {
    const teraz = heliocentric('Earth', J2000)!;
    const zaRok = heliocentric('Earth', new Date(J2000.getTime() + 365.256 * 86400_000))!;
    expect(Math.hypot(teraz.x - zaRok.x, teraz.y - zaRok.y)).toBeLessThan(0.01);
  });

  it('okresy obiegu wychodzą z trzeciego prawa Keplera', () => {
    // Mierzymy okres, szukając powrotu do położenia startowego.
    const okres = (planet: string, przybliżony: number) => {
      const start = heliocentric(planet, J2000)!;
      let najlepszy = przybliżony;
      let najmniejsza = Infinity;
      for (let dni = przybliżony * 0.9; dni < przybliżony * 1.1; dni += przybliżony * 0.001) {
        const p = heliocentric(planet, new Date(J2000.getTime() + dni * 86400_000))!;
        const odleglosc = Math.hypot(start.x - p.x, start.y - p.y, start.z - p.z);
        if (odleglosc < najmniejsza) { najmniejsza = odleglosc; najlepszy = dni; }
      }
      return najlepszy / 365.25;
    };

    for (const [planet, lata] of [['Mercury', 0.241], ['Venus', 0.615], ['Mars', 1.881], ['Jupiter', 11.86]] as const) {
      const a = KEPLER_J2000[planet].a[0];
      expect(okres(planet, lata * 365.25), planet).toBeCloseTo(Math.sqrt(a ** 3), 1);
    }
  });

  it('nieznana planeta nie udaje wyniku', () => {
    expect(heliocentric('Pluton', J2000)).toBeUndefined();
    expect(heliocentricDistance('Nibiru', J2000)).toBeUndefined();
  });
});

describe('zjawiska widoczne z Ziemi', () => {
  it('odległość Marsa od Ziemi zmienia się kilkukrotnie', () => {
    const odleglosci: number[] = [];
    for (let dni = 0; dni < 780; dni += 5) {
      odleglosci.push(distanceFromEarth('Mars', new Date(J2000.getTime() + dni * 86400_000))!);
    }
    const min = Math.min(...odleglosci);
    const max = Math.max(...odleglosci);
    // Opozycja ~0,5 AU, koniunkcja ~2,5 AU — stąd ogromne różnice jasności.
    expect(min).toBeLessThan(0.8);
    expect(max).toBeGreaterThan(2.2);
  });

  it('Mars zakreśla pętlę — ruch wsteczny jest widoczny w długości', () => {
    // Teza dokumentu: długość ekliptyczna nie rośnie monotonicznie.
    const dlugosci: number[] = [];
    for (let dni = 0; dni < 800; dni += 2) {
      dlugosci.push(geocentricLongitude('Mars', new Date(J2000.getTime() + dni * 86400_000))!);
    }

    let cofniecia = 0;
    for (let i = 1; i < dlugosci.length; i += 1) {
      let delta = dlugosci[i] - dlugosci[i - 1];
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      if (delta < 0) cofniecia += 1;
    }
    expect(cofniecia).toBeGreaterThan(10);
  });

  it('Wenus nigdy nie oddala się od Słońca bardziej niż o ~47°', () => {
    // Elongacja maksymalna Wenus — fakt znany od starożytności.
    let maks = 0;
    for (let dni = 0; dni < 600; dni += 2) {
      const data = new Date(J2000.getTime() + dni * 86400_000);
      const wenus = heliocentric('Venus', data)!;
      const ziemia = heliocentric('Earth', data)!;
      const doSlonca = Math.hypot(ziemia.x, ziemia.y);
      const doWenus = Math.hypot(wenus.x - ziemia.x, wenus.y - ziemia.y);
      const cos = (doSlonca ** 2 + doWenus ** 2 - Math.hypot(wenus.x, wenus.y) ** 2) / (2 * doSlonca * doWenus);
      maks = Math.max(maks, Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI);
    }
    expect(maks).toBeGreaterThan(44);
    expect(maks).toBeLessThan(49);
  });
});

describe('dane ciał', () => {
  it('każda planeta z tablicy elementów ma dane fizyczne', () => {
    for (const planet of Object.keys(KEPLER_J2000)) {
      expect(BODIES[planet], planet).toBeDefined();
      expect(BODIES[planet].mass).toBeGreaterThan(0);
    }
  });

  it('obrót wsteczny Wenus i Urana jest zapisany znakiem', () => {
    expect(BODIES.Venus.rotationPeriod).toBeLessThan(0);
    expect(BODIES.Uranus.rotationPeriod).toBeLessThan(0);
    expect(BODIES.Earth.rotationPeriod).toBeGreaterThan(0);
  });
});
