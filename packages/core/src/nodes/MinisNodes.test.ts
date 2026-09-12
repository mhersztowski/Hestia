import { describe, it, expect } from 'vitest';
import { MinisDeviceNode } from './MinisDeviceNode';
import { MinisModuleNode } from './MinisModuleNode';
import { MinisProjectNode } from './MinisProjectNode';
import { MinisProjectDefNode } from './MinisProjectDefNode';
import { MinisLocalizationNode } from './MinisLocalizationNode';
import type { MinisDeviceModel } from '../models/MinisDeviceModel';
import type { MinisModuleModel } from '../models/MinisModuleModel';
import type { MinisProjectModel } from '../models/MinisProjectModel';
import type { MinisProjectDefModel } from '../models/MinisProjectDefModel';
import type { MinisLocalizationModel } from '../models/MinisLocalizationModel';

describe('MinisDeviceNode', () => {
  const model: MinisDeviceModel = {
    type: 'device', id: 'd1', name: 'ESP', deviceDefId: 'def1',
    isAssembled: true, isIot: true, sn: 'SN-1',
  };

  it('round-trips via toModel', () => {
    expect(new MinisDeviceNode(model).toModel()).toEqual(model);
  });

  it('getDisplayName prefers name, then sn, then id', () => {
    expect(new MinisDeviceNode(model).getDisplayName()).toBe('ESP');
    expect(new MinisDeviceNode({ ...model, name: '' }).getDisplayName()).toBe('SN-1');
    expect(new MinisDeviceNode({ ...model, name: '', sn: '' }).getDisplayName()).toBe('d1');
  });

  it('matches name, deviceDefId and sn', () => {
    const n = new MinisDeviceNode(model);
    expect(n.matches('esp')).toBe(true);
    expect(n.matches('def1')).toBe(true);
    expect(n.matches('sn-1')).toBe(true);
    expect(n.matches('zzz')).toBe(false);
  });

  it('clone preserves base state', () => {
    expect(new MinisDeviceNode(model).setSelected(true).clone().isSelected).toBe(true);
  });
});

describe('MinisModuleNode', () => {
  const model: MinisModuleModel = { type: 'module', id: 'm1', moduleDefId: 'mdef', sn: 'S9' };
  it('round-trips and displays def + sn', () => {
    const n = new MinisModuleNode(model);
    expect(n.toModel()).toEqual(model);
    expect(n.getDisplayName()).toBe('mdef (S9)');
  });
  it('matches def and sn', () => {
    const n = new MinisModuleNode(model);
    expect(n.matches('mdef')).toBe(true);
    expect(n.matches('s9')).toBe(true);
    expect(n.matches('no')).toBe(false);
  });
});

describe('MinisProjectNode', () => {
  const model: MinisProjectModel = {
    type: 'minis_project', id: 'p1', name: 'Proj', githubProjectId: 'gh-9',
    softwarePlatform: 'arduino',
  };
  it('round-trips and matches name/github id', () => {
    const n = new MinisProjectNode(model);
    expect(n.toModel()).toEqual(model);
    expect(n.getDisplayName()).toBe('Proj');
    expect(n.matches('proj')).toBe(true);
    expect(n.matches('gh-9')).toBe(true);
    expect(n.matches('x')).toBe(false);
  });
});

describe('MinisProjectDefNode', () => {
  const model: MinisProjectDefModel = {
    type: 'project_def', id: 'pd1', name: 'Def', version: '2.0',
    deviceDefId: 'dd', moduleDefId: 'md', softwarePlatform: 'upython', blocklyDef: '{}',
  };
  it('round-trips and displays name + version', () => {
    const n = new MinisProjectDefNode(model);
    expect(n.toModel()).toEqual(model);
    expect(n.getDisplayName()).toBe('Def v2.0');
  });
  it('matches name, moduleDefId, platform', () => {
    const n = new MinisProjectDefNode(model);
    expect(n.matches('def')).toBe(true);
    expect(n.matches('md')).toBe(true);
    expect(n.matches('upython')).toBe(true);
    expect(n.matches('zzz')).toBe(false);
  });
});

describe('MinisLocalizationNode', () => {
  const model: MinisLocalizationModel = {
    type: 'localization', id: 'loc1', name: 'Home', typ: 'geo',
    place: null, geo: { lat: 52.2, lon: 21.0 }, device: 'esp32',
  };
  it('round-trips and matches name/device', () => {
    const n = new MinisLocalizationNode(model);
    expect(n.toModel()).toEqual(model);
    expect(n.getDisplayName()).toBe('Home');
    expect(n.matches('home')).toBe(true);
    expect(n.matches('esp32')).toBe(true);
    expect(n.matches('nope')).toBe(false);
  });
  it('clone preserves base state', () => {
    expect(new MinisLocalizationNode(model).markDirty().clone().isDirty).toBe(true);
  });
});
