/**
 * index.ts — wybór silnika.
 *
 * Cztery tryby na jednym modelu. Ta funkcja jest cała wartość pakietu widziana
 * z zewnątrz: dokument zostaje ten sam, zmienia się jedno pole i pozycje liczą
 * się inaczej. Dopóki nie da się ich porównać na tych samych danych, nie da się
 * też stwierdzić, który tryb pasuje do jakiego zastosowania.
 */
import type { LayoutDoc, LayoutResult } from '../model/types';
import { solveStatic } from './static';
import { solveAnchor } from './anchor';
import { solveFlow } from './flow';
import { solveConstraint } from './constraint';

export function solveLayout(doc: LayoutDoc): LayoutResult {
  switch (doc.mode) {
    case 'anchor': return solveAnchor(doc);
    case 'flow': return solveFlow(doc);
    case 'constraint': return solveConstraint(doc);
    default: return solveStatic(doc);
  }
}

export { solveStatic, solveAnchor, solveFlow, solveConstraint };
