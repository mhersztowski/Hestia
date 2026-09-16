/**
 * LinAlgBlock — scena algebry liniowej sterowana blokiem dokumentu.
 *
 * Odpowiednik `SimBlock` dla przekształceń. Cała treść bloku to deklaracje
 * macierzy i wektorów oraz przypisania — z nich wynika, co widać, bez ani
 * jednej linijki kodu widoku.
 *
 * Suwak animacji jest tu **głównym sterowaniem**, nie odtwarzaczem: to
 * przeciąganie go tam i z powrotem pokazuje, że macierz jest ciągłym
 * odkształceniem płaszczyzny.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  alignment,
  compileLinAlg,
  compileLinAlg3,
  det,
  detM3,
  eigen,
  eigenM3,
  interpolate,
  interpolateM3,
  parseFormulaBlock,
  type Vector2,
  type Vector3,
} from '@hestia/core-sci';
import { LinAlgStage } from './LinAlgStage';
import { LinAlgStage3D } from './LinAlgStage3D';

export interface LinAlgBlockProps {
  bare?: boolean;
  id: string;
  /** Treść bloku `formula` z dyrektywą `@linalg`. */
  code: string;
  /** Nastawy z bloku `linalg` — co pokazać obok sceny. */
  setup?: {
    eigen?: boolean;
    extent?: number;
    unitSquare?: boolean;
    drag?: boolean;
    snap?: boolean;
    kernel?: boolean;
  };
}

const box: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderLeft: '4px solid #a855f7',
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

/** Kolory wektorów — stała paleta, żeby ten sam wektor miał ten sam kolor. */
const PALETA = ['#2563eb', '#ea580c', '#0891b2', '#65a30d', '#c026d3'];

/**
 * Paleta dla scen 3D.
 *
 * Osie mają w przestrzeni własne kolory (x czerwony, y zielony, z niebieski),
 * więc wektory dokumentu muszą zaczynać się od barw, które z nimi nie kolidują
 * — inaczej nie da się odróżnić osi z od pierwszego wektora.
 */
const PALETA_3D = ['#ea580c', '#c026d3', '#0d9488', '#ca8a04', '#7c3aed'];

export function LinAlgBlock({ id, code, setup, bare }: LinAlgBlockProps) {
  const blok = useMemo(() => parseFormulaBlock(id, code), [id, code]);

  // Wymiar wynika z zapisu macierzy w dokumencie, nie z osobnego przełącznika —
  // autor pisze go raz i nie ma jak rozjechać sceny z równaniem.
  if (blok.linalg?.dim3) {
    return <Scena3D id={id} blok={blok} setup={setup} bare={bare} />;
  }

  return <Scena2D id={id} code={code} setup={setup} bare={bare} />;
}

