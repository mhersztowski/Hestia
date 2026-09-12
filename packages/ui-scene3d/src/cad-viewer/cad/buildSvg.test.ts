import { Project } from '@hestia/ui-cad/cad2d';
import type { EntityInput } from '@hestia/ui-cad/cad2d';
import { buildSVGString, loadProjectFromText } from './buildSvg';

const base = {
  layerId: '',
  color: 'bylayer' as const,
  lineType: 'bylayer' as const,
  lineWidth: 'bylayer' as const,
  visible: true,
  locked: false,
  extrudeHeight: 0,
};

const line = (o: Partial<EntityInput> = {}): EntityInput =>
  ({ ...base, type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, ...o } as EntityInput);

describe('buildSVGString', () => {
  it('returns a placeholder svg for an empty project', () => {
    const p = new Project();
    const svg = buildSVGString(p);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="400"');
    expect(svg).not.toContain('<line');
  });

  it('emits a <line> element for a line entity', () => {
    const p = new Project();
    p.addEntity(line());
    const svg = buildSVGString(p);
    expect(svg).toContain('<line');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('scale(1,-1)');
  });

  it('emits <circle> and <rect> elements', () => {
    const p = new Project();
    p.addEntity({ ...base, type: 'circle', cx: 5, cy: 5, radius: 3 } as EntityInput);
    p.addEntity({ ...base, type: 'rect', x: 0, y: 0, width: 4, height: 2 } as EntityInput);
    const svg = buildSVGString(p);
    expect(svg).toContain('<circle');
    expect(svg).toContain('r="3"');
    expect(svg).toContain('<rect');
  });

  it('emits a polygon for a closed polyline and polyline otherwise', () => {
    const p1 = new Project();
    p1.addEntity({ ...base, type: 'polyline', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true } as EntityInput);
    expect(buildSVGString(p1)).toContain('<polygon');

    const p2 = new Project();
    p2.addEntity({ ...base, type: 'polyline', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false } as EntityInput);
    expect(buildSVGString(p2)).toContain('<polyline');
  });

  it('emits an arc path', () => {
    const p = new Project();
    p.addEntity({ ...base, type: 'arc', cx: 0, cy: 0, radius: 5, startAngle: 0, endAngle: Math.PI } as EntityInput);
    const svg = buildSVGString(p);
    expect(svg).toContain('<path');
    expect(svg).toContain('A5,5');
  });

  it('emits dimension lines, arrowheads and a measured-length label', () => {
    const p = new Project();
    p.addEntity({ ...base, type: 'dimension', x1: 0, y1: 0, x2: 10, y2: 0, offset: 5 } as EntityInput);
    const svg = buildSVGString(p);
    expect(svg).toContain('<text');
    expect(svg).toContain('10.00'); // measured length label
    // extension + dimension + arrow lines
    expect((svg.match(/<line/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('skips invisible entities', () => {
    const p = new Project();
    const e = p.addEntity(line());
    p.updateEntity(e.id, { visible: false });
    expect(buildSVGString(p)).not.toContain('<line');
  });

  it('uses the layer color when entity color is bylayer', () => {
    const p = new Project();
    const l = p.layerSystem.add({ name: 'red', color: '#ff0000', lineType: 'solid', lineWidth: 1, visible: true, locked: false });
    p.addEntity(line({ layerId: l.id }));
    expect(buildSVGString(p)).toContain('#ff0000');
  });
});

describe('loadProjectFromText', () => {
  it('restores entities and settings from serialized JSON', () => {
    const src = new Project();
    src.addEntity(line());
    src.addEntity({ ...base, type: 'circle', cx: 1, cy: 1, radius: 2 } as EntityInput);
    const json = JSON.stringify(src.toJSON());

    const dest = new Project();
    loadProjectFromText(json, dest);
    expect(dest.entityRegistry.getAll()).toHaveLength(2);
  });

  it('clears any pre-existing content before loading', () => {
    const src = new Project();
    src.addEntity(line());
    const json = JSON.stringify(src.toJSON());

    const dest = new Project();
    dest.addEntity(line());
    dest.addEntity(line());
    loadProjectFromText(json, dest);
    expect(dest.entityRegistry.getAll()).toHaveLength(1);
  });

  it('emits project:loaded', () => {
    const src = new Project();
    const json = JSON.stringify(src.toJSON());
    const dest = new Project();
    let loaded = false;
    dest.eventBus.on('project:loaded', () => { loaded = true; });
    loadProjectFromText(json, dest);
    expect(loaded).toBe(true);
  });
});
