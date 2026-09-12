/**
 * Ściąga dyrektyw w ramce bloku.
 *
 * Bloki bazy wiedzy miały dobre komunikaty błędów i żadnej dokumentacji
 * składni w miejscu pisania: autor musiał pamiętać trzydzieści dyrektyw albo
 * sięgnąć do kodu parsera. Ściąga jest przy polu tekstowym, bo czyta się ją
 * dokładnie wtedy, gdy się pisze.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FORMULA_DIRECTIVES } from '@hestia/core-sci';
import { BlockShell } from './BlockShell';

function pokaz(directives = FORMULA_DIRECTIVES) {
  return render(
    <BlockShell kind="wzór" accent="#2563eb" id="test" directives={directives} view={<div>widok</div>}>
      {() => <pre>treść</pre>}
    </BlockShell>,
  );
}

describe('dostępność ściągi', () => {
  it('nie zaśmieca widoku — pokazuje się dopiero w trybie Kod', () => {
    pokaz();
    expect(screen.queryByTitle('Lista dyrektyw, które ten blok rozumie')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Kod' }));
    expect(screen.getByTitle('Lista dyrektyw, które ten blok rozumie')).toBeTruthy();
  });

  it('blok bez katalogu nie ma przycisku', () => {
    // Symulacja czy pole nie mają własnych dyrektyw — przycisk byłby obietnicą
    // bez pokrycia.
    render(
      <BlockShell kind="symulacja" accent="#059669" view={<div>widok</div>}>
        {() => <pre>{'{}'}</pre>}
      </BlockShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kod' }));
    expect(screen.queryByTitle('Lista dyrektyw, które ten blok rozumie')).toBeNull();
  });

  it('blok tylko do odczytu nie pokazuje ani Kodu, ani ściągi', () => {
    render(<BlockShell kind="wzór" accent="#2563eb" directives={FORMULA_DIRECTIVES} view={<div>widok</div>} />);
    expect(screen.queryByRole('button', { name: 'Kod' })).toBeNull();
  });
});

describe('treść ściągi', () => {
  function otworz() {
    pokaz();
    fireEvent.click(screen.getByRole('button', { name: 'Kod' }));
    fireEvent.click(screen.getByTitle('Lista dyrektyw, które ten blok rozumie'));
  }

  it('wymienia dyrektywy z opisem i przykładem', () => {
    otworz();
    expect(screen.getByText('@vars')).toBeTruthy();
    expect(screen.getByText(/Jednostki symboli/)).toBeTruthy();
    expect(screen.getByText('@vars T: s, L: m, g: m/s^2')).toBeTruthy();
  });

  it('filtr zawęża listę', () => {
    otworz();
    fireEvent.change(screen.getByPlaceholderText('filtruj dyrektywy…'), { target: { value: 'init' } });

    expect(screen.getByText('@init')).toBeTruthy();
    expect(screen.getByText('@init2')).toBeTruthy();
    expect(screen.queryByText('@vars')).toBeNull();
  });

  it('brak dopasowania mówi wprost, że takiej dyrektywy nie ma', () => {
    otworz();
    fireEvent.change(screen.getByPlaceholderText('filtruj dyrektywy…'), { target: { value: 'xyz' } });
    expect(screen.getByText('Nie ma takiej dyrektywy.')).toBeTruthy();
  });

  it('znak `@` w filtrze nie przeszkadza', () => {
    otworz();
    fireEvent.change(screen.getByPlaceholderText('filtruj dyrektywy…'), { target: { value: '@ode' } });
    // Dwa trafienia, bo `@ode` jest i nazwą, i całym przykładem — liczy się to,
    // że filtr w ogóle coś znalazł i nie pokazał reszty katalogu.
    expect(screen.getAllByText('@ode').length).toBeGreaterThan(0);
    expect(screen.queryByText('@vars')).toBeNull();
  });
});
