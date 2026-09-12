import type { Point2D } from '../core';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

/** Point tool — pojedynczy klik stawia punkt (encja typu 'point'). */
export class PointTool implements Tool {
  name = 'point' as const;
  private cursor: Point2D | null = null;

  getPreview(): PreviewGeometry | null {
    return null; // the cursor cross is drawn by CadCanvas; the point exists only after a click
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.cursor) return [];
    return [
      {
        id: 'x',
        worldX: this.cursor.x, worldY: this.cursor.y, text: `X: ${this.cursor.x.toFixed(2)}`,
        offsetX: 40, offsetY: -20, variant: 'primary',
      },
      {
        id: 'y',
        worldX: this.cursor.x, worldY: this.cursor.y, text: `Y: ${this.cursor.y.toFixed(2)}`,
        offsetX: 40, offsetY: -2, variant: 'secondary',
      },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    ctx.project.addEntity({
      type: 'point',
      x: point.x, y: point.y,
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
      visible: true, locked: false, extrudeHeight: 0,
    });
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    this.cursor = point;
  }

  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  onKeyDown(_key: string, _ctx: ToolContext): void {}

  reset(): void {
    this.cursor = null;
  }
}
