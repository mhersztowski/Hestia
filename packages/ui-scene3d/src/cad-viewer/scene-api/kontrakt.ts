/**
 * kontrakt.ts — jedna suita testów dla każdej sceny.
 *
 * Wspólne API jest warte tyle, ile jego najsłabsza implementacja. Osobne testy
 * dla każdego adaptera sprawdzałyby, czy każdy z nich robi *coś* — a nie, czy
 * robią **to samo**. Dlatego kontrakt jest napisany raz i uruchamiany na
 * wszystkich scenach; rozjazd między nimi wychodzi wtedy natychmiast, a nie przy
 * pierwszym skrypcie napisanym dla jednej sceny i puszczonym na drugiej.
 *
 * Plik leży w źródłach, nie w testach, bo jest częścią kontraktu: adapter dopisany
 * poza tym pakietem ma go czym sprawdzić.
 *
 * **Nie jest eksportowany z `index.ts`** — importuje `vitest`, a ten nie ma czego
 * szukać w bundlu produkcyjnym. Importuj go ścieżką.
 */
import { describe, it, expect } from 'vitest';
import type { IScene, NodeData } from './types';
import { isNode3D } from './types';

export interface KontraktOpcje {
  /** Świeża, pusta scena na każdy przypadek. */
  fabryka: () => IScene;
  /** Dane obiektu, który w tej scenie na pewno da się utworzyć. */
  przykladowyObiekt: () => NodeData;
  /** Zmiana, która ma być widoczna w `getData()`. */
  przykladowaZmiana: () => Partial<NodeData>;
  /** Czy scena ma warstwy — nie każda musi. */
  maWarstwy?: boolean;
  /** Czy obiekty tej sceny stoją w przestrzeni (`INode3D`). */
  maTransformacje?: boolean;
}

