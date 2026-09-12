import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDataSource } from './MemoryDataSource';
import type { UsersModel, UserModel } from '../models/UserModel';
import type { MinisDeviceDefsModel, MinisDeviceDefModel } from '../models/MinisDeviceDefModel';
import type { MinisModuleDefsModel } from '../models/MinisModuleDefModel';
import type { MinisProjectDefsModel } from '../models/MinisProjectDefModel';

const makeUser = (id: string, name: string): UserModel => ({
  type: 'user', id, name, password: 'pw', isAdmin: false, roles: [],
});

const makeDeviceDef = (id: string, name: string, modules: string[] = []): MinisDeviceDefModel => ({
  type: 'device_def', id, name, modules,
});

describe('MemoryDataSource', () => {
  let ds: MemoryDataSource;

  beforeEach(() => {
    ds = new MemoryDataSource();
  });

  describe('initial state', () => {
    it('is not loaded', () => {
      expect(ds.isLoaded).toBe(false);
    });

    it('has empty collections', () => {
      expect(ds.users).toEqual([]);
      expect(ds.minisDeviceDefs).toEqual([]);
      expect(ds.minisModuleDefs).toEqual([]);
      expect(ds.minisProjectDefs).toEqual([]);
    });
  });

  describe('loadUsers', () => {
    it('populates users from model', () => {
      const data: UsersModel = {
        type: 'users',
        items: [makeUser('u1', 'Alice'), makeUser('u2', 'Bob')],
      };
      ds.loadUsers(data);
      expect(ds.users).toHaveLength(2);
    });

    it('clears previous users', () => {
      ds.loadUsers({ type: 'users', items: [makeUser('u1', 'Alice')] });
      ds.loadUsers({ type: 'users', items: [makeUser('u2', 'Bob')] });
      expect(ds.users).toHaveLength(1);
      expect(ds.users[0].name).toBe('Bob');
    });

    it('handles empty items', () => {
      ds.loadUsers({ type: 'users', items: [] });
      expect(ds.users).toEqual([]);
    });
  });

  describe('getUserById', () => {
    it('returns user by id', () => {
      ds.loadUsers({ type: 'users', items: [makeUser('u1', 'Alice')] });
      const user = ds.getUserById('u1');
      expect(user).toBeDefined();
      expect(user!.name).toBe('Alice');
    });

    it('returns undefined for unknown id', () => {
      expect(ds.getUserById('unknown')).toBeUndefined();
    });
  });

  describe('findUsers', () => {
    beforeEach(() => {
      ds.loadUsers({
        type: 'users',
        items: [makeUser('u1', 'Alice'), makeUser('u2', 'Bob')],
      });
    });

    it('returns all users with empty query', () => {
      expect(ds.findUsers('')).toHaveLength(2);
      expect(ds.findUsers('  ')).toHaveLength(2);
    });

    it('filters by matches', () => {
      expect(ds.findUsers('Ali')).toHaveLength(1);
      expect(ds.findUsers('Ali')[0].name).toBe('Alice');
    });

    it('returns empty for no match', () => {
      expect(ds.findUsers('xyz')).toHaveLength(0);
    });
  });

  describe('loadMinisDeviceDefs', () => {
    it('populates from model', () => {
      const data: MinisDeviceDefsModel = {
        type: 'device_defs',
        deviceDefs: [makeDeviceDef('dd1', 'Light', ['m1']), makeDeviceDef('dd2', 'Motor')],
      };
      ds.loadMinisDeviceDefs(data);
      expect(ds.minisDeviceDefs).toHaveLength(2);
    });

    it('getMinisDeviceDefById works', () => {
      ds.loadMinisDeviceDefs({
        type: 'device_defs',
        deviceDefs: [makeDeviceDef('dd1', 'Light')],
      });
      expect(ds.getMinisDeviceDefById('dd1')?.name).toBe('Light');
      expect(ds.getMinisDeviceDefById('unknown')).toBeUndefined();
    });

    it('findMinisDeviceDefs filters', () => {
      ds.loadMinisDeviceDefs({
        type: 'device_defs',
        deviceDefs: [makeDeviceDef('dd1', 'SmartLight'), makeDeviceDef('dd2', 'Motor')],
      });
      expect(ds.findMinisDeviceDefs('light')).toHaveLength(1);
      expect(ds.findMinisDeviceDefs('')).toHaveLength(2);
    });
  });

  describe('loadMinisModuleDefs', () => {
    it('populates from model', () => {
      const data: MinisModuleDefsModel = {
        type: 'module_defs',
        moduleDefs: [
          { type: 'module_def', id: 'md1', name: 'WiFi', isProgrammable: true },
        ],
      };
      ds.loadMinisModuleDefs(data);
      expect(ds.minisModuleDefs).toHaveLength(1);
      expect(ds.getMinisModuleDefById('md1')?.name).toBe('WiFi');
    });
  });

  describe('loadMinisProjectDefs', () => {
    it('populates from model', () => {
      const data: MinisProjectDefsModel = {
        type: 'project_defs',
        projectDefs: [
          {
            type: 'project_def', id: 'pd1', name: 'Blinky',
            version: '1.0', deviceDefId: 'dd1', moduleDefId: 'md1',
            softwarePlatform: 'Arduino', blocklyDef: '',
          },
        ],
      };
      ds.loadMinisProjectDefs(data);
      expect(ds.minisProjectDefs).toHaveLength(1);
      expect(ds.getMinisProjectDefById('pd1')?.name).toBe('Blinky');
    });
  });

  describe('setLoaded / isLoaded', () => {
    it('changes loaded state', () => {
      ds.setLoaded(true);
      expect(ds.isLoaded).toBe(true);
      ds.setLoaded(false);
      expect(ds.isLoaded).toBe(false);
    });
  });

  describe('clear', () => {
    it('resets all collections and isLoaded', () => {
      ds.loadUsers({ type: 'users', items: [makeUser('u1', 'Alice')] });
      ds.loadMinisDeviceDefs({ type: 'device_defs', deviceDefs: [makeDeviceDef('dd1', 'Light')] });
      ds.setLoaded(true);

      ds.clear();
      expect(ds.users).toEqual([]);
      expect(ds.minisDeviceDefs).toEqual([]);
      expect(ds.isLoaded).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns correct counts', () => {
      ds.loadUsers({ type: 'users', items: [makeUser('u1', 'Alice'), makeUser('u2', 'Bob')] });
      ds.loadMinisDeviceDefs({ type: 'device_defs', deviceDefs: [makeDeviceDef('dd1', 'Light')] });
      const stats = ds.getStats();
      expect(stats.users).toBe(2);
      expect(stats.minisDeviceDefs).toBe(1);
      expect(stats.persons).toBe(0);
      expect(stats.tasks).toBe(0);
    });
  });
});
