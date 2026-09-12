/**
 * Krok 0: rejestr widoków bloków.
 *
 * Test sprawdza kontrakt, na którym stoi wpięcie pakietów zewnętrznych —
 * a przy okazji, że bloki `formula`/`sim` z `sci-blocks` faktycznie się w nim
 * meldują, nie wiedząc nic o edytorze.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerBlockRenderer, rendererFor, registeredBlockRenderers,
  subscribeBlockRenderers, blockRenderersVersion,
} from './blockRenderers';
import { registerSciBlocks } from '@hestia/ui-sci-blocks';

const Dummy = (() => null) as unknown as React.ComponentType<never>;

describe('rejestr widoków bloków', () => {
  beforeEach(() => {
    for (const renderer of [...registeredBlockRenderers()]) {
      registerBlockRenderer(renderer)();
    }
  });

  it('nieznany język zostaje zwykłym blokiem kodu', () => {
    expect(rendererFor('python')).toBeUndefined();
    expect(rendererFor('')).toBeUndefined();
  });

  it('zarejestrowany widok obsługuje swoje języki', () => {
    registerBlockRenderer({ name: 'x', matches: (l) => l === 'mermaid', Component: Dummy as never });
    expect(rendererFor('mermaid')?.name).toBe('x');
    expect(rendererFor('python')).toBeUndefined();
  });

  it('powtórna rejestracja tej samej nazwy podmienia, nie dokłada', () => {
    registerBlockRenderer({ name: 'x', matches: () => true, Component: Dummy as never });
    registerBlockRenderer({ name: 'x', matches: () => true, Component: Dummy as never });
    expect(registeredBlockRenderers().filter((r) => r.name === 'x')).toHaveLength(1);
  });

  it('wyrejestrowanie zwraca blok do postaci zwykłego kodu', () => {
    const off = registerBlockRenderer({ name: 'x', matches: (l) => l === 'foo', Component: Dummy as never });
    expect(rendererFor('foo')).toBeDefined();
    off();
    expect(rendererFor('foo')).toBeUndefined();
  });

  it('później zarejestrowany widok wygrywa — da się nadpisać wbudowany', () => {
    registerBlockRenderer({ name: 'a', matches: () => true, Component: Dummy as never });
    registerBlockRenderer({ name: 'b', matches: () => true, Component: Dummy as never });
    expect(rendererFor('cokolwiek')?.name).toBe('b');
  });
});

describe('bloki sci wpinają się przez ten sam rejestr', () => {
  beforeEach(() => {
    for (const renderer of [...registeredBlockRenderers()]) registerBlockRenderer(renderer)();
    registerSciBlocks(registerBlockRenderer);
  });

  it('obsługuje wzory i symulacje', () => {
    expect(rendererFor('formula:pendulum-ode')?.name).toBe('sci-formula');
    expect(rendererFor('sim')?.name).toBe('sci-sim');
    expect(rendererFor('sim:pendulum')?.name).toBe('sci-sim');
  });

  it('nie przechwytuje cudzych języków', () => {
    expect(rendererFor('formula')).toBeUndefined();
    expect(rendererFor('simulink')).toBeUndefined();
    expect(rendererFor('mermaid')).toBeUndefined();
  });
});

describe('odporność rejestru', () => {
  beforeEach(() => {
    for (const renderer of [...registeredBlockRenderers()]) registerBlockRenderer(renderer)();
  });

  it('powiadamia o rejestracji — blok zarejestrowany po renderze też zadziała', () => {
    // To jest scenariusz, który wcześniej gubił bloki sci: moduł rejestrujący
    // wczytywał się po pierwszym renderze, a widok już nigdy o tym nie wiedział.
    let powiadomienia = 0;
    const off = subscribeBlockRenderers(() => { powiadomienia += 1; });

    const wersjaPrzed = blockRenderersVersion();
    const unregister = registerBlockRenderer({ name: 'późny', matches: (l) => l === 'x', Component: Dummy as never });

    expect(powiadomienia).toBe(1);
    expect(blockRenderersVersion()).toBeGreaterThan(wersjaPrzed);
    expect(rendererFor('x')?.name).toBe('późny');

    unregister();
    expect(powiadomienia).toBe(2);
    off();
  });

  it('po odsubskrybowaniu nie ma powiadomień', () => {
    let powiadomienia = 0;
    const off = subscribeBlockRenderers(() => { powiadomienia += 1; });
    off();
    registerBlockRenderer({ name: 'y', matches: () => false, Component: Dummy as never });
    expect(powiadomienia).toBe(0);
  });

  it('wersja rośnie monotonicznie', () => {
    const a = blockRenderersVersion();
    registerBlockRenderer({ name: 'z1', matches: () => false, Component: Dummy as never });
    const b = blockRenderersVersion();
    registerBlockRenderer({ name: 'z2', matches: () => false, Component: Dummy as never });
    expect(b).toBeGreaterThan(a);
    expect(blockRenderersVersion()).toBeGreaterThan(b);
  });
});

describe('rysunek i tablica w edytorze', () => {
  beforeEach(() => {
    for (const renderer of [...registeredBlockRenderers()]) registerBlockRenderer(renderer)();
    registerSciBlocks(registerBlockRenderer);
  });

  it('blok figure ma własny widok, a nie surowy kod', () => {
    // Bez tego edytor wyrzucał na ekran kilkadziesiąt kilobajtów base64
    // zamiast obrazu — blok wyglądał jak zwykły blok kodu.
    expect(rendererFor('figure:rh1-15-rys1')?.name).toBe('sci-figure');
  });

  it('blok table ma własny widok', () => {
    expect(rendererFor('table:rh1-15-tab1')?.name).toBe('sci-table');
  });

  it('nie łapie zwykłego bloku kodu o podobnej nazwie', () => {
    expect(rendererFor('figures')).toBeUndefined();
    expect(rendererFor('tablespace')).toBeUndefined();
  });
});
