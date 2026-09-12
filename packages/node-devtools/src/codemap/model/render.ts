import { CodeMember, CodeParam, Visibility, sigil } from './CodeModel.js';

/** Render a member into its UML text line, e.g. `+ getId(): string`. */
export function renderMember(m: Omit<CodeMember, 'id' | 'text'>): string {
  const vis = sigil(m.visibility);
  const stat = m.isStatic ? 'static ' : '';
  if (m.kind === 'field') {
    return `${vis} ${stat}${m.name}${m.type ? `: ${m.type}` : ''}`.trim();
  }
  // `static async` in the same order as in TS code — the line should read like a signature.
  const asyncMod = m.isAsync ? 'async ' : '';
  const params = (m.params ?? []).map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ');
  return `${vis} ${stat}${asyncMod}${m.name}(${params})${m.type ? `: ${m.type}` : ''}`.trim();
}

/**
 * Parse a UML member line back into structured form (best-effort) — used when
 * reconstructing a model from a hand-edited UML diagram for code generation.
 */
export function parseMemberText(text: string): { visibility: Visibility; isStatic: boolean; isAsync: boolean; name: string; type?: string; params?: CodeParam[]; kind: 'field' | 'method' } {
  let s = text.trim();
  let visibility: Visibility = 'public';
  const sig = s[0];
  if (sig === '+') visibility = 'public';
  else if (sig === '-') visibility = 'private';
  else if (sig === '#') visibility = 'protected';
  else if (sig === '~') visibility = 'package';
  if ('+-#~'.includes(sig)) s = s.slice(1).trim();
  let isStatic = false;
  if (s.startsWith('static ')) { isStatic = true; s = s.slice(7).trim(); }
  let isAsync = false;
  if (s.startsWith('async ')) { isAsync = true; s = s.slice(6).trim(); }

  const paren = s.indexOf('(');
  if (paren >= 0) {
    const name = s.slice(0, paren).trim();
    const close = s.indexOf(')', paren);
    const inner = close > paren ? s.slice(paren + 1, close) : '';
    const after = close >= 0 ? s.slice(close + 1).trim() : '';
    const type = after.startsWith(':') ? after.slice(1).trim() : undefined;
    const params: CodeParam[] = inner.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
      const c = p.indexOf(':');
      return c >= 0 ? { name: p.slice(0, c).trim(), type: p.slice(c + 1).trim() } : { name: p };
    });
    return { visibility, isStatic, isAsync, name, type, params, kind: 'method' };
  }
  const colon = s.indexOf(':');
  const name = colon >= 0 ? s.slice(0, colon).trim() : s.trim();
  const type = colon >= 0 ? s.slice(colon + 1).trim() : undefined;
  return { visibility, isStatic, isAsync, name, type, kind: 'field' };
}
