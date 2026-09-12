import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { Entity, EntityInput, Layer, Project, ProjectData } from '../core';
import { build3dEntityObject } from '../renderer/EntityMeshBuilder';

// ── Download helper ────────────────────────────────────────────────────────────

function downloadBlob(content: string | ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function projectName(project: Project): string {
  return project.settings.name?.trim() || 'project';
}

// ── JSON save / load ────────────────────────────────────────────────────────────

export function exportJSON(project: Project): void {
  const data = project.toJSON();
  downloadBlob(JSON.stringify(data, null, 2), `${projectName(project)}.cad.json`, 'application/json');
}

/**
 * Load a project from a JSON string, mutating the existing project singleton in-place.
 * Used by the server project browser so the same logic is shared.
 */
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

export function shiftEntity(entity: Entity, dx: number, dy: number): Entity {
  switch (entity.type) {
    case 'line': return { ...entity, x1: entity.x1 + dx, y1: entity.y1 + dy, x2: entity.x2 + dx, y2: entity.y2 + dy };
    case 'circle': return { ...entity, cx: entity.cx + dx, cy: entity.cy + dy };
    case 'point': return { ...entity, x: entity.x + dx, y: entity.y + dy };
    case 'arc': return { ...entity, cx: entity.cx + dx, cy: entity.cy + dy };
    case 'rect': return { ...entity, x: entity.x + dx, y: entity.y + dy };
    case 'polyline': return { ...entity, points: entity.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    case 'freehand': return { ...entity, points: entity.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    case 'text': return { ...entity, x: entity.x + dx, y: entity.y + dy };
    case 'image': return { ...entity, x: entity.x + dx, y: entity.y + dy };
    case 'dimension': return { ...entity, x1: entity.x1 + dx, y1: entity.y1 + dy, x2: entity.x2 + dx, y2: entity.y2 + dy };
    case 'box3d': return { ...entity, cx: entity.cx + dx, cy: entity.cy + dy };
    case 'cylinder3d': return { ...entity, cx: entity.cx + dx, cy: entity.cy + dy };
    case 'sphere3d': return { ...entity, cx: entity.cx + dx, cy: entity.cy + dy };
    default: return entity;
  }
}

export function computeEntitiesCentroid(entities: Entity[]): { x: number; y: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const e of entities) {
    const bb = e.boundingBox;
    if (bb) {
      minX = Math.min(minX, bb.minX); maxX = Math.max(maxX, bb.maxX);
      minY = Math.min(minY, bb.minY); maxY = Math.max(maxY, bb.maxY);
    }
  }
  return isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : { x: 0, y: 0 };
}

export function mergeProjectFromText(jsonText: string, project: Project): void {
  const data = JSON.parse(jsonText) as ProjectData;
  for (const layer of data.layers.layers) {
    if (layer.id === '0') continue;
    project.layerSystem.addWithId(layer);
  }
  for (const entity of data.entities) {
    project.entityRegistry.addWithId({ ...entity, id: crypto.randomUUID() });
  }
  project.eventBus.emit('project:loaded', null);
}

export function importJSON(file: File, project: Project): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target!.result as string) as ProjectData;
        // Mutate existing project singleton in-place
        project.entityRegistry.clear();
        project.layerSystem.clear();
        project.historyManager.clear();
        project.selectionManager.clear();
        project.layerSystem.fromData(data.layers);
        project.entityRegistry.fromData(data.entities);
        project.settings = { ...data.settings };
        project.snapEngine.setGridSize(project.settings.gridSize);
        project.eventBus.emit('project:loaded', null);
        resolve();
      } catch (err) {
        reject(new Error(`Invalid project file: ${(err as Error).message}`));
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });
}

// ── DXF export ─────────────────────────────────────────────────────────────────

/** Convert a CSS hex color to the nearest DXF ACI color index (1–7, default 7=white). */
function hexToAci(hex: string): number {
  const ACI: Array<[number, number, number, number]> = [
    [255, 0, 0, 1],     // red
    [255, 255, 0, 2],   // yellow
    [0, 255, 0, 3],     // green
    [0, 255, 255, 4],   // cyan
    [0, 0, 255, 5],     // blue
    [255, 0, 255, 6],   // magenta
    [255, 255, 255, 7], // white
    [128, 128, 128, 8], // gray
  ];
  const h = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  let best = 7, bestDist = Infinity;
  for (const [cr, cg, cb, aci] of ACI) {
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (dist < bestDist) { bestDist = dist; best = aci; }
  }
  return best;
}

