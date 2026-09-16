/**
 * FormulaBlockView — wzór w dokumencie.
 *
 * Blok pokazuje matematykę i to, co z niej wynika: jakie wielkości są wejściem,
 * co jest wynikiem, jakie założenia przyjęto. Uwagi walidacji (wymiary,
 * wchłonięte symbole) stoją przy wzorze, a nie w konsoli — autor ma je zobaczyć
 * w chwili pisania.
 *
 * Matematykę składa KaTeX. Układ ODE dostaje pochodne w notacji Leibniza
 * (`dθ/dt`), bo tak zapisuje się je w podręcznikach — model trzyma same nazwy
 * zmiennych i wyrażenia, więc zapis trzeba złożyć tutaj.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  editableExpressions,
  parseFormulaBlock,
  replaceExpression,
  type FormulaBlock,
} from '@hestia/core-sci';
import { MathField } from './MathField';
import type { InkRecognizer } from './InkCanvas';
import { Math, symbolToLatex } from './Math';

export interface FormulaBlockViewProps {
  /**
   * Bez własnej ramki i nagłówka — daje je `BlockShell` po stronie hosta.
   *
   * Poza edytorem (podgląd, eksport statyczny) komponent bywa używany wprost i
   * wtedy ramka jest potrzebna, stąd przełącznik zamiast twardego usunięcia.
   */
  bare?: boolean;
  /** Identyfikator z infostringu: ```formula:pendulum-period */
  id: string;
  code: string;
  /**
   * Zapis zmienionego wzoru — włącza **wizualną edycję matematyki**.
   *
   * Brak znaczy tryb czytania: wzory są składane, ale nieklikalne. Edytor jest
   * warstwą nad tekstem, który i tak leży w pliku, więc tryb źródłowy z ręcznym
   * LaTeX-em działa dalej niezależnie od tego.
   */
  onChange?: (code: string) => void;
  /**
   * Rozpoznawanie pisma rysikiem — przekazywane wprost do edytora wzoru.
   *
   * Port hosta; brak = zakładki „pióro" nie ma. Ma sens tylko razem
   * z `onChange`, bo bez zapisu nie ma czego rozpoznawać do czego.
   */
  recognizeInk?: InkRecognizer;
}

/** Nazwa rodzaju bloku pokazywana czytelnikowi. */
const RODZAJ: Record<string, string> = {
  definition: 'wzór',
  ode: 'układ ODE',
  pde: 'równanie pola',
  linalg: 'przekształcenie',
};

const chip: CSSProperties = {
  fontSize: 10,
  padding: '1px 6px',
  borderRadius: 10,
  background: '#f1f5f9',
  color: '#475569',
};

/**
 * Równanie pola w postaci, w jakiej stoi w podręczniku.
 *
 * Blok zapisuje pochodną po czasie dyrektywą (`@d`/`@d2`), więc lewą stronę
 * musimy złożyć sami — inaczej czytelnik zobaczyłby samą prawą stronę bez
 * informacji, czego właściwie dotyczy.
 */
