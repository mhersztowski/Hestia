/**
 * ExerciseBlock — zadanie liczone tym samym grafem, co wykład, **albo przepisane
 * z podręcznika**.
 *
 * Jeden blok, trzy tryby, a tryb wynika z treści, nie z nazwy:
 *
 *  • `@answer` — dane losuje ziarno, klucz liczy model, podpowiedzi buduje graf;
 *  • `@expected` — blok **nie liczy nic**; czytelnik rozwiązuje na kartce,
 *    a odpowiedź z książki służy do porównania (o ile zaczyna się liczbą);
 *  • bez obu — zadanie jakościowe, oceniane samodzielnie.
 *
 * Osobny blok na każdy z tych przypadków byłby prostszy do napisania i gorszy
 * do życia: setka bloków znaczy setkę miejsc, w których trzeba pamiętać o
 * powtórkach, odsyłaczach i eksporcie statycznym.
 *
 * Dwie decyzje są tutejsze. **Podpowiedzi odsłaniają się pojedynczo** — gradacja
 * pomocy przestaje działać, gdy ostatni stopień widać od początku. I **samoocena
 * jest pełnoprawną próbą**: tam, gdzie nie ma czego sprawdzić automatycznie,
 * jedynym źródłem wiedzy o tym, czy zadanie wyszło, jest czytelnik. Bez tego
 * zadania jakościowe nigdy nie trafiłyby do harmonogramu powtórek.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  buildGraph,
  buildHints,
  checkNumeric,
  compileGraph,
  exerciseVariant,
  statedVariant,
  parseExerciseBlock,
  qualityOf,
  type CheckResult,
  type FormulaBlock,
  type Quality,
} from '@hestia/core-sci';
import { Markdown } from './Markdown';
import { InkCanvas, type InkRecognizer } from './InkCanvas';
import { SolutionDialog, SolutionHistory, type SolutionDraft } from './SolutionDialog';
import type { Solution } from '@hestia/core-sci';
import type { ReferenceKind } from '@hestia/core-sci';

export interface ExerciseBlockProps {
  /**
   * Bez własnej ramki i nagłówka — daje je `BlockShell` po stronie hosta.
   *
   * Poza edytorem (podgląd, eksport statyczny) komponent bywa używany wprost i
   * wtedy ramka jest potrzebna, stąd przełącznik zamiast twardego usunięcia.
   */
  bare?: boolean;
  /** Identyfikator z infostringu: ```exercise:okres-zadanie */
  id: string;
  code: string;
  /**
   * Rozpoznawanie pisma rysikiem — włącza przycisk „rozwiąż rysikiem".
   *
   * Port hosta, nie zależność pakietu. Brak = przycisku nie ma, a zadanie
   * rozwiązuje się z klawiatury jak dotąd.
   */
  recognizeInk?: InkRecognizer;
  /**
   * Zapis podejścia — treść, tryb i wynik; **datę stempluje host**.
   *
   * Brak = przycisku „rozwiąż" nie ma i zadanie działa jak dotąd: pole
   * odpowiedzi plus sprawdzenie.
   */
  onSolution?: (draft: SolutionDraft) => void;
  /** Historia podejść, od najnowszego; brak = przycisku historii nie ma. */
  solutions?: Solution[];
  /** Wzory z dokumentu — z nich powstaje klucz odpowiedzi. */
  formulas: FormulaBlock[];
  /** Ziarno wariantu; brak = wariant pierwszy. */
  seed?: number;
  /**
   * Zgłoszenie próby — host zapisuje ją w postępach nauki.
   *
   * Blok wie o dwóch rzeczach, których nie wie nikt inny: czy odpowiedź była
   * poprawna i ile podpowiedzi zużyto po drodze. Z nich powstaje ocena jakości,
   * a z niej odstęp do powtórki.
   */
  onAttempt?: (attempt: { id: string; quality: Quality; hintsUsed: number }) => void;
  /**
   * Rozwiązywanie odsyłaczy `((…))` w treści zadania.
   *
   * Zadania w podręczniku odsyłają do rysunków i haseł tak samo gęsto jak
   * wykład („patrz ((rh1-2-rys6|rys. 2-6b))"). Bez tego treść zadania byłaby
   * jedynym miejscem w bazie, gdzie odsyłacz zostaje surowym zapisem.
   */
  resolve?: (id: string) =>
    | {
        code?: string;
        kind?: ReferenceKind;
        documentTitle?: string;
        sameDocument: boolean;
      }
    | undefined;
  onNavigate?: (id: string) => void;
}

