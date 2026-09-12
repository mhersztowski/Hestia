import type { Disposable, VfsEvent, VfsEventListener } from './types';

export class VfsEventEmitter<T> {
  private listeners = new Set<VfsEventListener<T>>();
  private disposed = false;

  readonly event: VfsEvent<T> = (listener: VfsEventListener<T>): Disposable => {
    if (this.disposed) return { dispose: () => {} };
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  fire(data: T): void {
    if (this.disposed) return;
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