function Scena2D({ id, code, setup, bare }: LinAlgBlockProps) {
  const model = useMemo(() => compileLinAlg(parseFormulaBlock(id, code)), [id, code]);
  const [t, setT] = useState(1);
  const [gra, setGra] = useState(false);

  /** Wektory przesunięte przez czytelnika — nadpisują te z dokumentu. */
  const [przeciagniete, setPrzeciagniete] = useState<Record<string, Vector2>>({});

  const docelowa = useMemo(() => model.run({ vectors: przeciagniete }), [model, przeciagniete]);
  const macierz = model.transform ? docelowa.matrices[model.transform] : undefined;

  /**
   * Wynik dla bieżącej klatki animacji.
   *
   * Zamiast przekształcać narysowane strzałki, podmieniamy **macierz w
   * modelu** — dzięki temu wektory policzone ze złożeń i sum też podążają za
   * animacją, a nie tylko te będące wprost `A \cdot v`.
   */
  const wynik = useMemo(() => {
    if (!macierz || !model.transform) return docelowa;
    return model.run({
      matrices: { [model.transform]: interpolate(macierz, t) },
      vectors: przeciagniete,
    });
  }, [model, macierz, t, docelowa, przeciagniete]);

  useEffect(() => {
    if (!gra) return undefined;
    const timer = window.setInterval(() => {
      // Wahadłowo, nie w kółko: powrót do identyczności jest częścią lekcji —
      // widać, że przekształcenie da się odwrócić (albo że nie da).
      setT((poprzednie) => {
        const nastepne = poprzednie + 0.02 * kierunekRef.current;
        if (nastepne >= 1) {
          kierunekRef.current = -1;
          return 1;
        }
        if (nastepne <= 0) {
          kierunekRef.current = 1;
          return 0;
        }
        return nastepne;
      });
    }, 40);
    return () => window.clearInterval(timer);
  }, [gra]);

  const kierunekRef = useMemo(() => ({ current: 1 }), []);

  const wektory = model.drawnVectors.map((name, index) => ({
    name,
    value: wynik.vectors[name],
    color: PALETA[index % PALETA.length],
    // Wszystkie wektory rysujemy wprost: te zadeklarowane są wejściem i mają
    // stać w miejscu jako odniesienie, a policzone już niosą przekształcenie
    // bieżącej klatki, bo model dostał zinterpolowaną macierz.
    transformed: true,
  }));

  /**
   * Jak blisko kierunku własnego leży pierwszy chwytalny wektor.
   *
   * To jest miara postępu w ćwiczeniu „znajdź kierunek, w którym Av leży na v" —
   * bez niej czytelnik szuka po omacku, bo na oko trudno odróżnić 0,98 od 1.
   */
  const zgodnosc = useMemo(() => {
    const pierwszy = model.vectors[0];
    if (!macierz || !pierwszy || !setup?.drag) return undefined;
    return alignment(macierz, wynik.vectors[pierwszy.name] ?? pierwszy.value);
  }, [macierz, model.vectors, wynik, setup?.drag]);

  const wyznacznik = macierz ? det(macierz) : undefined;
  const wlasne = macierz ? eigen(macierz) : undefined;
  const issues = [...model.issues, ...wynik.issues];

  return (
    <div
      style={
        bare
          ? { display: 'flex', flexDirection: 'column', gap: 8 }
          : { ...box, display: 'flex', flexDirection: 'column', gap: 8 }
      }
    >
      {!bare && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#a855f7' }}>algebra</span>
          <code style={{ fontSize: 11, color: '#94a3b8' }}>{id}</code>
        </div>
      )}

      {issues.length > 0 && (
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

      <LinAlgStage
        matrix={macierz}
        t={t}
        vectors={wektory}
        extent={setup?.extent ?? 4}
        showEigen={setup?.eigen}
        showUnitSquare={setup?.unitSquare ?? true}
        // Chwytać wolno tylko wektory **zadeklarowane** — policzone są wynikiem
        // i przesuwanie ich byłoby przesuwaniem odpowiedzi, nie pytania.
        draggable={model.vectors.map((v) => v.name)}
        snapEigen={setup?.snap}
        onDrag={
          setup?.drag
            ? (name, value) => setPrzeciagniete((p) => ({ ...p, [name]: value }))
            : undefined
        }
      />

      {setup?.drag && (
        <div style={{ ...label, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Przeciągnij koniec strzałki.</span>
          {zgodnosc !== undefined && (
            <>
              <span>Zgodność z kierunkiem własnym:</span>
              {/* Pasek zamiast liczby: chodzi o wyczucie „ciepło–zimno" przy
                  szukaniu kierunku, a nie o odczytanie cosinusa. */}
              <span
                style={{
                  display: 'inline-block',
                  width: 80,
                  height: 6,
                  borderRadius: 3,
                  background: '#e2e8f0',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${Math.round(zgodnosc * 100)}%`,
                    background: zgodnosc > 0.999 ? '#16a34a' : '#a855f7',
                  }}
                />
              </span>
              <strong style={{ color: zgodnosc > 0.999 ? '#16a34a' : '#7c3aed' }}>
                {zgodnosc > 0.999
                  ? 'trafione — to kierunek własny'
                  : `${Math.round(zgodnosc * 100)}%`}
              </strong>
            </>
          )}
          {Object.keys(przeciagniete).length > 0 && (
            <button type="button" style={btn} onClick={() => setPrzeciagniete({})}>
              ⟲ przywróć z dokumentu
            </button>
          )}
        </div>
      )}

      {macierz && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={() => setGra((g) => !g)}>
            {gra ? '❚❚ pauza' : '▶ animuj'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={t}
            onChange={(e) => {
              setGra(false);
              setT(Number(e.target.value));
            }}
            style={{ flex: 1, minWidth: 120 }}
          />
          <span style={{ ...label, fontVariantNumeric: 'tabular-nums' }}>
            {t === 0
              ? 'identyczność'
              : t === 1
                ? 'pełne przekształcenie'
                : `${Math.round(t * 100)}%`}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
        {wyznacznik !== undefined && (
          <span>
            <span style={label}>det = </span>
            <strong
              style={{
                color: wyznacznik < 0 ? '#b91c1c' : '#0f172a',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Number(wyznacznik.toPrecision(4))}
            </strong>
            {/* Sens wyznacznika słowami: to jest to, co widać na kwadracie. */}
            <span style={label}>
              {Math.abs(wyznacznik) < 1e-9
                ? ' — płaszczyzna zapada się w prostą'
                : wyznacznik < 0
                  ? ' — orientacja odwrócona'
                  : ` — pole ×${Number(Math.abs(wyznacznik).toPrecision(3))}`}
            </span>
          </span>
        )}
        {wlasne && setup?.eigen && (
          <span>
            <span style={label}>wartości własne: </span>
            <strong style={{ color: '#7c3aed' }}>
              {wlasne.real
                ? wlasne.pairs.map((p) => Number(p.value.toPrecision(4))).join(', ')
                : 'brak rzeczywistych'}
            </strong>
            {!wlasne.real && <span style={label}> — każdy kierunek skręca</span>}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {wektory.map((w) => (
          <span key={w.name} style={{ fontSize: 12 }}>
            <span style={{ color: w.color, fontWeight: 600 }}>{w.name}</span>
            <span style={label}>
              {' '}
              = [{w.value.map((x) => Number(x.toPrecision(3))).join(', ')}]
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Scena trójwymiarowa.
 *
 * Osobny komponent, nie gałąź w środku: 3D ma inne sterowanie (orbitowanie
 * kamerą zamiast przeciągania wektorów) i inne wielkości do pokazania
 * (objętość zamiast pola, jądro jako płaszczyzna). Wspólny komponent byłby
 * ciągiem warunków, w których nie widać już żadnej z dwóch scen.
 */
function Scena3D({
  id,
  blok,
  setup,
  bare,
}: {
  id: string;
  blok: ReturnType<typeof parseFormulaBlock>;
  setup?: LinAlgBlockProps['setup'];
  bare?: boolean;
}) {
  const model = useMemo(() => compileLinAlg3(blok), [blok]);
  const [t, setT] = useState(1);
  const [gra, setGra] = useState(false);
  const kierunekRef = useMemo(() => ({ current: 1 }), []);

  const docelowa = useMemo(() => model.run({}), [model]);
  const macierz = model.transform ? docelowa.matrices[model.transform] : undefined;

  const wynik = useMemo(() => {
    if (!macierz || !model.transform) return docelowa;
    return model.run({ matrices: { [model.transform]: interpolateM3(macierz, t) } });
  }, [model, macierz, t, docelowa]);

  useEffect(() => {
    if (!gra) return undefined;
    const timer = window.setInterval(() => {
      setT((poprzednie) => {
        const nastepne = poprzednie + 0.02 * kierunekRef.current;
        if (nastepne >= 1) {
          kierunekRef.current = -1;
          return 1;
        }
        if (nastepne <= 0) {
          kierunekRef.current = 1;
          return 0;
        }
        return nastepne;
      });
    }, 40);
    return () => window.clearInterval(timer);
  }, [gra, kierunekRef]);

  const wektory = model.drawnVectors.map((name, index) => ({
    name,
    value: wynik.vectors[name] as Vector3,
    color: PALETA_3D[index % PALETA_3D.length],
  }));

  const wyznacznik = macierz ? detM3(macierz) : undefined;
  const wlasne = macierz ? eigenM3(macierz) : undefined;
  const issues = [...model.issues, ...wynik.issues];

  return (
    <div
      style={
        bare
          ? { display: 'flex', flexDirection: 'column', gap: 8 }
          : { ...box, display: 'flex', flexDirection: 'column', gap: 8 }
      }
    >
      {!bare && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#a855f7' }}>algebra 3D</span>
          <code style={{ fontSize: 11, color: '#94a3b8' }}>{id}</code>
        </div>
      )}

      {issues.length > 0 && (
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

      <LinAlgStage3D
        matrix={macierz}
        t={t}
        vectors={wektory}
        showEigen={setup?.eigen}
        showKernel={setup?.kernel}
      />
      <span style={label}>przeciągnij, aby obrócić scenę</span>

      {macierz && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={() => setGra((g) => !g)}>
            {gra ? '❚❚ pauza' : '▶ animuj'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={t}
            onChange={(e) => {
              setGra(false);
              setT(Number(e.target.value));
            }}
            style={{ flex: 1, minWidth: 120 }}
          />
          <span style={{ ...label, fontVariantNumeric: 'tabular-nums' }}>
            {t === 0
              ? 'identyczność'
              : t === 1
                ? 'pełne przekształcenie'
                : `${Math.round(t * 100)}%`}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
        {wyznacznik !== undefined && (
          <span>
            <span style={label}>det = </span>
            <strong
              style={{
                color: wyznacznik < 0 ? '#b91c1c' : '#0f172a',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Number(wyznacznik.toPrecision(4))}
            </strong>
            <span style={label}>
              {Math.abs(wyznacznik) < 1e-9
                ? ' — przestrzeń zapada się w płaszczyznę albo prostą'
                : wyznacznik < 0
                  ? ' — orientacja odwrócona'
                  : ` — objętość ×${Number(Math.abs(wyznacznik).toPrecision(3))}`}
            </span>
          </span>
        )}
        {wlasne && setup?.eigen && (
          <span>
            <span style={label}>wartości własne: </span>
            <strong style={{ color: '#7c3aed' }}>
              {wlasne.pairs.length
                ? wlasne.pairs.map((p) => Number(p.value.toPrecision(4))).join(', ')
                : 'brak rzeczywistych'}
            </strong>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {wektory.map((w) => (
          <span key={w.name} style={{ fontSize: 12 }}>
            <span style={{ color: w.color, fontWeight: 600 }}>{w.name}</span>
            <span style={label}>
              {' '}
              = [{w.value.map((x) => Number(x.toPrecision(3))).join(', ')}]
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
