/**
 * parseExercise.ts — blok ```exercise:id ⇄ zadanie.
 *
 * Sedno pomysłu z raportu (4.1): **autor nie podaje odpowiedzi**. Wskazuje
 * wielkość z grafu wzorów, a klucz liczy ten sam kod, co symulację w wykładzie.
 * Dzięki temu zadanie nie może się rozjechać z treścią — poprawiony wzór wyżej
 * zmienia jednocześnie wykres i klucz odpowiedzi, bo to jeden byt.
 *
 * Drugi pomysł: **dane są losowane z zakresów**, nie wpisane na stałe. Ziarno
 * daje nieskończenie wiele wariantów tego samego zadania i to samo ziarno
 * zawsze daje ten sam wariant — bez tego nie dałoby się ani wrócić do zadania,
 * ani go sprawdzić.
 *
 * **Nie każde zadanie da się tak opisać** i próba dopisania osobnego bloku dla
 * każdego rodzaju kończy się setką bloków. Dlatego rodzaj zadania wynika tutaj
 * z tego, co autor napisał, a nie z nazwy bloku:
 *
 *  • `@answer` — wielkość z grafu; klucz liczy model, dane losuje ziarno;
 *  • `@expected` — odpowiedź przepisana z podręcznika; **blok nie liczy nic**,
 *    a sprawdzanie jest możliwe tylko wtedy, gdy odpowiedź zaczyna się liczbą;
 *  • brak obu — zadanie jakościowe („co można powiedzieć o wektorach a i b?").
 *    Takich w podręczniku jest pełno i one też mają wracać w powtórkach.
 *
 * Wspólne dla wszystkich trzech jest to, co naprawdę się liczy: identyfikator,
 * treść, podpowiedzi, poziom i miejsce w grafie wiedzy — a przez to wpięcie
 * w harmonogram powtórek.
 *
 * Zapis jest celowo bliski blokowi `formula`: pierwsza część to treść dla
 * czytelnika, dyrektywy `@` niosą resztę.
 */

export type AnswerKind = 'numeric' | 'symbolic' | 'interactive';

export interface GivenRange {
  name: string;
  /** Dolna i górna granica losowania, w jednostce `unit`. */
  min: number;
  max: number;
  unit?: string;
  /** Zaokrąglenie wylosowanej wartości — „ładne" liczby czyta się lepiej. */
  step?: number;
}

export interface ExerciseBlock {
  id: string;
  /** Treść zadania — markdown, pokazywana czytelnikowi. */
  prompt: string;
  /** Dane losowane dla każdego wariantu. */
  given: GivenRange[];
  /** Wielkość z grafu, która jest odpowiedzią. */
  answer?: string;
  /**
   * Odpowiedź przepisana z podręcznika — tekst, nie wielkość.
   *
   * Obecność tego pola znaczy, że blok **niczego nie liczy**: pokazuje treść,
   * czytelnik rozwiązuje na kartce, a odpowiedź służy do porównania.
   */
  expected?: string;
  /**
   * Wielkość wyłuskana z `expected` do automatycznego sprawdzenia.
   *
   * Odpowiedzi w podręczniku bywają zdaniami („6 m, o kąt 20,5° od kierunku
   * północnego"). Sprawdzamy z nich **pierwszą wartość** i mówimy o tym wprost
   * w interfejsie — udawanie, że rozumiemy całe zdanie, byłoby gorsze niż
   * przyznanie, że sprawdzamy jedną liczbę.
   */
  check?: string;
  kind: AnswerKind;
  /** Dopuszczalny błąd względny; domyślnie 2%. */
  tolerance: number;
  /** Poziom trudności — do katalogu zadań. */
  level?: number;
  /** Wzory, których zadanie dotyczy; wpina je w graf wiedzy. */
  uses: string[];
  /** Podpowiedzi napisane ręcznie; brak = generowane z grafu. */
  hints: string[];
  unknown: string[];
  issues: string[];
}

const DIRECTIVE = /^\s*@([A-Za-z][A-Za-z0-9]*)\s*(.*)$/;
/** `L: 0.5..2 m` albo `L: 1..10` albo `L: 0.5..2 m step 0.1`. */
const GIVEN = /^(?<name>\\?[A-Za-z][A-Za-z0-9]*(?:_\{?[A-Za-z0-9]+\}?)?)\s*:\s*(?<min>-?[\d.eE+-]+)\s*\.\.\s*(?<max>-?[\d.eE+-]+)\s*(?<unit>[^\s]+)?\s*(?:step\s+(?<step>[\d.eE+-]+))?\s*$/;

export const EXERCISE_FENCE = /^exercise:([A-Za-z0-9_-]+)$/;

/**
 * Liczba z jednostką na początku odpowiedzi.
 *
 * Przecinek dziesiętny jest tu obowiązkowo obsłużony, bo polski podręcznik
 * pisze „20,5°", a nie „20.5°" — bez tego sprawdzanie odpadałoby dokładnie tam,
 * gdzie miało pomóc.
 */
