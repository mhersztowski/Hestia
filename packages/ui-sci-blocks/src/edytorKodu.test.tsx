/**
 * Edytor kodu w bloku `simscript` jako port wstrzykiwany przez hosta.
 *
 * Blok przyjmuje **TypeScript** i cała jego racja bytu to droga awansu: kod,
 * który kiedyś trafi do biblioteki zjawisk, ma od pierwszej chwili typy.
 * Edytowany był przy tym w gołym `<textarea>` — bez podświetlania, bez
 * podpowiedzi i bez sprawdzania sygnatur. TypeScript bez sprawdzania typów
 * w miejscu pisania to TypeScript tylko z nazwy.
 *
 * Monaco nie może być zależnością tego pakietu: waży kilka megabajtów, a bloki
 * działają też w eksporcie statycznym i w podglądzie. Wchodzi więc portem —
 * dokładnie tak jak rozpoznawanie pisma rysikiem i fabryka workera. Bez
 * wstrzyknięcia zostaje `<textarea>`: uczciwy tryb zapasowy, a nie awaria.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScriptBlock } from './ScriptBlock';
import { setCodeEditor } from './register';

const KOD = 'return defineModel({ parameters: [], observables: [], run: () => ({}) });';

afterEach(() => setCodeEditor(undefined));

describe('bez wstrzykniętego edytora', () => {
  it('zostaje zwykłe pole tekstowe', () => {
    render(<ScriptBlock code={KOD} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /kod/i }));

    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});

describe('z wstrzykniętym edytorem', () => {
  it('host dostaje kod, język i deklaracje API', () => {
    const zapamietane: Array<Record<string, unknown>> = [];
    setCodeEditor((props) => {
      zapamietane.push(props as unknown as Record<string, unknown>);
      return <div data-testid="edytor-hosta" />;
    });

    render(<ScriptBlock code={KOD} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /kod/i }));

    expect(screen.getByTestId('edytor-hosta')).toBeTruthy();
    expect(zapamietane[0].value).toBe(KOD);
    expect(zapamietane[0].language).toBe('typescript');
    // Bez deklaracji API edytor podpowiadałby `any` — czyli nic.
    expect(String(zapamietane[0].extraTypes)).toContain('defineModel');
  });

  it('zmiana w edytorze hosta trafia do bufora bloku', () => {
    setCodeEditor(({ value, onChange }) => (
      <button type="button" data-testid="zmien" onClick={() => onChange(`${value} // dopisane`)}>
        zmień
      </button>
    ));

    render(<ScriptBlock code={KOD} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /kod/i }));
    fireEvent.click(screen.getByTestId('zmien'));

    // Bufor jest widoczny dopiero po zatwierdzeniu — sprawdzamy, że przycisk
    // zapisu w ogóle się pojawił, czyli że zmiana doszła.
    expect(screen.getByRole('button', { name: /uruchom|zapisz/i })).toBeTruthy();
  });

  it('blok tylko do odczytu nie pokazuje edytora', () => {
    setCodeEditor(() => <div data-testid="edytor-hosta" />);
    render(<ScriptBlock code={KOD} />);
    expect(screen.queryByTestId('edytor-hosta')).toBeNull();
  });

  it('wyrejestrowanie portu wraca do pola tekstowego', () => {
    setCodeEditor(() => <div data-testid="edytor-hosta" />);
    setCodeEditor(undefined);

    render(<ScriptBlock code={KOD} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /kod/i }));

    expect(screen.queryByTestId('edytor-hosta')).toBeNull();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