function PoleView({ block }: { block: FormulaBlock }) {
  const spec = block.pde ?? {};
  const pole = symbolToLatex(spec.field ?? 'u');
  const lewa = spec.second
    ? `\\frac{\\partial^2 ${pole}}{\\partial t^2}`
    : `\\frac{\\partial ${pole}}{\\partial t}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Math latex={`${lewa} = ${spec.second ?? spec.first ?? ''}`} />
      {spec.init && (
        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>warunek początkowy:</span>
          <Math latex={`${pole}(t=0) = ${spec.init}`} block={false} />
        </div>
      )}
    </div>
  );
}

/**
 * Deklaracje algebry w zapisie macierzowym.
 *
 * Blok zapisuje macierz w postaci wygodnej do pisania (`[[1, 0], [0, 1]]`), a
 * czytelnik ma zobaczyć ją tak, jak stoi w podręczniku — nawiasy, wiersze,
 * kolumny. Bez tego zamiana zapisu na obraz musiałaby się dziać w głowie.
 */
function AlgebraView({ block }: { block: FormulaBlock }) {
  const spec = block.linalg;
  if (!spec) return null;

  const liczby = (text: string) => text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

  /**
   * Macierz kwadratowa w zapisie podręcznikowym; nieznany kształt zostaje tekstem.
   *
   * Bok wybieramy z tabeli, a nie pierwiastkiem: `Math` jest tu nazwą
   * zaimportowanego komponentu składu wzorów, więc globalny obiekt jest
   * przesłonięty — a dwa obsługiwane wymiary i tak wyliczają się z listy.
   */
  const macierzLatex = (w: number[], zapasowy: string) => {
    const bok = { 4: 2, 9: 3 }[w.length];
    if (!bok) return zapasowy;
    const wiersze = Array.from({ length: bok }, (_, i) =>
      w.slice(i * bok, (i + 1) * bok).join(' & ')
    ).join(' \\\\ ');
    return `\\begin{pmatrix} ${wiersze} \\end{pmatrix}`;
  };

  /** Wektor kolumnowy — tak, jak stoi w podręczniku, niezależnie od wymiaru. */
  const wektorLatex = (w: number[], zapasowy: string) =>
    w.length >= 2 ? `\\begin{pmatrix} ${w.join(' \\\\ ')} \\end{pmatrix}` : zapasowy;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {spec.matrices.map(({ name, text }) => (
        <Math key={name} latex={`${symbolToLatex(name)} = ${macierzLatex(liczby(text), text)}`} />
      ))}
      {spec.vectors.map(({ name, text }) => (
        <Math key={name} latex={`${symbolToLatex(name)} = ${wektorLatex(liczby(text), text)}`} />
      ))}
      {spec.definitions.map(({ name, expression }) => (
        <Math key={name} latex={`${symbolToLatex(name)} = ${expression}`} />
      ))}
    </div>
  );
}

/**
 * Odgradza wnętrze od edytora tekstu, w którym blok jest osadzony.
 *
 * `stopPropagation` w obsłudze Reacta **nie wystarcza**: React nasłuchuje
 * zdarzeń na swoim korzeniu, a edytor tekstu zakłada własne, natywne nasłuchy
 * niżej w drzewie. Te odpalają się pierwsze, przechwytują wciśnięcie i wygaszają
 * je, żeby zaznaczyć węzeł — kliknięcie nigdy nie powstaje.
 *
 * Dlatego zdarzenia zatrzymujemy natywnie, w fazie przechwytywania, zanim
 * dojdą do edytora.
 */
function useOdgrodzenie<T extends HTMLElement>(aktywne: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !aktywne) return undefined;

    const zatrzymaj = (event: Event) => event.stopPropagation();
    const zdarzenia = ['mousedown', 'pointerdown', 'touchstart'] as const;
    for (const nazwa of zdarzenia) element.addEventListener(nazwa, zatrzymaj);

    return () => {
      for (const nazwa of zdarzenia) element.removeEventListener(nazwa, zatrzymaj);
    };
  }, [aktywne]);

  return ref;
}

export function FormulaBlockView({
  id,
  code,
  bare,
  onChange,
  recognizeInk,
}: FormulaBlockViewProps) {
  const block = parseFormulaBlock(id, code);
  /** Numer edytowanego wiersza; `undefined` znaczy tryb czytania. */
  const [edytowany, setEdytowany] = useState<number | undefined>();
  const odgrodzenie = useOdgrodzenie<HTMLDivElement>(!!onChange);

  // Odwzorowanie „wzór na ekranie → wiersz w pliku". Bez niego zapis musiałby
  // zgadywać, który z kilku wzorów bloku właśnie zmieniono.
  const wzory = onChange ? editableExpressions(code) : [];
  const wierszDla = (index: number) => wzory[index]?.line;

  /** Otacza wzór warstwą klikalną, gdy edycja jest włączona. */
  const klikalny = (index: number, dzieci: React.ReactNode) => {
    const line = wierszDla(index);
    if (!onChange || line === undefined) return dzieci;

    if (edytowany === line) {
      return (
        <MathField
          key={`edit-${line}`}
          latex={wzory[index].latex}
          onCommit={(latex) => {
            setEdytowany(undefined);
            if (latex.trim() && latex !== wzory[index].latex) {
              onChange(replaceExpression(code, line, latex));
            }
          }}
          onCancel={() => setEdytowany(undefined)}
          recognizeInk={recognizeInk}
        />
      );
    }

    return (
      <div
        key={`wzor-${line}`}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setEdytowany(line);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setEdytowany(line);
        }}
        title="Kliknij, aby edytować wzór"
        style={{ cursor: 'text', borderRadius: 4, padding: '2px 4px' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#faf5ff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        {dzieci}
      </div>
    );
  };

  return (
    <div
      ref={odgrodzenie}
      style={
        bare
          ? { display: 'flex', flexDirection: 'column', gap: 6 }
          : {
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              background: '#fff',
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }
      }
    >
      {/* Poza ramką hosta blok sam się przedstawia; w ramce robi to `BlockShell`,
          poza rodzajem — „układ ODE" vs „wzór" widać dopiero po treści. */}
      {(!bare || block.kind !== 'definition') && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ ...chip, background: '#dbeafe', color: '#1e40af' }}>
            {RODZAJ[block.kind]}
          </span>
          {!bare && <code style={{ fontSize: 11, color: '#94a3b8' }}>{id}</code>}
          {block.kind === 'pde' && block.pde && (
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {block.pde.nx}×{block.pde.ny}
              {block.pde.boundary && (
                <> · brzeg {block.pde.boundary.kind === 'neumann' ? 'izolowany' : 'ustalony'}</>
              )}
            </span>
          )}
        </div>
      )}

      {block.kind === 'relation' ? (
        // Równanie bez przypisania — pokazujemy je dokładnie tak, jak stoi
        // w książce; nie ma tu czego rozbijać na wielkość i wyrażenie.
        <Math latex={block.latex ?? ''} block />
      ) : block.kind === 'linalg' ? (
        <AlgebraView block={block} />
      ) : block.kind === 'pde' ? (
        <PoleView block={block} />
      ) : block.kind === 'ode' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(block.state ?? []).map((name, index) =>
            klikalny(
              index,
              <Math
                key={name}
                latex={`\\frac{d${symbolToLatex(name)}}{dt} = ${block.derivatives?.[name] ?? ''}`}
              />
            )
          )}
          {block.init && (
            <div
              style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap' }}
            >
              <span>warunki początkowe:</span>
              {Object.entries(block.init).map(([k, v]) => (
                <Math key={k} latex={`${symbolToLatex(k)} = ${v}`} block={false} />
              ))}
            </div>
          )}
        </div>
      ) : (
        klikalny(
          0,
          // Łańcuch równości pokazujemy w całości: `T = 2π/ω = 2π√(m/k)` niesie
          // drogę, a nie tylko wynik, i to jest treść, nie ozdoba.
          <Math
            latex={`${block.targetLatex ?? symbolToLatex(block.target ?? '')} = ${
              block.chain?.join(' = ') ?? block.expression ?? ''
            }`}
          />
        )
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(block.vars).map(([name, unit]) => (
          <span key={name} style={chip}>
            {name} [{unit}]
          </span>
        ))}
        {block.assume.map((assumption) => (
          <span key={assumption} style={{ ...chip, background: '#fef3c7', color: '#92400e' }}>
            założenie: {assumption}
          </span>
        ))}
        {block.derivedFrom.map((source) => (
          <span key={source} style={{ ...chip, background: '#dcfce7', color: '#166534' }}>
            z: {source}
          </span>
        ))}
      </div>

      {block.issues.length > 0 && (
        <div style={{ fontSize: 11, color: '#b91c1c' }}>
          {block.issues.map((issue, index) => (
            <div key={index}>{issue.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}
