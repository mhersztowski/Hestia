/**
 * Testy źródła projektów UML dla pluginu MinisLib Graph.
 *
 * Najważniejsze są przypadki brzegowe adresu serwera (użytkownik wpisze i „mycastle
 * .hersztowski.org", i wersję ze slashem na końcu) oraz to, że tryb zdalny bez
 * poświadczeń nie udaje, że działa.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DEFAULT_UML_SERVER, normalizeBaseUrl, defaultUmlSource, readUmlSource, writeUmlSource,
  umlSourceReady, umlEndpoint, describeUmlSource, loginForToken,
  filterUmlEntries, base64ToUtf8, sessionUserName, sessionToken,
} from './umlSource';

/** Zapisuje sesję hosta w takim kształcie, w jakim trzyma ją AuthContext. */
function setSession(name: string, token = 'host-token'): void {
  localStorage.setItem('minis_current_user', JSON.stringify({ user: { name }, token }));
}

describe('normalizeBaseUrl', () => {
  it('dokłada https i ucina końcowy slash', () => {
    expect(normalizeBaseUrl('mycastle.hersztowski.org')).toBe('https://mycastle.hersztowski.org');
    expect(normalizeBaseUrl('https://mycastle.hersztowski.org/')).toBe('https://mycastle.hersztowski.org');
    expect(normalizeBaseUrl('  https://x.org//  ')).toBe('https://x.org');
  });

  it('adresy lokalne dostają http — localhost nie ma TLS-a', () => {
    expect(normalizeBaseUrl('http://localhost:1894')).toBe('http://localhost:1894');
    expect(normalizeBaseUrl('localhost:1894')).toBe('http://localhost:1894');
    expect(normalizeBaseUrl('127.0.0.1:1894')).toBe('http://127.0.0.1:1894');
    expect(normalizeBaseUrl('nas.local:1894')).toBe('http://nas.local:1894');
    // Wymuszony https zostaje — użytkownik wie lepiej.
    expect(normalizeBaseUrl('https://localhost:1894')).toBe('https://localhost:1894');
  });

  it('puste wejście daje pusty string — wywołujący decyduje, co z tym zrobić', () => {
    expect(normalizeBaseUrl('   ')).toBe('');
  });
});

describe('konfiguracja w localStorage', () => {
  beforeEach(() => localStorage.clear());

  it('domyślnie tryb lokalny z adresem produkcyjnym w polu serwera', () => {
    const cfg = readUmlSource();
    expect(cfg).toEqual(defaultUmlSource());
    expect(cfg.mode).toBe('local');
    expect(cfg.baseUrl).toBe(DEFAULT_UML_SERVER);
  });

  it('round-trip zapisu i odczytu, z normalizacją adresu', () => {
    writeUmlSource({ mode: 'remote', baseUrl: 'mycastle.hersztowski.org/', userName: 'marcin', token: 'abc' });
    expect(readUmlSource()).toEqual({
      mode: 'remote', baseUrl: 'https://mycastle.hersztowski.org', userName: 'marcin', token: 'abc',
    });
  });

  it('uszkodzony wpis nie wysadza edytora — wracamy do domyślnych', () => {
    localStorage.setItem('minislib.umlSource', '{to nie json');
    expect(readUmlSource()).toEqual(defaultUmlSource());
  });
});

describe('sesja hosta', () => {
  beforeEach(() => localStorage.clear());

  it('czyta nazwę i token z wpisu AuthContextu', () => {
    setSession('marcin', 'jwt-abc');
    expect(sessionUserName()).toBe('marcin');
    expect(sessionToken()).toBe('jwt-abc');
  });

  it('brak sesji to puste wartości, nie wyjątek', () => {
    expect(sessionUserName()).toBe('');
    expect(sessionToken()).toBe('');
  });

  it('uszkodzony wpis nie wysadza edytora', () => {
    localStorage.setItem('minis_current_user', 'nie-json');
    expect(sessionUserName()).toBe('');
    expect(sessionToken()).toBe('');
  });
});

describe('umlSourceReady', () => {
  beforeEach(() => localStorage.clear());

  it('lokalny wymaga zalogowanego użytkownika — bez niego nie ma czyjego katalogu czytać', () => {
    const local = { mode: 'local' as const, baseUrl: '', userName: '', token: '' };
    expect(umlSourceReady(local)).toBe(false);
    setSession('marcin');
    expect(umlSourceReady(local)).toBe(true);
  });

  it('zdalny wymaga adresu, użytkownika i tokena', () => {
    const base = { mode: 'remote' as const, baseUrl: DEFAULT_UML_SERVER, userName: 'marcin', token: 't' };
    expect(umlSourceReady(base)).toBe(true);
    expect(umlSourceReady({ ...base, token: '' })).toBe(false);
    expect(umlSourceReady({ ...base, userName: '' })).toBe(false);
    expect(umlSourceReady({ ...base, baseUrl: '' })).toBe(false);
  });
});