const box: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderLeft: '4px solid #7c3aed',
  borderRadius: 6,
  background: '#fff',
  padding: 10,
};
const label: CSSProperties = { fontSize: 11, color: '#64748b' };
const btn: CSSProperties = {
  fontSize: 12,
  padding: '3px 10px',
  borderRadius: 4,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
  color: '#334155',
};

const VERDICT_LOOK: Record<CheckResult['verdict'], { background: string; color: string }> = {
  correct: { background: '#dcfce7', color: '#166534' },
  wrong: { background: '#fef2f2', color: '#b91c1c' },
  'wrong-unit': { background: '#fef3c7', color: '#92400e' },
  unreadable: { background: '#f1f5f9', color: '#475569' },
};

export function ExerciseBlock({
  id,
  code,
  formulas,
  seed = 1,
  bare,
  onAttempt,
  resolve,
  onNavigate,
  recognizeInk,
  onSolution,
  solutions,
}: ExerciseBlockProps) {
  const [variantSeed, setVariantSeed] = useState(seed);
  const [answer, setAnswer] = useState('');
  /**
   * Rozwiązywanie rysikiem.
   *
   * Zadanie rachunkowe rozwiązuje się na kartce, nie w polu tekstowym — więc
   * pióro dostaje **całą przestrzeń na wyprowadzenie**, a rozpoznany zapis
   * trafia do pola odpowiedzi, gdzie liczy go ten sam `checkNumeric`, co przy
   * odpowiedzi wpisanej z klawiatury. Droga zostaje rysunkiem, wynik wchodzi
   * do sprawdzania — jedno nie zastępuje drugiego.
   */
  const [pioro, setPioro] = useState(false);
  /** Które okno jest otwarte — rozwiązywanie, historia, żadne. */
  const [okno, setOkno] = useState<'rozwiązanie' | 'historia' | null>(null);
  const [result, setResult] = useState<CheckResult | undefined>();
  const [hintsShown, setHintsShown] = useState(0);
  const [odslonieta, setOdslonieta] = useState(false);

  const block = useMemo(() => parseExerciseBlock(id, code), [id, code]);

  // `@uses` zawęża graf do wskazanych wzorów — tak samo jak `formulas` w bloku
  // `sim`. Rozdział podręcznika opisuje wiele zjawisk naraz, więc bez tego
  // zadanie liczyłoby z modelu, w którym ta sama wielkość ma kilka definicji.
  const uzyte = useMemo(
    () => (block.uses.length ? formulas.filter((f) => block.uses.includes(f.id)) : formulas),
    [formulas, block.uses]
  );
  const graph = useMemo(
    () =>
      buildGraph(
        uzyte,
        formulas.map((f) => f.id)
      ),
    [uzyte, formulas]
  );
  const model = useMemo(() => compileGraph(graph), [graph]);

  /** Czy klucz liczy model — zadanie z podręcznika nie liczy niczego. */
  const liczony = Boolean(block.answer);

  const variant = useMemo(
    () =>
      liczony
        ? exerciseVariant(block, model, variantSeed)
        : block.check
          ? statedVariant(block.check)
          : { seed: 0, values: {}, shown: {}, issues: [] },
    [liczony, block, model, variantSeed]
  );

  const hints = useMemo(() => {
    if (!block.answer) {
      // Bez wielkości w grafie nie ma z czego wyprowadzić podpowiedzi. Ręcznie
      // napisane działają dalej — i w zadaniach z podręcznika są jedyne.
      return block.hints.map((text, index) => ({ level: index + 1, text }));
    }
    const computed = model.run(variant.values, [0, 1], 0.01);
    return buildHints(graph, block.answer, computed, block.hints);
  }, [graph, model, block, variant]);

  const issues = [...block.issues, ...variant.issues];

  /** Odpowiedź da się sprawdzić maszynowo tylko wtedy, gdy jest wartość wzorcowa. */
  const doSprawdzenia = variant.expected !== undefined;
  /** Czy sprawdzamy tylko część odpowiedzi — wtedy trzeba to powiedzieć wprost. */
  const czesciowe = Boolean(
    block.expected && block.check && block.check.trim() !== block.expected.trim()
  );

  /**
   * Sprawdzenie odpowiedzi w jednym miejscu.
   *
   * Wcześniej ta sama linia stała przy przycisku i przy klawiszu Enter — po
   * dołożeniu zgłaszania próby rozjechałyby się przy pierwszej zmianie.
   */
  const sprawdz = () => {
    const wynik = checkNumeric(answer, variant, block.tolerance);
    setResult(wynik);
    // Nieczytelna odpowiedź (pusta, sama jednostka) nie jest próbą — to pomyłka
    // w pisaniu, a nie sygnał o tym, czy czytelnik umie zadanie.
    if (wynik.verdict !== 'unreadable') {
      onAttempt?.({
        id,
        quality: qualityOf(wynik.verdict === 'correct', hintsShown),
        hintsUsed: hintsShown,
      });
    }
  };

  /**
   * Samoocena — jedyne źródło prawdy tam, gdzie nie ma czego sprawdzić.
   *
   * Trzy stopnie, nie dwa: „z trudem" to nie to samo, co „umiem", i wraca
   * szybciej. Ten sam podział, którego używa harmonogram powtórek.
   */
  const oceń = (quality: Quality) => {
    setResult({
      verdict: quality === 'wrong' ? 'wrong' : 'correct',
      message:
        quality === 'wrong'
          ? 'Zapisane — zadanie wróci w powtórkach niedługo.'
          : quality === 'hinted'
            ? 'Zapisane — zadanie wróci, ale rzadziej.'
            : 'Zapisane — zadanie wróci za dłuższy czas.',
    });
    onAttempt?.({ id, quality, hintsUsed: hintsShown });
  };

  const nowyWariant = () => {
    // Ziarno rośnie o jeden — wariant jest inny, ale wciąż odtwarzalny.
    setVariantSeed((previous) => previous + 1);
    setAnswer('');
    setResult(undefined);
    setHintsShown(0);
  };

  return (
    <div
      style={
        bare
          ? { display: 'flex', flexDirection: 'column', gap: 8 }
          : { ...box, display: 'flex', flexDirection: 'column', gap: 8 }
      }
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        {!bare && (
          <>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed' }}>zadanie</span>
            <code style={{ fontSize: 11, color: '#94a3b8' }}>{id}</code>
          </>
        )}
        {block.level !== undefined && <span style={label}>poziom {block.level}</span>}
        <span style={{ flex: 1 }} />
        {liczony && <span style={label}>wariant #{variantSeed}</span>}
      </div>

      {!bare && issues.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: '#b91c1c',
            background: '#fef2f2',
            borderRadius: 4,
            padding: '6px 8px',
          }}
        >
          {issues.map((issue, index) => (
            <div key={index}>{issue}</div>
          ))}
        </div>
      )}

      {/* Treść jest markdownem z matematyką — tym samym rendererem, co czytnik.
          Zadanie z podręcznika bez `$\mathbf{a}$` nie istnieje. */}
      <div
        style={{ fontSize: 13, color: '#0f172a', display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        <Markdown source={block.prompt} resolve={resolve} onNavigate={onNavigate} />
      </div>

      {Object.keys(variant.shown).length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(variant.shown).map(([name, value]) => (
            <span key={name} style={{ fontSize: 12 }}>
              <span style={label}>{name} = </span>
              <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </strong>
            </span>
          ))}
        </div>
      )}

      {czesciowe && (
        <div style={{ ...label, fontStyle: 'italic' }}>
          Sprawdzam pierwszą wartość odpowiedzi: <strong>{block.check}</strong>. Resztę oceniasz
          sam.
        </div>
      )}

      {okno === 'rozwiązanie' && onSolution && (
        <SolutionDialog
          title={`Zadanie ${id}`}
          recognize={recognizeInk}
          initialAnswer={answer}
          onClose={() => setOkno(null)}
          onSave={(draft) => {
            onSolution(draft);
            // Wynik z okna wraca do pola w bloku: sprawdza go ten sam klucz,
            // co odpowiedź wpisaną wprost. Okno nie jest osobnym obiegiem oceny.
            if (draft.answer) {
              setAnswer(draft.answer);
              setResult(undefined);
            }
            setOkno(null);
          }}
        />
      )}

      {okno === 'historia' && (
        <SolutionHistory solutions={solutions ?? []} onClose={() => setOkno(null)} />
      )}

      {pioro && recognizeInk && (
        <InkCanvas
          mode="latex"
          height={220}
          recognize={recognizeInk}
          onRecognized={(rozpoznany) => {
            setAnswer(rozpoznany);
            setResult(undefined);
          }}
        />
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {doSprawdzenia && (
          <>
            <input
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setResult(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sprawdz();
              }}
              placeholder={
                variant.expectedUnit ? `odpowiedź, np. 1.5 ${variant.expectedUnit}` : 'odpowiedź'
              }
              style={{
                fontSize: 13,
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                minWidth: 200,
              }}
            />
            <button type="button" style={btn} onClick={sprawdz}>
              sprawdź
            </button>
            {recognizeInk && (
              <button
                type="button"
                style={{ ...btn, background: pioro ? '#eff6ff' : undefined }}
                onClick={() => setPioro((p) => !p)}
                title="Szybki zapis rysikiem wprost w bloku, bez zapisywania podejścia"
              >
                {pioro ? '× zamknij pióro' : '✎ rysikiem'}
              </button>
            )}
            {onSolution && (
              <button
                type="button"
                style={btn}
                onClick={() => setOkno('rozwiązanie')}
                title="Rozwiąż w oknie: tekst z LaTeX-em albo odręcznie; podejście zapisuje się z datą"
              >
                rozwiąż
              </button>
            )}
            {solutions && solutions.length > 0 && (
              <button type="button" style={btn} onClick={() => setOkno('historia')}>
                historia ({solutions.length})
              </button>
            )}
          </>
        )}

        {liczony && (
          <button type="button" style={btn} onClick={nowyWariant} title="Te same wzory, inne dane">
            ⟳ inne dane
          </button>
        )}

        {block.expected && !odslonieta && (
          <button type="button" style={btn} onClick={() => setOdslonieta(true)}>
            pokaż odpowiedź
          </button>
        )}

        {hints.length > 0 && hintsShown < hints.length && (
          <button type="button" style={btn} onClick={() => setHintsShown((n) => n + 1)}>
            💡 podpowiedź {hintsShown + 1}/{hints.length}
          </button>
        )}
      </div>

      {odslonieta && block.expected && (
        <div style={{ fontSize: 13, background: '#f8fafc', borderRadius: 4, padding: '6px 8px' }}>
          <span style={label}>odpowiedź z podręcznika: </span>
          <Markdown source={block.expected} resolve={resolve} onNavigate={onNavigate} />
        </div>
      )}

      {/* Samoocena tam, gdzie nie ma czego sprawdzić maszynowo. Bez niej zadania
          jakościowe nigdy nie trafiłyby do harmonogramu powtórek — a to jest
          jedyny powód, dla którego są w bazie. */}
      {!liczony && !doSprawdzenia && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={label}>jak poszło?</span>
          <button type="button" style={btn} onClick={() => oceń('perfect')}>
            umiem
          </button>
          <button type="button" style={btn} onClick={() => oceń('hinted')}>
            z trudem
          </button>
          <button type="button" style={btn} onClick={() => oceń('wrong')}>
            nie umiem
          </button>
        </div>
      )}

      {result && (
        <div
          style={{
            ...VERDICT_LOOK[result.verdict],
            fontSize: 12,
            borderRadius: 4,
            padding: '6px 8px',
          }}
        >
          {result.message}
          {result.relativeError !== undefined && result.verdict === 'wrong' && (
            <span style={{ opacity: 0.75 }}>
              {' '}
              (różnica: {(result.relativeError * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      )}

      {hintsShown > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {hints.slice(0, hintsShown).map((hint) => (
            <div
              key={hint.level}
              style={{
                fontSize: 12,
                color: '#475569',
                background: '#f8fafc',
                borderRadius: 4,
                padding: '5px 8px',
              }}
            >
              <strong style={{ color: '#7c3aed' }}>{hint.level}.</strong> {hint.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
