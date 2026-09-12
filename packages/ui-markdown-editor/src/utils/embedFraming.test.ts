/**
 * Testy rozpoznawania stron, których nie da się osadzić w ramce.
 *
 * Blok „strona" w edytorze markdown wkładał każdy adres do <iframe>. Serwisy
 * zakazujące osadzania (claude.ai, banki, portale społecznościowe) pokazywały
 * wtedy systemową stronę błędu przeglądarki — `net::ERR_BLOCKED_BY_RESPONSE` —
 * czyli komunikat, z którego nie wynika ani co się stało, ani co zrobić.
 *
 * Blokady nie da się obejść (to zabezpieczenie serwisu), więc jedyne, co ma
 * sens, to rozpoznać ją i pokazać kartę z linkiem.
 */
import { describe, it, expect } from 'vitest';
import { framingAllowed, knownBlockedHost, embedDecision } from './embedFraming';

describe('framingAllowed — nagłówki odpowiedzi', () => {
  it('brak nagłówków oznacza zgodę', () => {
    expect(framingAllowed({}, 'https://example.com')).toEqual({ allowed: true });
  });

  it('X-Frame-Options DENY i SAMEORIGIN blokują osadzenie u nas', () => {
    expect(framingAllowed({ 'x-frame-options': 'DENY' }, 'https://claude.ai').allowed).toBe(false);
    expect(framingAllowed({ 'x-frame-options': 'sameorigin' }, 'https://x.org').allowed).toBe(false);
  });

  it('wartość nagłówka trafia do powodu — użytkownik ma wiedzieć, co go zablokowało', () => {
    expect(framingAllowed({ 'x-frame-options': 'DENY' }, 'https://claude.ai').reason)
      .toContain('X-Frame-Options');
  });

  it('CSP frame-ancestors none blokuje', () => {
    const headers = { 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" };
    const result = framingAllowed(headers, 'https://claude.ai');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('frame-ancestors');
  });

  it('CSP frame-ancestors self blokuje osadzenie w innej domenie', () => {
    const headers = { 'content-security-policy': "frame-ancestors 'self'" };
    expect(framingAllowed(headers, 'https://claude.ai').allowed).toBe(false);
  });

  it('CSP bez dyrektywy frame-ancestors nie blokuje', () => {
    expect(framingAllowed({ 'content-security-policy': "default-src 'self'" }, 'https://x.org').allowed)
      .toBe(true);
  });

  it('frame-ancestors z konkretnymi adresami traktujemy jak zgodę — dopiero ramka rozstrzygnie', () => {
    const headers = { 'content-security-policy': 'frame-ancestors https://mycastle.hersztowski.org' };
    expect(framingAllowed(headers, 'https://x.org').allowed).toBe(true);
  });

  it('nagłówki z wielkimi literami w nazwie też są rozpoznawane', () => {
    expect(framingAllowed({ 'X-Frame-Options': 'DENY' }, 'https://x.org').allowed).toBe(false);
  });
});

describe('knownBlockedHost — lista awaryjna, gdy nie znamy nagłówków', () => {
  it('rozpoznaje serwisy notorycznie zakazujące osadzania', () => {
    expect(knownBlockedHost('https://claude.ai/share/abc')).toBe(true);
    expect(knownBlockedHost('https://www.facebook.com/x')).toBe(true);
    expect(knownBlockedHost('https://chatgpt.com/c/1')).toBe(true);
  });

  it('obejmuje poddomeny, ale nie domeny tylko podobne z nazwy', () => {
    expect(knownBlockedHost('https://app.claude.ai/x')).toBe(true);
    expect(knownBlockedHost('https://claude.ai.example.com/x')).toBe(false);
  });

  it('zwykłe adresy przechodzą', () => {
    expect(knownBlockedHost('https://pl.wikipedia.org/wiki/Three.js')).toBe(false);
    expect(knownBlockedHost('/lokalna/strona.html')).toBe(false);
  });
});

describe('embedDecision — co pokazać w bloku', () => {
  it('bez sprawdzenia: znany serwis od razu dostaje kartę, reszta ramkę', () => {
    expect(embedDecision('https://claude.ai/share/abc', null).mode).toBe('card');
    expect(embedDecision('https://example.com', null).mode).toBe('iframe');
  });

  it('wynik sprawdzenia z serwera ma pierwszeństwo nad listą', () => {
    // Serwis z listy, ale serwer mówi, że osadzanie jest dozwolone.
    expect(embedDecision('https://claude.ai/x', { embeddable: true }).mode).toBe('iframe');
    // I odwrotnie: nieznany adres, który jednak blokuje.
    const blocked = embedDecision('https://example.com', { embeddable: false, reason: 'X-Frame-Options: DENY' });
    expect(blocked.mode).toBe('card');
    expect(blocked.reason).toBe('X-Frame-Options: DENY');
  });

  it('tytuł ze sprawdzenia trafia do karty', () => {
    const d = embedDecision('https://claude.ai/x', { embeddable: false, title: 'Rozmowa — Claude' });
    expect(d.title).toBe('Rozmowa — Claude');
  });

  it('nieudane sprawdzenie (serwer niedostępny) wraca do listy awaryjnej', () => {
    expect(embedDecision('https://claude.ai/x', { error: 'offline' }).mode).toBe('card');
    expect(embedDecision('https://example.com', { error: 'offline' }).mode).toBe('iframe');
  });
});