describe('umlEndpoint', () => {
  beforeEach(() => localStorage.clear());

  const remote = { mode: 'remote' as const, baseUrl: DEFAULT_UML_SERVER, userName: 'marcin', token: 't' };

  it('zdalny adres celuje w katalog uml wybranego użytkownika, z Bearerem z konfiguracji', () => {
    const { url, headers } = umlEndpoint(remote, 'readdir');
    expect(url).toBe(
      'https://mycastle.hersztowski.org/api/users/marcin/vfs/readdir'
      + '?path=%2Fdata%2FMinis%2FUsers%2Fmarcin%2Fdrive%2Fuml',
    );
    expect(headers).toEqual({ Authorization: 'Bearer t' });
  });

  it('lokalny backend po adresie z portem używa http i tokena z konfiguracji', () => {
    const { url } = umlEndpoint({ ...remote, baseUrl: 'localhost:1894' }, 'readdir');
    expect(url.startsWith('http://localhost:1894/api/users/marcin/vfs/readdir')).toBe(true);
  });

  it('czytanie pliku dokłada nazwę projektu do ścieżki', () => {
    const { url } = umlEndpoint(remote, 'readFile', 'silnik.umlproj.json');
    expect(decodeURIComponent(url.split('path=')[1])).toBe('/data/Minis/Users/marcin/drive/uml/silnik.umlproj.json');
  });

  it('nazwa użytkownika ze znakiem specjalnym jest zakodowana w ścieżce URL', () => {
    const { url } = umlEndpoint({ ...remote, baseUrl: 'https://x.org', userName: 'a b' }, 'readdir');
    expect(url).toContain('/api/users/a%20b/vfs/readdir');
  });

  it('tryb lokalny bierze użytkownika i token z sesji, a URL jest relatywny', () => {
    setSession('marcin', 'jwt-host');
    const { url, headers } = umlEndpoint(defaultUmlSource(), 'readdir');
    expect(url).toBe('/api/users/marcin/vfs/readdir?path=%2Fdata%2FMinis%2FUsers%2Fmarcin%2Fdrive%2Fuml');
    expect(headers).toEqual({ Authorization: 'Bearer jwt-host' });
  });

  it('braki zgłasza czytelnym wyjątkiem, zamiast oddawać pustą listę', () => {
    expect(() => umlEndpoint(defaultUmlSource(), 'readdir')).toThrow(/zalogowan/i);
    expect(() => umlEndpoint({ ...remote, userName: '' }, 'readdir')).toThrow(/użytkownika/i);
    expect(() => umlEndpoint({ ...remote, token: '' }, 'readdir')).toThrow(/token/i);
    expect(() => umlEndpoint({ ...remote, baseUrl: '' }, 'readdir')).toThrow(/adres/i);
  });
});

describe('describeUmlSource', () => {
  beforeEach(() => localStorage.clear());

  it('opisuje źródło tak, jak trafia do UI', () => {
    expect(describeUmlSource(defaultUmlSource())).toBe('ten serwer (brak zalogowanego użytkownika)');
    setSession('marcin');
    expect(describeUmlSource(defaultUmlSource())).toBe('ten serwer, użytkownik marcin');
    expect(describeUmlSource({ mode: 'remote', baseUrl: 'https://x.org', userName: 'marcin', token: 't' }))
      .toBe('marcin @ https://x.org');
    expect(describeUmlSource({ mode: 'remote', baseUrl: 'https://x.org', userName: '', token: '' }))
      .toBe('https://x.org (brak poświadczeń)');
  });
});

describe('filterUmlEntries', () => {
  it('zostawia same projekty UML, katalogi i inne pliki odpada', () => {
    expect(filterUmlEntries([
      { name: 'stary', type: 2 },
      { name: 'b.umlproj.json', type: 1 },
      { name: 'notatka.md', type: 1 },
      { name: 'a.umlproj.json', type: 1 },
    ])).toEqual(['a.umlproj.json', 'b.umlproj.json']);
  });

  it('brak wpisów to pusta lista, nie wyjątek', () => {
    expect(filterUmlEntries(undefined)).toEqual([]);
  });
});

describe('base64ToUtf8', () => {
  it('poprawnie odtwarza polskie znaki', () => {
    const text = '{"doc":"Zwraca łączną liczbę części — zaokrągloną"}';
    const b64 = Buffer.from(text, 'utf-8').toString('base64');
    expect(base64ToUtf8(b64)).toBe(text);
  });
});

describe('loginForToken', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it('wysyła nazwę i hasło na /api/auth/login i zwraca token', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ token: 'jwt-123' }) });

    const token = await loginForToken('mycastle.hersztowski.org', 'marcin', 'tajne');

    expect(token).toBe('jwt-123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mycastle.hersztowski.org/api/auth/login');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'marcin', password: 'tajne' });
  });

  it('błędne dane to czytelny wyjątek, nie cichy null', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Invalid credentials' }) });
    await expect(loginForToken('https://x.org', 'marcin', 'zle')).rejects.toThrow('Invalid credentials');
  });

  it('serwer bez tokena w odpowiedzi też jest błędem', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(loginForToken('https://x.org', 'u', 'p')).rejects.toThrow(/token/i);
  });
});
