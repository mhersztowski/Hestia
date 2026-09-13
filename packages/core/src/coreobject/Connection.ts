/**
 * Handle returned by Signal.connect(). Call disconnect() to sever the link.
 * Connections are reference-counted safe — multiple disconnects are no-ops.
 */
export class Connection {
  #active = true;
  readonly #disconnectFn: () => void;

  constructor(disconnectFn: () => void) {
    this.#disconnectFn = disconnectFn;
  }

  disconnect(): void {
    if (this.#active) {
      this.#active = false;
      this.#disconnectFn();
    }
  }

  get active(): boolean {
    return this.#active;
  }
}