export function sprawdzKontraktSceny(nazwa: string, opcje: KontraktOpcje): void {
  const { fabryka, przykladowyObiekt, przykladowaZmiana } = opcje;

  describe(`kontrakt sceny — ${nazwa}`, () => {
    it('zna swój rodzaj', () => {
      expect(fabryka().kind).toBeTruthy();
    });

    it('korzeń istnieje i nie ma rodzica', () => {
      const scena = fabryka();
      expect(scena.getRoot().getParent()).toBeNull();
    });

    it('utworzony obiekt jest w drzewie i da się go znaleźć po identyfikatorze', () => {
      const scena = fabryka();
      const node = scena.nodeCreate(przykladowyObiekt());

      expect(node).not.toBeNull();
      expect(scena.getNodeById(node!.id)).not.toBeNull();
      expect(scena.getAllNodes().some((n) => n.id === node!.id)).toBe(true);
    });

    it('ścieżka prowadzi do tego samego węzła co identyfikator', () => {
      const scena = fabryka();
      const node = scena.nodeCreate(przykladowyObiekt())!;

      const sciezka = node.getPath();
      expect(sciezka.length).toBeGreaterThan(0);
      expect(scena.getNode(sciezka)?.id).toBe(node.id);
      expect(scena.getNodeIdByPath(sciezka)).toBe(node.id);
    });

    it('zmiana nazwy zmienia ścieżkę — bo ścieżka z niej wynika', () => {
      const scena = fabryka();
      const node = scena.nodeCreate(przykladowyObiekt())!;

      node.setName('nazwa-testowa');
      expect(node.getName()).toBe('nazwa-testowa');
      expect(node.getPath().endsWith('nazwa-testowa')).toBe(true);
      expect(scena.getNode(node.getPath())?.id).toBe(node.id);
    });

    it('dane wracają z rodzajem i przyjmują zmianę', () => {
      const scena = fabryka();
      const node = scena.nodeCreate(przykladowyObiekt())!;

      expect(node.getData().type).toBeTruthy();

      const zmiana = przykladowaZmiana();
      node.update(zmiana);
      const po = node.getData();
      for (const [pole, wartosc] of Object.entries(zmiana)) {
        expect(po[pole], pole).toEqual(wartosc);
      }
    });

    it('`getData` zwraca kopię — zapis do niej nie zmienia sceny', () => {
      const scena = fabryka();
      const node = scena.nodeCreate(przykladowyObiekt())!;

      const dane = node.getData();
      (dane as Record<string, unknown>).type = 'podmieniony';
      expect(node.getData().type).not.toBe('podmieniony');
    });

    it('usunięty węzeł znika ze sceny i wie o tym', () => {
      const scena = fabryka();
      const node = scena.nodeCreate(przykladowyObiekt())!;

      expect(scena.nodeDelete(node.id)).toBe(true);
      expect(scena.getNodeById(node.id)).toBeNull();
      // Skrypt trzyma uchwyt dłużej niż scena — bez tego pytania każde użycie
      // po usunięciu kończyłoby się wyjątkiem albo cichą zmianą duchа.
      expect(node.isAlive()).toBe(false);
    });

    it('usunięcie nieistniejącego węzła to „nie", a nie wyjątek', () => {
      expect(fabryka().nodeDelete('nie-ma-takiego')).toBe(false);
    });

    it('`find` widzi utworzone obiekty', () => {
      const scena = fabryka();
      scena.nodeCreate(przykladowyObiekt());
      scena.nodeCreate(przykladowyObiekt());

      expect(scena.find(() => true).length).toBeGreaterThanOrEqual(2);
      expect(scena.find(() => false)).toEqual([]);
    });

    it('zaznaczenie da się ustawić i odczytać', () => {
      const scena = fabryka();
      const node = scena.nodeCreate(przykladowyObiekt())!;

      scena.setSelection([node]);
      expect(scena.getSelection().map((n) => n.id)).toEqual([node.id]);

      scena.setSelection([]);
      expect(scena.getSelection()).toEqual([]);
    });

    it('powiadamia o utworzeniu i usunięciu', () => {
      const scena = fabryka();
      const zmiany: string[] = [];
      const stop = scena.subscribe((z) => zmiany.push(z.kind));

      const node = scena.nodeCreate(przykladowyObiekt())!;
      scena.nodeDelete(node.id);
      stop();
      scena.nodeCreate(przykladowyObiekt());

      expect(zmiany).toContain('created');
      expect(zmiany).toContain('deleted');
      // Po odsubskrybowaniu nic nie dochodzi — inaczej narzędzie zamknięte
      // przez użytkownika dalej reagowałoby na scenę.
      expect(zmiany).toHaveLength(2);
    });

    it('rodzeństwo nie ma dwóch takich samych nazw — ścieżka musi wskazywać jednoznacznie', () => {
      const scena = fabryka();
      const a = scena.nodeCreate(przykladowyObiekt())!;
      const b = scena.nodeCreate(przykladowyObiekt())!;

      b.setName(a.getName());
      expect(b.getName()).not.toBe(a.getName());
    });

    if (opcje.maWarstwy) {
      it('ma co najmniej jedną warstwę, a obiekty leżą w drzewie pod nią', () => {
        const scena = fabryka();
        const warstwy = scena.getLayers();
        expect(warstwy.length).toBeGreaterThan(0);

        const node = scena.nodeCreate(przykladowyObiekt())!;
        expect(node.getParent()).not.toBeNull();
      });

      it('ukrycie warstwy jest widoczne w jej stanie', () => {
        const warstwa = fabryka().getLayers()[0];
        warstwa.setVisible(false);
        expect(warstwa.getVisible()).toBe(false);
      });
    }

    if (opcje.maTransformacje) {
      it('obiekt stoi w przestrzeni i daje się przesunąć', () => {
        const scena = fabryka();
        const node = scena.nodeCreate(przykladowyObiekt())!;

        expect(isNode3D(node)).toBe(true);
        if (!isNode3D(node)) return;

        node.setTransform({ position: [1, 2, 3] });
        expect(node.getTransform().position).toEqual([1, 2, 3]);

        // Zmiana jednego pola nie kasuje pozostałych — inaczej przesunięcie
        // gubiłoby obrót i skalę.
        const skala = node.getTransform().scale;
        node.setTransform({ position: [4, 5, 6] });
        expect(node.getTransform().scale).toEqual(skala);
      });

      it('widoczność i znacznik przechodzą przez API', () => {
        const scena = fabryka();
        const node = scena.nodeCreate(przykladowyObiekt())!;
        if (!isNode3D(node)) return;

        node.setVisible(false);
        expect(node.getVisible()).toBe(false);

        node.setTag('ruchome');
        expect(node.getTag()).toBe('ruchome');
      });
    }
  });
}
