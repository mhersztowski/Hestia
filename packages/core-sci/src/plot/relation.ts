/**
 * relation.ts — rozdzielenie wiersza na strony relacji.
 *
 * Warstwa czysto tekstowa, celowo oddzielona od kompilacji: żeby wiedzieć, czy
 * `y = x^2` jest wykresem, czy definicją, trzeba najpierw wiedzieć, **gdzie**
 * kończy się lewa strona. Silnik wyrażeń tego nie powie — dostaje już gotowe
 * kawałki.
 *
 * Dwie rzeczy, które muszą być zrobione dokładnie, bo mylą się cicho:
 *
 *  • **`\le` zawiera literę `e`, a nie znak `<`.** Podział po gołym `<`
 *    rozerwałby polecenie LaTeX-a na pół i zostawił „\" jako lewą stronę.
 *  • **`=` bywa częścią zapisu.** W `\sum_{i=1}^{n}` znak równości jest
 *    indeksem sumowania, nie relacją wiersza. Dlatego szukamy tylko na
 *    najwyższym poziomie zagnieżdżenia nawiasów.
 */

export type RelationOp = '=' | '<' | '>' | '<=' | '>=';

export interface RelationParts {
  lhs: string;
  op: RelationOp;
  rhs: string;
}

/** Polecenia LaTeX-a rozpoznawane jako relacje, od najdłuższego. */
const COMMANDS: Array<{ text: string; op: RelationOp }> = [
  { text: '\\leqslant', op: '<=' },
  { text: '\\geqslant', op: '>=' },
  { text: '\\leq', op: '<=' },
  { text: '\\geq', op: '>=' },
  { text: '\\le', op: '<=' },
  { text: '\\ge', op: '>=' },
];

/**
 * Polecenia, które wyglądają jak relacja, ale nią nie są.
 *
 * `\ne` nie ma sensownego obrazu na płaszczyźnie — „wszystko poza krzywą" to
 * niemal cały ekran. Lepiej zgłosić wiersz jako nierozpoznany, niż narysować
 * coś, czego autor nie zamawiał. Trzymane osobno, żeby przedrostek `\ne` nie
 * został przypadkiem dopasowany jako `\ge`.
 */
const NOT_RELATIONS = ['\\neq', '\\ne'];

/**
 * Rozdziela wiersz na `lhs op rhs`.
 *
 * Zwraca `undefined`, gdy wiersz nie zawiera relacji na najwyższym poziomie —
 * takie wyrażenie jest po prostu wartością do narysowania albo policzenia.
 */
export function splitRelation(latex: string): RelationParts | undefined {
  let depth = 0;

  for (let i = 0; i < latex.length; i += 1) {
    const ch = latex[i];

    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;

    if (depth !== 0) continue;

    if (ch === '\\') {
      // Najpierw odsiewamy to, co relacją nie jest — inaczej `\neq` zostałoby
      // pomylone z niczym, ale `\ne` mogłoby wpaść w dopasowanie przedrostka.
      const excluded = NOT_RELATIONS.find((cmd) => latex.startsWith(cmd, i));
      if (excluded) {
        i += excluded.length - 1;
        continue;
      }

      const found = COMMANDS.find((cmd) => latex.startsWith(cmd.text, i));
      if (found) {
        return {
          lhs: latex.slice(0, i).trim(),
          op: found.op,
          rhs: latex.slice(i + found.text.length).trim(),
        };
      }
      // Każde inne polecenie przeskakujemy w całości: `\lt`, `\max`, `\exp`
      // nie mogą kryć w środku znaku, którego szukamy.
      i += 1;
      continue;
    }

    if (ch === '<' || ch === '>') {
      const nieostra = latex[i + 1] === '=';
      return {
        lhs: latex.slice(0, i).trim(),
        op: (nieostra ? `${ch}=` : ch) as RelationOp,
        rhs: latex.slice(i + (nieostra ? 2 : 1)).trim(),
      };
    }

    if (ch === '=') {
      // `<=` i `>=` zostały już obsłużone wyżej, więc goły `=` jest równością.
      return { lhs: latex.slice(0, i).trim(), op: '=', rhs: latex.slice(i + 1).trim() };
    }
  }

  return undefined;
}