function dxfEntityLines(lines: string[], entity: Entity, layer: Layer | undefined): void {
  const layerName = layer?.name ?? '0';
  const pushCommon = () => {
    lines.push('8', layerName);
    if (entity.color !== 'bylayer') lines.push('62', String(hexToAci(entity.color as string)));
  };

  switch (entity.type) {
    case 'line':
      lines.push('0', 'LINE');
      pushCommon();
      lines.push('10', String(entity.x1), '20', String(entity.y1), '30', '0.0');
      lines.push('11', String(entity.x2), '21', String(entity.y2), '31', '0.0');
      break;

    case 'circle':
      lines.push('0', 'CIRCLE');
      pushCommon();
      lines.push('10', String(entity.cx), '20', String(entity.cy), '30', '0.0');
      lines.push('40', String(entity.radius));
      break;

    case 'point':
      lines.push('0', 'POINT');
      pushCommon();
      lines.push('10', String(entity.x), '20', String(entity.y), '30', '0.0');
      break;

    case 'arc':
      lines.push('0', 'ARC');
      pushCommon();
      lines.push('10', String(entity.cx), '20', String(entity.cy), '30', '0.0');
      lines.push('40', String(entity.radius));
      lines.push('50', String((entity.startAngle * 180) / Math.PI));
      lines.push('51', String((entity.endAngle * 180) / Math.PI));
      break;

    case 'rect': {
      const { x, y, width: w, height: h } = entity;
      lines.push('0', 'LWPOLYLINE');
      pushCommon();
      lines.push('90', '4', '70', '1');
      lines.push('10', String(x), '20', String(y));
      lines.push('10', String(x + w), '20', String(y));
      lines.push('10', String(x + w), '20', String(y + h));
      lines.push('10', String(x), '20', String(y + h));
      break;
    }

    case 'polyline': {
      lines.push('0', 'LWPOLYLINE');
      pushCommon();
      lines.push('90', String(entity.points.length));
      lines.push('70', entity.closed ? '1' : '0');
      for (const p of entity.points) lines.push('10', String(p.x), '20', String(p.y));
      break;
    }

    case 'dimension': {
      // Approximate as extension lines + dimension line
      const { x1, y1, x2, y2, offset } = entity;
      const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (len < 0.001) break;
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      for (const [ax, ay, bx, by] of [
        [x1, y1, x1 + nx * offset, y1 + ny * offset],
        [x2, y2, x2 + nx * offset, y2 + ny * offset],
        [x1 + nx * offset, y1 + ny * offset, x2 + nx * offset, y2 + ny * offset],
      ] as [number, number, number, number][]) {
        lines.push('0', 'LINE');
        pushCommon();
        lines.push('10', String(ax), '20', String(ay), '30', '0.0');
        lines.push('11', String(bx), '21', String(by), '31', '0.0');
      }
      break;
    }

    case 'box3d': {
      const { cx, cy, width: w, depth: d } = entity;
      lines.push('0', 'LWPOLYLINE');
      pushCommon();
      lines.push('90', '4', '70', '1');
      lines.push('10', String(cx - w / 2), '20', String(cy - d / 2));
      lines.push('10', String(cx + w / 2), '20', String(cy - d / 2));
      lines.push('10', String(cx + w / 2), '20', String(cy + d / 2));
      lines.push('10', String(cx - w / 2), '20', String(cy + d / 2));
      break;
    }

    case 'cylinder3d':
    case 'sphere3d':
      lines.push('0', 'CIRCLE');
      pushCommon();
      lines.push('10', String(entity.cx), '20', String(entity.cy), '30', '0.0');
      lines.push('40', String(entity.radius));
      break;
  }
}

