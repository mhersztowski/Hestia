/**
 * embedFraming.ts — czy dany adres wolno pokazać w ramce bloku „strona".
 *
 * Serwisy chronią się przed osadzaniem nagłówkiem `X-Frame-Options` albo
 * dyrektywą CSP `frame-ancestors`. Przeglądarka honoruje to bezwarunkowo i
 * wyświetla w ramce własną stronę błędu (`net::ERR_BLOCKED_BY_RESPONSE`), której
 * treści nie da się ani odczytać, ani zastąpić z JavaScriptu. Obejść tego się
 * nie da i nie powinno — to zabezpieczenie serwisu przed clickjackingiem.
 *
 * Jedyne sensowne wyjście: rozpoznać blokadę ZANIM włożymy adres do ramki i
 * pokazać zamiast niej kartę z tytułem i linkiem. Rozpoznajemy dwutorowo:
 *   • pytamy backend o nagłówki (`GET /api/embed-check`) — źródło pewne;
 *   • gdy backend nie odpowie, korzystamy z listy serwisów, o których wiadomo,
 *     że osadzania zabraniają.
 */

export interface FramingVerdict {
  allowed: boolean;
  /** Co dokładnie zablokowało — trafia do karty jako wyjaśnienie. */
  reason?: string;
}

/** Odpowiedź `GET /api/embed-check` (albo `{ error }`, gdy zapytanie padło). */
export interface EmbedCheckResult {
  embeddable?: boolean;
  reason?: string;
  title?: string;
  error?: string;
}

/**
 * Serwisy, które konsekwentnie zakazują osadzania.
 *
 * Lista jest awaryjna — używana, gdy nie znamy nagłówków. Nie musi być pełna:
 * nieznany adres i tak trafi do ramki, a użytkownik zobaczy najwyżej to, co
 * dotychczas.
 */
const BLOCKED_HOSTS = [
  'claude.ai', 'chatgpt.com', 'chat.openai.com', 'openai.com',
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'linkedin.com',
  'accounts.google.com', 'mail.google.com', 'drive.google.com',
  'github.com', 'gitlab.com', 'notion.so', 'slack.com', 'discord.com',
];

function hostOf(url: string): string | null {
  try {
    return new URL(url, window.location.origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Czy adres należy do serwisu z listy (host albo jego poddomena). */
export function knownBlockedHost(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
}

/** Rozstrzyga na podstawie nagłówków odpowiedzi (nazwy bez rozróżniania wielkości liter). */
export function framingAllowed(headers: Record<string, string>, pageUrl: string): FramingVerdict {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

  const xfo = lower['x-frame-options']?.trim().toUpperCase();
  if (xfo === 'DENY' || xfo === 'SAMEORIGIN') {
    // SAMEORIGIN też nas dotyczy: ramka jest w naszej domenie, nie w ich.
    return { allowed: false, reason: `X-Frame-Options: ${xfo}` };
  }

  const csp = lower['content-security-policy'];
  if (csp) {
    const directive = csp.split(';').map((d) => d.trim())
      .find((d) => d.toLowerCase().startsWith('frame-ancestors'));
    if (directive) {
      const value = directive.slice('frame-ancestors'.length).trim().toLowerCase();
      if (value === "'none'" || value === "'self'") {
        return { allowed: false, reason: `CSP frame-ancestors ${value}` };
      }
      // Konkretna lista adresów — może nas obejmować. Niech rozstrzygnie ramka:
      // fałszywe „nie da się" byłoby gorsze niż jedna nieudana próba.
    }
  }

  void pageUrl; // adres przyda się, gdy zaczniemy dopasowywać listę frame-ancestors
  return { allowed: true };
}

export interface EmbedDecision {
  mode: 'iframe' | 'card';
  reason?: string;
  title?: string;
}

/**
 * Co pokazać w bloku: ramkę czy kartę z linkiem.
 *
 * @param url adres z bloku
 * @param check wynik zapytania do backendu; `null` = jeszcze nie sprawdzono,
 *   `{ error }` = sprawdzenie się nie udało (wracamy do listy awaryjnej)
 */
export function embedDecision(url: string, check: EmbedCheckResult | null): EmbedDecision {
  if (check && typeof check.embeddable === 'boolean') {
    return check.embeddable
      ? { mode: 'iframe', title: check.title }
      : { mode: 'card', reason: check.reason, title: check.title };
  }
  return knownBlockedHost(url)
    ? { mode: 'card', reason: 'Ten serwis nie pozwala na osadzanie stron w ramce.', title: check?.title }
    : { mode: 'iframe', title: check?.title };
}
