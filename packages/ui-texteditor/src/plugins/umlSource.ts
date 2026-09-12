/**
 * umlSource.ts — skąd plugin MinisLib Graph bierze projekty UML.
 *
 * Domyślnie z serwera, na którym działa edytor (ścieżki relatywne + token
 * sesji hosta). Drugi tryb to **serwer zdalny**: pełny adres MyCastle
 * (domyślnie produkcyjny) plus nazwa użytkownika i token — dzięki temu w
 * edytorze uruchomionym lokalnie widać projekty UML z serwera produkcyjnego.
 *
 * Backend MyCastle odpowiada `Access-Control-Allow-Origin: *`, więc zapytania
 * cross-origin przechodzą, ale VFS jest za uwierzytelnieniem — stąd token.
 * Hasło służy tylko do jednorazowego pobrania tokena i nigdy nie jest zapisywane.
 */

/** Domyślny adres serwera dla trybu zdalnego. */
export const DEFAULT_UML_SERVER = 'https://mycastle.hersztowski.org';

/** Katalog projektów UML w drive użytkownika. */
export const UML_DIR_REL = 'drive/uml';

const STORAGE_KEY = 'minislib.umlSource';

export type UmlSourceMode = 'local' | 'remote';

export interface UmlSourceConfig {
  mode: UmlSourceMode;
  /** Adres serwera dla trybu zdalnego (bez końcowego slasha). */
  baseUrl: string;
  /** Właściciel katalogu `drive/uml` na serwerze zdalnym. */
  userName: string;
  /** JWT albo klucz API (`minis_…`) do serwera zdalnego. */
  token: string;
}

export function defaultUmlSource(): UmlSourceConfig {
  // Adres produkcyjny wpisujemy od razu, żeby po przełączeniu na „zdalny"
  // zostało tylko podanie użytkownika i tokena.
  return { mode: 'local', baseUrl: DEFAULT_UML_SERVER, userName: '', token: '' };
}

