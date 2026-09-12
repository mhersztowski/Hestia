/**
 * UiNodes.ts — interfejs użytkownika jako część sceny.
 *
 * Warstwa interfejsu mogłaby żyć obok sceny, we własnym dokumencie. Byłoby to
 * czystsze pojęciowo — interfejs nie jest bryłą — ale kosztowałoby **drugie
 * drzewo**: własną hierarchię, własny inspektor, własny zapis i własne
 * zaznaczenie, których nie dałoby się pomylić z tymi ze sceny tylko dlatego, że
 * wyglądają tak samo. Dlatego widżety są węzłami sceny.
 *
 * Zysk jest natychmiastowy: hierarchia sceny **jest** hierarchią layoutu, więc
 * `parent.w` w wyrażeniu znaczy dokładnie to, co widać w drzewie; zapis sceny
 * zapisuje interfejs; zaznaczenie w drzewie jest zaznaczeniem w widoku.
 *
 * Węzły niosą **opis** układu, nie jego wynik. Pozycje liczy the layout solver
 * przy każdym rysowaniu; gdyby wynik został zapisany w węźle, zmiana rozmiaru
 * okna czyniłaby zapis nieaktualnym, a plik przestałby opisywać intencję.
 */
import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';

/** Który silnik układa dzieci tej warstwy. Nazwy są te same, co w pakiecie layoutu. */
export type UiLayoutMode = 'static' | 'anchor' | 'flow' | 'constraint';

const TRYBY: UiLayoutMode[] = ['static', 'anchor', 'flow', 'constraint'];

export type UiWidgetKind = 'panel' | 'button' | 'label' | 'bar';

const RODZAJE: UiWidgetKind[] = ['panel', 'button', 'label', 'bar'];

/** Kotwica w stylu Godota — ułamek wymiaru rodzica plus odstęp w pikselach. */
export interface UiAnchor {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  offsetLeft: number;
  offsetTop: number;
  offsetRight: number;
  offsetBottom: number;
}

export interface UiFlowItem {
  grow?: number;
  basis?: number;
}

export interface UiFlowContainer {
  direction: 'row' | 'column';
  gap?: number;
  padding?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
}

/** Więz między widżetami — kształt zgodny z pakietem layoutu. */
export interface UiConstraint {
  id: string;
  type: string;
  refs: string[];
  /** Wartość dla więzów wymiarowych: liczba albo wyrażenie. */
  value?: string;
}

export interface UiRootNodeData extends SceneNodeData {
  type: 'ui-root';
  mode: UiLayoutMode;
  vars: Record<string, number>;
  constraints: UiConstraint[];
}

export interface UiWidgetNodeData extends SceneNodeData {
  type: 'ui-widget';
  kind: UiWidgetKind;
  /**
   * Położenie i rozmiar jako **tekst**.
   *
   * Nie liczba: w tych polach wolno napisać `parent.w / 2 - 40` albo
   * `naglowek.y + naglowek.h + 8`. Trzymanie liczby wymagałoby drugiego pola na
   * wyrażenie i pilnowania, które z nich jest prawdziwe.
   */
  x: string;
  y: string;
  w: string;
  h: string;
  anchor?: UiAnchor;
  flow?: UiFlowItem;
  container?: UiFlowContainer;
  text?: string;
  color?: string;
  /** Wypełnienie paska, 0–1. */
  value?: number;
}

const PUSTA_KOTWICA: UiAnchor = {
  minX: 0, maxX: 0, minY: 0, maxY: 0,
  offsetLeft: 0, offsetTop: 0, offsetRight: 0, offsetBottom: 0,
};

export class UiRootNode extends SceneNode {
  mode: UiLayoutMode;
  vars: Record<string, number>;
  constraints: UiConstraint[];

  constructor(data?: Partial<UiRootNodeData>) {
    super({ name: 'UI Layer', ...data, type: 'ui-root' });
    // Kotwice, a nie układ statyczny: warstwa interfejsu prawie zawsze ma
    // reagować na rozmiar widoku, a statyczna nie reaguje na nic.
    this.mode = data?.mode ?? 'anchor';
    this.vars = { ...(data?.vars ?? {}) };
    this.constraints = (data?.constraints ?? []).map((c) => ({ ...c }));
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'ui.mode':
        // Nieznany tryb zostaje odrzucony zamiast zapisany: solver i tak by go
        // nie zrozumiał, a w pliku zostałby ślad wyglądający na celowy.
        if (!TRYBY.includes(value as UiLayoutMode)) return true;
        this.mode = value as UiLayoutMode;
        this.notifyChange();
        return true;
      case 'ui.vars':
        this.vars = { ...(value as Record<string, number>) };
        this.notifyChange();
        return true;
      case 'ui.constraints':
        this.constraints = (value as UiConstraint[]).map((c) => ({ ...c }));
        this.notifyChange();
        return true;
      default:
        return super.setProperty(property, value);
    }
  }

  override toData(): UiRootNodeData {
    return {
      ...super.toData(),
      type: 'ui-root',
      mode: this.mode,
      vars: { ...this.vars },
      constraints: this.constraints.map((c) => ({ ...c })),
    };
  }
}

