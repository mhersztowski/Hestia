import { describe, it, expect } from 'vitest';
import {
  createFlow,
  createFlowsCollection,
  createNode,
  NODE_RUNTIME_MAP,
  type AutomateNodeType,
} from './index';

describe('automate models', () => {
  describe('createFlow', () => {
    it('creates a flow with sensible defaults', () => {
      const flow = createFlow('f1', 'My Flow');
      expect(flow.type).toBe('automate_flow');
      expect(flow.id).toBe('f1');
      expect(flow.name).toBe('My Flow');
      expect(flow.version).toBe('1.0');
      expect(flow.nodes).toEqual([]);
      expect(flow.edges).toEqual([]);
      expect(flow.variables).toEqual([]);
      expect(flow.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('sets createdAt/updatedAt to valid ISO strings', () => {
      const flow = createFlow('f1', 'F');
      expect(() => new Date(flow.createdAt!).toISOString()).not.toThrow();
      expect(new Date(flow.createdAt!).toString()).not.toBe('Invalid Date');
      expect(new Date(flow.updatedAt!).toString()).not.toBe('Invalid Date');
    });
  });

  describe('createFlowsCollection', () => {
    it('defaults to an empty collection', () => {
      const coll = createFlowsCollection();
      expect(coll.type).toBe('automate_flows');
      expect(coll.flows).toEqual([]);
    });

    it('wraps provided flows', () => {
      const f = createFlow('f1', 'F');
      const coll = createFlowsCollection([f]);
      expect(coll.flows).toHaveLength(1);
      expect(coll.flows[0]).toBe(f);
    });
  });

  describe('createNode', () => {
    it('creates a node with required fields and empty config default', () => {
      const node = createNode('n1', 'log', 'Log Node', { x: 10, y: 20 }, [], []);
      expect(node.type).toBe('automate_node');
      expect(node.id).toBe('n1');
      expect(node.nodeType).toBe('log');
      expect(node.name).toBe('Log Node');
      expect(node.position).toEqual({ x: 10, y: 20 });
      expect(node.inputs).toEqual([]);
      expect(node.outputs).toEqual([]);
      expect(node.config).toEqual({});
    });

    it('keeps provided ports and config', () => {
      const input = { id: 'in', name: 'in', direction: 'input' as const, dataType: 'flow' as const };
      const output = { id: 'out', name: 'out', direction: 'output' as const, dataType: 'flow' as const };
      const node = createNode('n2', 'if_else', 'Cond', { x: 0, y: 0 }, [input], [output], { expr: 'x > 1' });
      expect(node.inputs).toEqual([input]);
      expect(node.outputs).toEqual([output]);
      expect(node.config).toEqual({ expr: 'x > 1' });
    });
  });

  describe('NODE_RUNTIME_MAP', () => {
    it('marks device-only nodes as client runtime', () => {
      expect(NODE_RUNTIME_MAP.notification).toBe('client');
      expect(NODE_RUNTIME_MAP.tts).toBe('client');
      expect(NODE_RUNTIME_MAP.stt).toBe('client');
    });

    it('marks trigger nodes needing a server as backend', () => {
      expect(NODE_RUNTIME_MAP.webhook_trigger).toBe('backend');
      expect(NODE_RUNTIME_MAP.schedule_trigger).toBe('backend');
    });

    it('marks pure-logic nodes as universal', () => {
      expect(NODE_RUNTIME_MAP.if_else).toBe('universal');
      expect(NODE_RUNTIME_MAP.js_execute).toBe('universal');
      expect(NODE_RUNTIME_MAP.start).toBe('universal');
    });

    it('has a runtime for every node type it references', () => {
      const types = Object.keys(NODE_RUNTIME_MAP) as AutomateNodeType[];
      for (const t of types) {
        expect(['client', 'backend', 'universal']).toContain(NODE_RUNTIME_MAP[t]);
      }
    });
  });
});