export function exportDXF(project: Project): void {
  const lines: string[] = [];

  // HEADER
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1015'); // R2000 — required for LWPOLYLINE
  lines.push('9', '$MEASUREMENT', '70', project.settings.units === 'mm' ? '1' : '0');
  lines.push('0', 'ENDSEC');

  // TABLES — LAYER table
  const allLayers = project.layerSystem.getAll();
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', String(allLayers.length));
  for (const layer of allLayers) {
    lines.push('0', 'LAYER');
    lines.push('2', layer.name);
    lines.push('70', '0');
    lines.push('62', String(hexToAci(layer.color)));
    lines.push('6', 'CONTINUOUS');
  }
  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // ENTITIES
  lines.push('0', 'SECTION', '2', 'ENTITIES');
  for (const entity of project.entityRegistry.getAll()) {
    if (!entity.visible) continue;
    const layer = project.layerSystem.get(entity.layerId);
    if (layer && !layer.visible) continue;
    dxfEntityLines(lines, entity, layer);
  }
  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  downloadBlob(lines.join('\n'), `${projectName(project)}.dxf`, 'application/dxf');
}

// ── SVG export ─────────────────────────────────────────────────────────────────

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

    case 'point': {
      const s = 3;
      return [
        `<line x1="${entity.x - s}" y1="${entity.y}" x2="${entity.x + s}" y2="${entity.y}" ${stroke}/>`,
        `<line x1="${entity.x}" y1="${entity.y - s}" x2="${entity.x}" y2="${entity.y + s}" ${stroke}/>`,
      ].join('\n');
    }

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
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      const d1x = x1 + nx * offset, d1y = y1 + ny * offset;
      const d2x = x2 + nx * offset, d2y = y2 + ny * offset;
      return [
        `<line x1="${x1}" y1="${y1}" x2="${d1x}" y2="${d1y}" ${stroke}/>`,
        `<line x1="${x2}" y1="${y2}" x2="${d2x}" y2="${d2y}" ${stroke}/>`,
        `<line x1="${d1x}" y1="${d1y}" x2="${d2x}" y2="${d2y}" ${stroke}/>`,
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

export function exportSVG(project: Project): void {
  const entities = project.entityRegistry.getAll().filter(e => {
    if (!e.visible) return false;
    const layer = project.layerSystem.get(e.layerId);
    return !layer || layer.visible;
  });

  if (entities.length === 0) {
    downloadBlob('<svg xmlns="http://www.w3.org/2000/svg"></svg>', `${projectName(project)}.svg`, 'image/svg+xml');
    return;
  }

  // Compute bounding box from entity bounding boxes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of entities) {
    const bb = e.boundingBox;
    minX = Math.min(minX, bb.minX);
    minY = Math.min(minY, bb.minY);
    maxX = Math.max(maxX, bb.maxX);
    maxY = Math.max(maxY, bb.maxY);
  }

  const padding = 20;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2;

  // SVG uses Y-down; CAD uses Y-up → flip by translating and scaling
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" style="background:#1e1e1e">`,
    // Transform: flip Y, offset origin
    `<g transform="translate(${(padding - minX).toFixed(2)},${(h - padding + minY).toFixed(2)}) scale(1,-1)">`,
  ];

  for (const entity of entities) {
    const layer = project.layerSystem.get(entity.layerId);
    const el = entityToSvgElement(entity, layer);
    if (el) lines.push(el);
  }

  lines.push('</g>', '</svg>');
  downloadBlob(lines.join('\n'), `${projectName(project)}.svg`, 'image/svg+xml');
}

// ── 3D scene builder (shared by OBJ + glTF) ───────────────────────────────────

function buildExportScene(project: Project): THREE.Group {
  const group = new THREE.Group();
  for (const entity of project.entityRegistry.getAll()) {
    if (!entity.visible) continue;
    const layer = project.layerSystem.get(entity.layerId);
    if (layer && !layer.visible) continue;
    group.add(build3dEntityObject(entity, layer, false));
  }
  return group;
}

// ── OBJ export ─────────────────────────────────────────────────────────────────

export function exportOBJ(project: Project): void {
  const group = buildExportScene(project);
  const exporter = new OBJExporter();
  const result = exporter.parse(group);
  downloadBlob(result, `${projectName(project)}.obj`, 'model/obj');
}

// ── glTF export ────────────────────────────────────────────────────────────────

