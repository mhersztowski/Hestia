import type { Point2D } from '../core';
import type { PreviewGeometry, Tool, ToolContext, ToolName } from './types';

export class TextTool implements Tool {
  name: ToolName = 'text';

  fontSize = 10;
  fontFamily = 'Arial';
  content = 'Text';

  getPreview(): PreviewGeometry | null {
    return null;
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    ctx.project.addEntity({
      type: 'text',
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer',
      lineType: 'bylayer',
      lineWidth: 'bylayer',
      visible: true,
      locked: false,
      extrudeHeight: 0,
      x: point.x,
      y: point.y,
      content: this.content,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      angle: 0,
    });
  }

  onPointerMove(_p: Point2D, _ctx: ToolContext): void {}
  onPointerUp(_p: Point2D, _ctx: ToolContext): void {}
  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }
  reset(): void {}
}

export const textTool = new TextTool();
