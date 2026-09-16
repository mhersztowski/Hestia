/**
 * Dymek odsyłacza w edytorze — treść i dotyk.
 *
 * Dwa błędy, oba widoczne dopiero na telefonie:
 *
 *  • dymek umiał pokazać **tylko wzór i hasło**, więc dla rysunku był pusty,
 *    a przycisk mówił „otwórz wzór" (etykieta domyślna);
 *  • dymek siedzi w **portalu**, a zamykanie „tapnięciem obok" sprawdzało tylko
 *    kotwicę — kliknięcie w przycisk było więc uznawane za kliknięcie obok
 *    i dymek znikał na `pointerdown`, zanim kliknięcie dotarło.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const nawigacja = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => nawigacja,
}));

const rozwiaz = vi.fn();

const { KnowledgeRefView } = await import('./KnowledgeRefExtension');
const { EditorServicesProvider } = await import('../capabilities');

const RYSUNEK = [
  '![Rys. 15-1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)',
  '@caption **Rys. 15-1.** Punkt materialny.',
].join('\n');

// The knowledge base arrives as a service now, not as a module the view
// imports — so the test supplies one instead of mocking a path.
const pokaz = (attrs: Record<string, string>) =>
  render(
    <EditorServicesProvider services={{ knowledgeRefs: { resolve: (id: string) => rozwiaz(id) } }}>
      <MemoryRouter>
        {/* Widok czyta z `node` tylko `attrs`, więc reszta kontraktu jest zbędna. */}
        <KnowledgeRefView {...({ node: { attrs } } as never)} />
      </MemoryRouter>
    </EditorServicesProvider>
  );

describe('dymek w edytorze na dotyku', () => {
  beforeEach(() => {
    nawigacja.mockReset();
    rozwiaz.mockReset();
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
  });

  it('pokazuje rysunek, a nie sam przycisk', async () => {
    rozwiaz.mockResolvedValue({ kind: 'figure', code: RYSUNEK, path: 'book/15-01.md' });
    pokaz({ refId: 'rh1-15-rys1', label: 'rys. 15-1' });

    fireEvent.click(screen.getByText('rys. 15-1'));
    await waitFor(() => expect(screen.getByRole('img')).toBeTruthy());
    expect(screen.getByRole('button', { name: /otwórz rysunek/i })).toBeTruthy();
  });

  it('kliknięcie w przycisk nie jest brane za kliknięcie obok', async () => {
    rozwiaz.mockResolvedValue({
      kind: 'section',
      path: 'book/10-01.md',
      documentTitle: 'Co to jest zderzenie',
    });
    pokaz({ refId: 'rh1-sec-10-1', label: 'paragrafu 10-1' });

    fireEvent.click(screen.getByText('paragrafu 10-1'));
    const przycisk = await screen.findByRole('button', { name: /przejdź do paragrafu/i });

    // Dokładnie ta sekwencja gasiła dymek, zanim klik dotarł.
    fireEvent.pointerDown(przycisk);
    fireEvent.click(przycisk);

    expect(nawigacja).toHaveBeenCalledWith('/knowledge/book/10-01.md#ref-rh1-sec-10-1');
  });

  it('paragraf pokazuje tytuł dokumentu', async () => {
    rozwiaz.mockResolvedValue({
      kind: 'section',
      path: 'book/10-01.md',
      documentTitle: 'Co to jest zderzenie',
    });
    pokaz({ refId: 'rh1-sec-10-1', label: 'paragrafu 10-1' });

    fireEvent.click(screen.getByText('paragrafu 10-1'));
    expect(await screen.findByText('Co to jest zderzenie')).toBeTruthy();
  });
});
