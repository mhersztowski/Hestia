import type { Disposable } from '../utils/types';
import { DisposableStore, toDisposable } from '../utils/disposable';

export interface StatusBarItem {
  readonly id: string;
  readonly alignment: 'left' | 'right';
  readonly priority?: number;
  text: string;
  tooltip?: string;
  command?: string;
  visible: boolean;
}

export interface StatusBarItemOptions {
  readonly id: string;
  readonly alignment?: 'left' | 'right';
  readonly priority?: number;
  readonly text?: string;
  readonly tooltip?: string;
  readonly command?: string;
}

/**
 * Status bar component for displaying editor information
 */
export class StatusBar implements Disposable {
  private readonly container: HTMLElement;
  private readonly items = new Map<string, StatusBarItemImpl>();
  private readonly leftContainer: HTMLElement;
  private readonly rightContainer: HTMLElement;
  private readonly disposables = new DisposableStore();

  constructor(parentContainer: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'editor-statusbar';
    this.container.setAttribute('role', 'status');

    this.leftContainer = document.createElement('div');
    this.leftContainer.className = 'editor-statusbar-left';

    this.rightContainer = document.createElement('div');
    this.rightContainer.className = 'editor-statusbar-right';

    this.container.appendChild(this.leftContainer);
    this.container.appendChild(this.rightContainer);
    parentContainer.appendChild(this.container);

    this.disposables.add(
      toDisposable(() => {
        this.container.remove();
      })
    );
  }

  /**
   * Creates a new status bar item
   */
  createItem(options: StatusBarItemOptions): StatusBarItem & Disposable {
    const item = new StatusBarItemImpl(
      options,
      options.alignment === 'right' ? this.rightContainer : this.leftContainer
    );

    this.items.set(options.id, item);
    this.renderItems();

    return {
      get id() {
        return item.id;
      },
      get alignment() {
        return item.alignment;
      },
      get priority() {
        return item.priority;
      },
      get text() {
        return item.text;
      },
      set text(value: string) {
        item.text = value;
      },
      get tooltip() {
        return item.tooltip;
      },
      set tooltip(value: string | undefined) {
        item.tooltip = value;
      },
      get command() {
        return item.command;
      },
      set command(value: string | undefined) {
        item.command = value;
      },
      get visible() {
        return item.visible;
      },
      set visible(value: boolean) {
        item.visible = value;
      },
      dispose: () => {
        this.items.delete(options.id);
        item.dispose();
      },
    };
  }

  /**
   * Gets an item by ID
   */
  getItem(id: string): StatusBarItem | undefined {
    return this.items.get(id);
  }

  /**
   * Removes an item
   */
  removeItem(id: string): boolean {
    const item = this.items.get(id);
    if (item) {
      item.dispose();
      this.items.delete(id);
      return true;
    }
    return false;
  }

  private renderItems(): void {
    const leftItems = Array.from(this.items.values())
      .filter((item) => item.alignment === 'left')
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    const rightItems = Array.from(this.items.values())
      .filter((item) => item.alignment === 'right')
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    this.leftContainer.innerHTML = '';
    this.rightContainer.innerHTML = '';

    for (const item of leftItems) {
      this.leftContainer.appendChild(item.element);
    }

    for (const item of rightItems) {
      this.rightContainer.appendChild(item.element);
    }
  }

  dispose(): void {
    for (const item of this.items.values()) {
      item.dispose();
    }
    this.items.clear();
    this.disposables.dispose();
  }
}

class StatusBarItemImpl implements StatusBarItem, Disposable {
  readonly id: string;
  readonly alignment: 'left' | 'right';
  readonly priority?: number;
  readonly element: HTMLElement;

  private _text: string;
  private _tooltip?: string;
  private _command?: string;
  private _visible = true;

  constructor(options: StatusBarItemOptions, container: HTMLElement) {
    this.id = options.id;
    this.alignment = options.alignment ?? 'left';
    this.priority = options.priority;
    this._text = options.text ?? '';
    this._tooltip = options.tooltip;
    this._command = options.command;

    this.element = document.createElement('span');
    this.element.className = 'editor-statusbar-item';
    this.element.setAttribute('data-item-id', this.id);
    this.updateElement();

    container.appendChild(this.element);
  }

  get text(): string {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
    this.updateElement();
  }

  get tooltip(): string | undefined {
    return this._tooltip;
  }

  set tooltip(value: string | undefined) {
    this._tooltip = value;
    this.updateElement();
  }

  get command(): string | undefined {
    return this._command;
  }

  set command(value: string | undefined) {
    this._command = value;
    this.updateElement();
  }

  get visible(): boolean {
    return this._visible;
  }

  set visible(value: boolean) {
    this._visible = value;
    this.element.style.display = value ? '' : 'none';
  }

  private updateElement(): void {
    this.element.textContent = this._text;

    if (this._tooltip) {
      this.element.title = this._tooltip;
    } else {
      this.element.removeAttribute('title');
    }

    if (this._command) {
      this.element.classList.add('editor-statusbar-item-clickable');
      this.element.setAttribute('role', 'button');
      this.element.tabIndex = 0;
    } else {
      this.element.classList.remove('editor-statusbar-item-clickable');
      this.element.removeAttribute('role');
      this.element.removeAttribute('tabindex');
    }
  }

  dispose(): void {
    this.element.remove();
  }
}
