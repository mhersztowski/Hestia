import { describe, it, expect } from 'vitest';
import { parseQuantity, toSI, sameDimension, UnitError } from './quantity';
import { CONSTANTS, constantValue } from './constants';

describe('czytanie wielkości', () => {
  it('konwertuje do SI', () => {
    expect(toSI('1.5 m')).toBeCloseTo(1.5, 9);
    expect(toSI('15 deg')).toBeCloseTo(Math.PI / 12, 9);
    expect(toSI('90 km/h')).toBeCloseTo(25, 9);
    expect(toSI('1 h')).toBeCloseTo(3600, 9);
  });

  it('liczba bez jednostki przechodzi bez zmian', () => {
    expect(toSI(0.02)).toBe(0.02);
    expect(toSI('0.5')).toBe(0.5);
  });

  it('zapamiętuje jednostkę zapisu, żeby dało się wrócić do niej w UI', () => {
    expect(parseQuantity('15 deg').unit).toBe('deg');
  });

  it('niezgodny wymiar jest błędem, nie cichą konwersją', () => {
    expect(() => toSI('5 kg', 'm')).toThrow(UnitError);
    // Brak jednostki tam, gdzie wymagana — najczęstsza pomyłka w JSON-ie dokumentu.
    expect(() => toSI(15, 'deg')).toThrow(UnitError);
  });

  it('zgodny wymiar przechodzi niezależnie od jednostki zapisu', () => {
    expect(toSI('100 cm', 'm')).toBeCloseTo(1, 9);
  });

  it('bełkot jest błędem z czytelnym komunikatem', () => {
    expect(() => toSI('nie wiem ile')).toThrow(UnitError);
  });
});

describe('analiza wymiarowa', () => {
  it('rozpoznaje ten sam wymiar zapisany różnie', () => {
    expect(sameDimension('m/s^2', 'km/h^2')).toBe(true);
    expect(sameDimension('N', 'kg m / s^2')).toBe(true);
    expect(sameDimension('J', 'N m')).toBe(true);
  });

  it('rozróżnia wymiary', () => {
    expect(sameDimension('m', 's')).toBe(false);
    expect(sameDimension('W', 'J')).toBe(false);
  });
});

describe('stałe fizyczne', () => {
  it('zgadzają się z tablicami CODATA', () => {
    expect(constantValue('c')).toBe(299_792_458);
    expect(constantValue('G')).toBeCloseTo(6.6743e-11, 15);
    expect(constantValue('k_B')).toBeCloseTo(1.380649e-23, 28);
  });

  it('każda stała ma jednostkę, którą da się odczytać', () => {
    for (const [key, constant] of Object.entries(CONSTANTS)) {
      expect(constant.unit, `${key} bez jednostki`).toBeTruthy();
      expect(() => toSI(`1 ${constant.unit}`), `${key}: ${constant.unit}`).not.toThrow();
    }
  });

  it('nieznana stała nie udaje zera', () => {
    expect(constantValue('nieistniejaca')).toBeUndefined();
  });
});
