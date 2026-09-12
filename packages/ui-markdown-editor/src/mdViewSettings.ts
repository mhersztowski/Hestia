// Reaktywny store ustawień WIDOKU aktywnego dokumentu markdown (per-plik, ustawiane
// z Drive). NodeView-y osadzonych bloczków (np. CadView) czytają go przez hook, by
// respektować „widok minimalny" (brak nagłówków/ramek). Prosty singleton wystarcza —
// w panelu Drive aktywny jest jeden dokument naraz.
import { useEffect, useState } from 'react';

export interface MdViewSettings {
  /** Widok minimalny: brak marginesów edytora i brak nagłówków/ramek osadzonych bloczków. */
  minimalView: boolean;
  /** Pełna szerokość: treść bez centralnego limitu 900px (brak pustych obszarów po bokach). */
  fullWidth: boolean;
}

const DEFAULT: MdViewSettings = { minimalView: false, fullWidth: false };

let current: MdViewSettings = DEFAULT;
const subs = new Set<() => void>();

export function setMdViewSettings(s: MdViewSettings): void {
  current = s;
  subs.forEach((f) => f());
}

export function getMdViewSettings(): MdViewSettings {
  return current;
}

/** Hook: bieżące ustawienia widoku + re-render przy zmianie. */
export function useMdViewSettings(): MdViewSettings {
  const [s, setS] = useState<MdViewSettings>(current);
  useEffect(() => {
    const f = () => setS(current);
    subs.add(f);
    f(); // sync na wypadek zmiany między renderem a subskrypcją
    return () => { subs.delete(f); };
  }, []);
  return s;
}
