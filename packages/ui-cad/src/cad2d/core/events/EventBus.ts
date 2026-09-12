export type CadEventType =
  | 'entity:added'
  | 'entity:updated'
  | 'entity:removed'
  | 'layer:added'
  | 'layer:updated'
  | 'layer:removed'
  | 'selection:changed'
  | 'history:changed'
  | 'project:loaded'
  | 'viewmode:changed';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => void;

export class EventBus {
  private handlers = new Map<CadEventType, Set<Handler>>();

  on(type: CadEventType, handler: Handler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.off(type, handler);
  }

  off(type: CadEventType, handler: Handler): void {
    this.handlers.get(type)?.delete(handler);
  }

  emit(type: CadEventType, payload?: unknown): void {
    this.handlers.get(type)?.forEach(h => h(payload));
  }

  clear(): void {
    this.handlers.clear();
  }
}