const LEADING_QUANTITY = /^-?\d+(?:[.,]\d+)?(?:\s*(?:[a-zA-Zµ°Ω]+(?:\/[a-zA-Z]+)?(?:\^?-?\d+)?))?/;

/** Nazwa symbolu bez ozdobników LaTeX-a — jak w `parseFormula`. */
function symbolName(name: string): string {
  return name.replace(/\\/g, '').replace(/[{}]/g, '');
}

export function parseExerciseBlock(id: string, body: string): ExerciseBlock {
  const block: ExerciseBlock = {
    id,
    prompt: '',
    given: [],
    kind: 'numeric',
    tolerance: 0.02,
    uses: [],
    hints: [],
    unknown: [],
    issues: [],
  };

  const promptLines: string[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    const directive = DIRECTIVE.exec(trimmed);

    if (!directive) {
      // Treść zadania zbieramy w całości, razem z pustymi liniami — to
      // markdown i akapity mają znaczenie.
      promptLines.push(line);
      continue;
    }

    const [, name, rest] = directive;
    switch (name) {
      case 'given': {
        const given = GIVEN.exec(rest.trim());
        if (!given?.groups) {
          block.issues.push(`Nie rozumiem zakresu „${rest}". Zapis: „@given L: 0.5..2 m".`);
          break;
        }
        const g = given.groups;
        block.given.push({
          name: symbolName(g.name),
          min: Number(g.min),
          max: Number(g.max),
          ...(g.unit ? { unit: g.unit } : {}),
          ...(g.step ? { step: Number(g.step) } : {}),
        });
        break;
      }
      case 'answer':
        block.answer = symbolName(rest.trim());
        break;
      case 'expected':
        block.expected = rest.trim();
        break;
      case 'check':
        block.check = rest.trim();
        break;
      case 'kind': {
        const kind = rest.trim();
        if (kind === 'numeric' || kind === 'symbolic' || kind === 'interactive') block.kind = kind;
        else block.issues.push(`Nieznany rodzaj odpowiedzi „${kind}".`);
        break;
      }
      case 'tolerance': {
        // Zapis w procentach jest naturalniejszy dla autora zadania.
        const text = rest.trim();
        const value = text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
        if (Number.isFinite(value) && value >= 0) block.tolerance = value;
        else block.issues.push(`Nie rozumiem tolerancji „${text}".`);
        break;
      }
      case 'level': {
        const level = Number(rest.trim());
        if (Number.isFinite(level)) block.level = level;
        break;
      }
      case 'uses':
        block.uses.push(...rest.split(',').map((s) => s.trim()).filter(Boolean));
        break;
      case 'hint':
        block.hints.push(rest.trim());
        break;
      default:
        block.unknown.push(trimmed);
    }
  }

  block.prompt = promptLines.join('\n').trim();

  if (!block.prompt) block.issues.push('Zadanie nie ma treści.');

  // Dane do losowania bez wskazanej wielkości to zawsze pomyłka: nie ma czego
  // policzyć, więc wylosowane liczby nie miałyby dokąd trafić.
  if (block.given.length && !block.answer) {
    block.issues.push('Są dane do wylosowania („@given"), ale nie wiadomo, co policzyć — dopisz „@answer".');
  }

  // Wiodąca wielkość z odpowiedzi — tylko gdy autor nie wskazał jej sam.
  if (block.expected && !block.check) {
    const wiodaca = LEADING_QUANTITY.exec(block.expected);
    if (wiodaca) block.check = wiodaca[0].trim();
  }
  for (const given of block.given) {
    if (!(given.max > given.min)) {
      block.issues.push(`Zakres „${given.name}" jest pusty albo odwrócony.`);
    }
  }

  return block;
}

export function serializeExerciseBlock(block: ExerciseBlock): string {
  const out: string[] = [block.prompt];

  for (const given of block.given) {
    const unit = given.unit ? ` ${given.unit}` : '';
    const step = given.step ? ` step ${given.step}` : '';
    out.push(`@given ${given.name}: ${given.min}..${given.max}${unit}${step}`);
  }
  if (block.answer) out.push(`@answer ${block.answer}`);
  if (block.expected) out.push(`@expected ${block.expected}`);
  if (block.check) out.push(`@check ${block.check}`);
  if (block.kind !== 'numeric') out.push(`@kind ${block.kind}`);
  if (block.tolerance !== 0.02) out.push(`@tolerance ${block.tolerance * 100}%`);
  if (block.level !== undefined) out.push(`@level ${block.level}`);
  for (const used of block.uses) out.push(`@uses ${used}`);
  for (const hint of block.hints) out.push(`@hint ${hint}`);
  out.push(...block.unknown);

  return out.join('\n');
}
