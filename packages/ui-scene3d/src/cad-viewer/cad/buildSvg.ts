/**
 * CAD project → SVG string, and JSON → Project loader. Ported read-only from
 * cad-app's io/CadExporter (SVG + load paths only). Depends only on core-cad.
 */

import type { Entity, Layer, Project, ProjectData } from '@hestia/ui-cad/cad2d';

/** Load a project from a JSON string, mutating the given project in-place. */
export function loadProjectFromText(jsonText: string, project: Project): void {
  const data = JSON.parse(jsonText) as ProjectData;
  project.entityRegistry.clear();
  project.layerSystem.clear();
  project.historyManager.clear();
  project.selectionManager.clear();
  project.layerSystem.fromData(data.layers);
  project.entityRegistry.fromData(data.entities);
  project.settings = { ...data.settings };
  project.snapEngine.setGridSize(project.settings.gridSize);
  project.eventBus.emit('project:loaded', null);
}

function entityToSvgElement(entity: Entity, layer: Layer | undefined): string {
  const colorHex = entity.color !== 'bylayer'
    ? (entity.color as string)
    : (layer?.color ?? '#ffffff');
  const stroke = `stroke="${colorHex}" fill="none" stroke-width="1"`;

  switch (entity.type) {
    case 'line':
      return `<line x1="${entity.x1}" y1="${entity.y1}" x2="${entity.x2}" y2="${entity.y2}" ${stroke}/>`;
    case 'circle':
      return `<circle cx="${entity.cx}" cy="${entity.cy}" r="${entity.radius}" ${stroke}/>`;
    case 'arc': {
      const { cx, cy, radius, startAngle, endAngle } = entity;
      let sweep = endAngle - startAngle;
      while (sweep <= 0) sweep += Math.PI * 2;
      const largeArc = sweep > Math.PI ? 1 : 0;
      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);
      return `<path d="M${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2}" ${stroke}/>`;
    }
    case 'rect': {
      const { x, y, width: w, height: h } = entity;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${stroke}/>`;
    }
    case 'polyline': {
      if (entity.points.length < 2) return '';
      const pts = entity.points.map(p => `${p.x},${p.y}`).join(' ');
      const tag = entity.closed ? 'polygon' : 'polyline';
      return `<${tag} points="${pts}" ${stroke}/>`;
    }
    case 'dimension': {
      const { x1, y1, x2, y2, offset } = entity;
      const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (len < 0.001) return '';
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;   // along the dimension line
      const nx = -uy, ny = ux;                            // perpendicular
      const d1x = x1 + nx * offset, d1y = y1 + ny * offset;
      const d2x = x2 + nx * offset, d2y = y2 + ny * offset;
      // Arrowhead V at (px,py) pointing along (dx,dy).
      const arrowSize = Math.max(4, len * 0.04);
      const wing = arrowSize * 0.4;
      const arrow = (px: number, py: number, dx: number, dy: number): string => {
        const bx = px - dx * arrowSize, by = py - dy * arrowSize;   // base behind the tip
        const a1x = bx - dy * wing, a1y = by + dx * wing;
        const a2x = bx + dy * wing, a2y = by - dx * wing;
        return `<line x1="${px}" y1="${py}" x2="${a1x}" y2="${a1y}" ${stroke}/>` +
               `<line x1="${px}" y1="${py}" x2="${a2x}" y2="${a2y}" ${stroke}/>`;
      };
      return [
        `<line x1="${x1}" y1="${y1}" x2="${d1x}" y2="${d1y}" ${stroke}/>`,
        `<line x1="${x2}" y1="${y2}" x2="${d2x}" y2="${d2y}" ${stroke}/>`,
        `<line x1="${d1x}" y1="${d1y}" x2="${d2x}" y2="${d2y}" ${stroke}/>`,
        arrow(d1x, d1y, ux, uy),    // at d1, pointing toward d2
        arrow(d2x, d2y, -ux, -uy),  // at d2, pointing toward d1
        `<text x="${(d1x + d2x) / 2}" y="${(d1y + d2y) / 2}" font-size="10" fill="${colorHex}" text-anchor="middle">${len.toFixed(2)}</text>`,
      ].join('\n');
    }
    default:
      return '';
  }
}

/** Build an SVG string from the project (no download — used by the read-only viewer). */
export function buildSVGString(project: Project): string {
  const entities = project.entityRegistry.getAll().filter(e => {
    if (!e.visible) return false;
    const layer = project.layerSystem.get(e.layerId);
    return !layer || layer.visible;
  });

  if (entities.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" style="background:#1e1e1e"></svg>';
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of entities) {
    minX = Math.min(minX, e.boundingBox.minX); minY = Math.min(minY, e.boundingBox.minY);
    maxX = Math.max(maxX, e.boundingBox.maxX); maxY = Math.max(maxY, e.boundingBox.maxY);
  }

  const padding = 20;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" style="background:#1e1e1e;width:100%;height:100%">`,
    `<g transform="translate(${(padding - minX).toFixed(2)},${(h - padding + minY).toFixed(2)}) scale(1,-1)">`,
  ];

  for (const entity of entities) {
    const layer = project.layerSystem.get(entity.layerId);
    const el = entityToSvgElement(entity, layer);
    if (el) lines.push(el);
  }

  lines.push('</g>', '</svg>');
  return lines.join('\n');
}