export class UiWidgetNode extends SceneNode {
  kind: UiWidgetKind;
  x: string;
  y: string;
  w: string;
  h: string;
  anchor?: UiAnchor;
  flow?: UiFlowItem;
  container?: UiFlowContainer;
  text?: string;
  color?: string;
  value?: number;

  constructor(data?: Partial<UiWidgetNodeData>) {
    const kind = data?.kind && RODZAJE.includes(data.kind) ? data.kind : 'panel';
    super({ name: kind.charAt(0).toUpperCase() + kind.slice(1), ...data, type: 'ui-widget' });
    this.kind = kind;
    this.x = data?.x ?? '0';
    this.y = data?.y ?? '0';
    this.w = data?.w ?? (kind === 'bar' ? '180' : '140');
    this.h = data?.h ?? (kind === 'bar' ? '14' : kind === 'label' ? '24' : '40');
    if (data?.anchor) this.anchor = { ...data.anchor };
    if (data?.flow) this.flow = { ...data.flow };
    if (data?.container) this.container = { ...data.container };
    this.text = data?.text;
    this.color = data?.color;
    this.value = data?.value;
  }

  override setProperty(property: string, value: unknown): boolean {
    if (property.startsWith('ui.anchor.')) {
      // Komplet pól albo nic: kotwica z połową wypełnionych liczb nie opisuje
      // żadnego położenia, a solver i tak musiałby resztę zgadnąć.
      const pole = property.slice('ui.anchor.'.length) as keyof UiAnchor;
      this.anchor = { ...(this.anchor ?? PUSTA_KOTWICA), [pole]: value as number };
      this.notifyChange();
      return true;
    }
    if (property.startsWith('ui.flow.')) {
      const pole = property.slice('ui.flow.'.length) as keyof UiFlowItem;
      this.flow = { ...(this.flow ?? {}), [pole]: value as number };
      this.notifyChange();
      return true;
    }
    if (property.startsWith('ui.container.')) {
      const pole = property.slice('ui.container.'.length) as keyof UiFlowContainer;
      this.container = { direction: 'row', ...(this.container ?? {}), [pole]: value } as UiFlowContainer;
      this.notifyChange();
      return true;
    }

    switch (property) {
      case 'ui.kind':
        if (!RODZAJE.includes(value as UiWidgetKind)) return true;
        this.kind = value as UiWidgetKind;
        this.notifyChange();
        return true;
      case 'ui.x': case 'ui.y': case 'ui.w': case 'ui.h':
        this[property.slice(3) as 'x' | 'y' | 'w' | 'h'] = String(value);
        this.notifyChange();
        return true;
      case 'ui.text':
        this.text = value as string;
        this.notifyChange();
        return true;
      case 'ui.color':
        this.color = value as string;
        this.notifyChange();
        return true;
      case 'ui.value':
        this.value = value as number;
        this.notifyChange();
        return true;
      case 'ui.anchor':
        this.anchor = value ? { ...(value as UiAnchor) } : undefined;
        this.notifyChange();
        return true;
      case 'ui.container':
        this.container = value ? { ...(value as UiFlowContainer) } : undefined;
        this.notifyChange();
        return true;
      default:
        return super.setProperty(property, value);
    }
  }

  override toData(): UiWidgetNodeData {
    return {
      ...super.toData(),
      type: 'ui-widget',
      kind: this.kind,
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h,
      ...(this.anchor ? { anchor: { ...this.anchor } } : {}),
      ...(this.flow ? { flow: { ...this.flow } } : {}),
      ...(this.container ? { container: { ...this.container } } : {}),
      ...(this.text !== undefined ? { text: this.text } : {}),
      ...(this.color !== undefined ? { color: this.color } : {}),
      ...(this.value !== undefined ? { value: this.value } : {}),
    };
  }
}

export const UI_NODE_TYPES = ['ui-root', 'ui-widget'] as const;

/** Czy węzeł należy do warstwy interfejsu — używane tam, gdzie scena i interfejs się rozchodzą. */
export function isUiNode(node: SceneNode): boolean {
  return node.type === 'ui-root' || node.type === 'ui-widget';
}
