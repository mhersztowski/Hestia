import { describe, it, expect } from 'vitest';
import { MinisDeviceDefNode } from './MinisDeviceDefNode';
import type { MinisDeviceDefModel } from '../models/MinisDeviceDefModel';

const makeDeviceDef = (overrides?: Partial<MinisDeviceDefModel>): MinisDeviceDefModel => ({
  type: 'device_def',
  id: 'dd1',
  name: 'SmartLight',
  modules: ['mod1', 'mod2'],
  ...overrides,
});

describe('MinisDeviceDefNode', () => {
  describe('fromModel / fromModels', () => {
    it('creates node with all fields', () => {
      const node = MinisDeviceDefNode.fromModel(makeDeviceDef());
      expect(node.id).toBe('dd1');
      expect(node.name).toBe('SmartLight');
      expect(node.modules).toEqual(['mod1', 'mod2']);
      expect(node.type).toBe('device_def');
    });

    it('fromModels creates array', () => {
      const nodes = MinisDeviceDefNode.fromModels([
        makeDeviceDef({ id: 'dd1' }),
        makeDeviceDef({ id: 'dd2', name: 'Sensor' }),
      ]);
      expect(nodes).toHaveLength(2);
      expect(nodes[1].name).toBe('Sensor');
    });
  });

  describe('getDisplayName', () => {
    it('returns name', () => {
      const node = MinisDeviceDefNode.fromModel(makeDeviceDef({ name: 'Motor' }));
      expect(node.getDisplayName()).toBe('Motor');
    });
  });

  describe('hasModule', () => {
    it('returns true when module exists', () => {
      const node = MinisDeviceDefNode.fromModel(makeDeviceDef({ modules: ['mod1', 'mod2'] }));
      expect(node.hasModule('mod1')).toBe(true);
    });

    it('returns false when module missing', () => {
      const node = MinisDeviceDefNode.fromModel(makeDeviceDef({ modules: ['mod1'] }));
      expect(node.hasModule('mod99')).toBe(false);
    });
  });

  describe('matches', () => {
    it('matches by name case-insensitive', () => {
      const node = MinisDeviceDefNode.fromModel(makeDeviceDef({ name: 'SmartLight' }));
      expect(node.matches('smart')).toBe(true);
      expect(node.matches('LIGHT')).toBe(true);
    });

    it('returns false when no match', () => {
      const node = MinisDeviceDefNode.fromModel(makeDeviceDef({ name: 'Motor' }));
      expect(node.matches('sensor')).toBe(false);
    });
  });

  describe('toModel', () => {
    it('round-trips all fields', () => {
      const original = makeDeviceDef();
      const node = MinisDeviceDefNode.fromModel(original);
      expect(node.toModel()).toEqual(original);
    });

    it('produces deep copy of modules', () => {
      const node = MinisDeviceDefNode.fromModel(makeDeviceDef({ modules: ['mod1'] }));
      const model = node.toModel();
      model.modules.push('hacked');
      expect(node.modules).toEqual(['mod1']);
    });
  });

  describe('clone', () => {
    it('creates independent copy preserving UI state', () => {
      const node = MinisDeviceDefNode.fromModel(makeDeviceDef());
      node.setSelected(true).markDirty();
      const cloned = node.clone();

      expect(cloned.id).toBe(node.id);
      expect(cloned.isSelected).toBe(true);
      expect(cloned.isDirty).toBe(true);

      cloned.name = 'Changed';
      expect(node.name).toBe('SmartLight');
    });

    it('modules are independent from clone', () => {
      const node = MinisDeviceDefNode.fromModel(makeDeviceDef({ modules: ['mod1'] }));
      const cloned = node.clone();
      cloned.modules.push('mod99');
      expect(node.modules).toEqual(['mod1']);
    });
  });

  describe('constructor deep-copies modules', () => {
    it('mutation of source modules does not affect node', () => {
      const model = makeDeviceDef({ modules: ['mod1'] });
      const node = MinisDeviceDefNode.fromModel(model);
      model.modules.push('hacked');
      expect(node.modules).toEqual(['mod1']);
    });
  });
});