export function exportGLTF(project: Project, binary = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const group = buildExportScene(project);
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        const name = projectName(project);
        if (binary) {
          downloadBlob(result as ArrayBuffer, `${name}.glb`, 'model/gltf-binary');
        } else {
          downloadBlob(JSON.stringify(result), `${name}.gltf`, 'model/gltf+json');
        }
        resolve();
      },
      (error) => reject(error),
      { binary },
    );
  });
}

// ── STL export ─────────────────────────────────────────────────────────────────

export function exportSTL(project: Project): void {
  const group = buildExportScene(project);
  const exporter = new STLExporter();
  const result = exporter.parse(group, { binary: false }) as string;
  downloadBlob(result, `${projectName(project)}.stl`, 'model/stl');
}

function findLayerId(project: Project, layerName: string): string {
  for (const layer of project.layerSystem.getAll()) {
    if (layer.name === layerName) return layer.id;
  }
  return project.layerSystem.getActiveId();
}

function parseDxfEntities(text: string, project: Project): EntityInput[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const tokens: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!isNaN(code)) tokens.push([code, lines[i + 1].trim()]);
  }

  let inEntities = false;
  const result: EntityInput[] = [];
  let ti = 0;

  while (ti < tokens.length) {
    const [code, val] = tokens[ti];

    if (code === 0 && val === 'SECTION') {
      if (ti + 1 < tokens.length && tokens[ti + 1][0] === 2 && tokens[ti + 1][1] === 'ENTITIES') {
        inEntities = true;
        ti += 2;
        continue;
      }
    }

    if (code === 0 && val === 'ENDSEC' && inEntities) break;

    if (!inEntities) { ti++; continue; }

    if (code !== 0) { ti++; continue; }

    const entityType = val.toUpperCase();
    ti++;

    const props = new Map<number, string[]>();
    while (ti < tokens.length && tokens[ti][0] !== 0) {
      const [ec, ev] = tokens[ti];
      const arr = props.get(ec) ?? [];
      arr.push(ev);
      props.set(ec, arr);
      ti++;
    }

    const n = (c: number, def = 0, idx = 0): number => {
      const a = props.get(c);
      if (!a || idx >= a.length) return def;
      const v = parseFloat(a[idx]);
      return isNaN(v) ? def : v;
    };
    const str = (c: number, def = ''): string => props.get(c)?.[0] ?? def;

    const layerId = findLayerId(project, str(8, '0'));
    const base = {
      layerId,
      color: 'bylayer' as const,
      lineType: 'bylayer' as const,
      lineWidth: 'bylayer' as const,
      visible: true,
      locked: false,
      extrudeHeight: 0,
    };

    if (entityType === 'LINE') {
      result.push({ ...base, type: 'line', x1: n(10), y1: n(20), x2: n(11), y2: n(21) });
    } else if (entityType === 'CIRCLE') {
      result.push({ ...base, type: 'circle', cx: n(10), cy: n(20), radius: n(40) });
    } else if (entityType === 'ARC') {
      result.push({
        ...base, type: 'arc',
        cx: n(10), cy: n(20), radius: n(40),
        startAngle: (n(50) * Math.PI) / 180,
        endAngle: (n(51) * Math.PI) / 180,
      });
    } else if (entityType === 'LWPOLYLINE') {
      const xs = props.get(10) ?? [];
      const ys = props.get(20) ?? [];
      const count = Math.min(xs.length, ys.length);
      if (count >= 2) {
        const points = Array.from({ length: count }, (_, k) => ({
          x: parseFloat(xs[k]) || 0,
          y: parseFloat(ys[k]) || 0,
        }));
        const flags = parseInt(props.get(70)?.[0] ?? '0', 10) || 0;
        result.push({ ...base, type: 'polyline', points, closed: (flags & 1) === 1 });
      }
    }
  }

  return result;
}

export function importDXF(file: File, project: Project): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const inputs = parseDxfEntities(e.target!.result as string, project);
        for (const input of inputs) project.entityRegistry.add(input);
        project.eventBus.emit('project:loaded', null);
        resolve();
      } catch (err) {
        reject(new Error(`DXF import failed: ${(err as Error).message}`));
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });
}

// ── STL import ─────────────────────────────────────────────────────────────────

/** Parses an STL file and returns a Scene 3D JSON string ready for Scene3DView. */
