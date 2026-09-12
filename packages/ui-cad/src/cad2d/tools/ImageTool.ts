import type { Point2D } from '../core';
import type { PreviewGeometry, Tool, ToolContext, ToolName } from './types';

export class ImageTool implements Tool {
  name: ToolName = 'image';

  getPreview(): PreviewGeometry | null { return null; }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(input);

    input.onchange = () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        if (!src) return;
        const img = new Image();
        img.onload = () => {
          const aspect = img.naturalWidth / (img.naturalHeight || 1);
          const height = 100;
          const width = height * aspect;
          ctx.project.addEntity({
            type: 'image',
            layerId: ctx.project.layerSystem.getActiveId(),
            color: 'bylayer',
            lineType: 'bylayer',
            lineWidth: 'bylayer',
            visible: true,
            locked: false,
            extrudeHeight: 0,
            x: point.x - width / 2,
            y: point.y - height / 2,
            width,
            height,
            src,
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    };

    input.click();
  }

  onPointerMove(_p: Point2D, _ctx: ToolContext): void {}
  onPointerUp(_p: Point2D, _ctx: ToolContext): void {}
  onKeyDown(key: string, _ctx: ToolContext): void { if (key === 'Escape') this.reset(); }
  reset(): void {}
}

export const imageTool = new ImageTool();