/** Hosty, które prawie nigdy nie mają TLS-a — dla nich domyślny schemat to http. */
function isLocalHostname(hostPart: string): boolean {
  const host = hostPart.replace(/:\d+$/, '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
    || host === '[::1]' || host === '::1' || host.endsWith('.local');
}

/**
 * Sprowadza adres do postaci `schemat://host[:port]`.
 *
 * Bez schematu doklejamy `https`, ale dla adresów lokalnych (`localhost:1894`,
 * `127.0.0.1:1894`, `*.local`) `http` — inaczej wpisanie własnego backendu
 * kończy się nieudanym uściskiem TLS i pustą listą projektów.
 */
export function normalizeBaseUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return '';
  const scheme = isLocalHostname(raw.split('/')[0]) ? 'http' : 'https';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `${scheme}://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

/**
 * Nazwa zalogowanego użytkownika — z sesji hosta, a w ostateczności z adresu
 * strony (`/user/{nazwa}/…`).
 *
 * Sam adres nie wystarcza: edytor bywa otwierany ze ścieżek bez segmentu
 * `/user/{nazwa}/` (np. Drive), a wtedy tryb lokalny nie miał czyjego katalogu
 * `drive/uml` czytać i lista projektów wychodziła pusta bez żadnego komunikatu.
 */
export function sessionUserName(): string {
  try {
    const raw = localStorage.getItem('minis_current_user');
    if (raw) {
      const parsed = JSON.parse(raw) as { user?: { name?: string }; name?: string };
      const name = parsed.user?.name ?? parsed.name;
      if (name) return name;
    }
  } catch { /* uszkodzona sesja — spróbujemy z adresu */ }
  try {
    return window.location.pathname.match(/\/user\/([^/]+)/)?.[1] ?? '';
  } catch {
    return '';
  }
}

/** Token sesji hosta (tryb lokalny). */
export function sessionToken(): string {
  try {
    const raw = localStorage.getItem('minis_current_user');
    if (!raw) return '';
    return (JSON.parse(raw) as { token?: string }).token ?? '';
  } catch { return ''; }
}

export function readUmlSource(): UmlSourceConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultUmlSource();
    const parsed = JSON.parse(raw) as Partial<UmlSourceConfig>;
    const fallback = defaultUmlSource();
    return {
      mode: parsed.mode === 'remote' ? 'remote' : 'local',
      baseUrl: normalizeBaseUrl(parsed.baseUrl ?? fallback.baseUrl) || fallback.baseUrl,
      userName: parsed.userName ?? '',
      token: parsed.token ?? '',
    };
  } catch {
    return defaultUmlSource();
  }
}

export function writeUmlSource(cfg: UmlSourceConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg, baseUrl: normalizeBaseUrl(cfg.baseUrl) }));
  } catch { /* tryb prywatny — ustawienie nie przetrwa sesji, ale edytor działa */ }
}

/** Czy z tej konfiguracji da się w ogóle czytać projekty. */
export function umlSourceReady(cfg: UmlSourceConfig): boolean {
  if (cfg.mode === 'local') return Boolean(sessionUserName());
  return Boolean(normalizeBaseUrl(cfg.baseUrl) && cfg.userName.trim() && cfg.token.trim());
}

export interface UmlEndpoint {
  /** Pełny URL (tryb zdalny) albo relatywny wobec hosta (tryb lokalny). */
  url: string;
  headers: Record<string, string>;
}

/**
 * URL i nagłówki operacji VFS dla aktywnego źródła.
 *
 * Rzuca wyjątkiem z gotowym komunikatem, gdy czegoś brakuje — pusta lista
 * projektów bez powodu była najbardziej mylącym objawem tej funkcji.
 */
export function umlEndpoint(cfg: UmlSourceConfig, op: 'readdir' | 'readFile', file?: string): UmlEndpoint {
  const user = (cfg.mode === 'remote' ? cfg.userName : sessionUserName()).trim();
  if (!user) {
    throw new Error(cfg.mode === 'remote'
      ? 'Podaj nazwę użytkownika na serwerze zdalnym.'
      : 'Nie udało się ustalić zalogowanego użytkownika — zaloguj się albo wskaż serwer zdalny.');
  }

  const dir = `/data/Minis/Users/${user}/${UML_DIR_REL}`;
  const path = file ? `${dir}/${file}` : dir;
  const query = `/api/users/${encodeURIComponent(user)}/vfs/${op}?path=${encodeURIComponent(path)}`;

  if (cfg.mode === 'local') {
    const token = sessionToken();
    return { url: query, headers: token ? { Authorization: `Bearer ${token}` } : {} };
  }

  const base = normalizeBaseUrl(cfg.baseUrl);
  if (!base) throw new Error('Podaj adres serwera.');
  const token = cfg.token.trim();
  if (!token) throw new Error('Podaj token albo zaloguj się hasłem („Połącz").');
  return { url: `${base}${query}`, headers: { Authorization: `Bearer ${token}` } };
}

/** Krótki opis źródła do nagłówka listy projektów. */
export function describeUmlSource(cfg: UmlSourceConfig): string {
  if (cfg.mode === 'local') {
    const user = sessionUserName();
    return user ? `ten serwer, użytkownik ${user}` : 'ten serwer (brak zalogowanego użytkownika)';
  }
  const base = normalizeBaseUrl(cfg.baseUrl);
  if (!cfg.userName.trim() || !cfg.token.trim()) return `${base} (brak poświadczeń)`;
  return `${cfg.userName} @ ${base}`;
}

/** Rozszerzenie plików projektów UML. */
export const UML_PROJECT_EXT = '.umlproj.json';

/** Z listy wpisów katalogu zostawia same projekty UML, posortowane po nazwie. */
export function filterUmlEntries(entries: Array<{ name: string; type: number }> | undefined): string[] {
  return (entries ?? [])
    // type 2 = katalog w VFS
    .filter((e) => e.type !== 2 && e.name.toLowerCase().endsWith(UML_PROJECT_EXT))
    .map((e) => e.name)
    .sort();
}

/**
 * Dekoduje base64 z VFS jako UTF-8.
 *
 * Samo `atob()` zwraca bajty w latin-1, więc polskie opisy TSDoc w projektach
 * UML rozsypałyby się na krzaki.
 */
export function base64ToUtf8(data: string): string {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Wymienia nazwę i hasło na JWT (`POST /api/auth/login`).
 *
 * Hasło zostaje w pamięci formularza — zapisujemy wyłącznie zwrócony token,
 * bo tylko on jest potrzebny do czytania projektów.
 */
export async function loginForToken(baseUrl: string, name: string, password: string): Promise<string> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('Podaj adres serwera.');
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  const data = await res.json().catch(() => ({})) as { token?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Logowanie nie powiodło się (HTTP ${res.status}).`);
  if (!data.token) throw new Error('Serwer nie zwrócił tokena.');
  return data.token;
}
