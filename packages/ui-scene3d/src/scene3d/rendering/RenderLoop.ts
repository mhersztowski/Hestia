import type { RenderEngine } from './RenderEngine';

export class RenderLoop {
  private engine: RenderEngine;
  private animationFrameId: number | null = null;
  private callbacks: Array<(delta: number) => void> = [];
  private lastTime = 0;

  constructor(engine: RenderEngine) {
    this.engine = engine;
  }

  start(): void {
    if (this.animationFrameId !== null) return;

    this.lastTime = performance.now();

    const loop = (time: number) => {
      const delta = (time - this.lastTime) / 1000;
      this.lastTime = time;

      for (const cb of this.callbacks) {
        cb(delta);
      }

      this.engine.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  addCallback(cb: (delta: number) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter((c) => c !== cb);
    };
  }
}
