/**
 * Flow model - a complete automation (graph of nodes and edges)
 */

import { AutomateNodeModel } from './AutomateNodeModel';
import { AutomateEdgeModel } from './AutomateEdgeModel';

export interface AutomateVariableDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: unknown;
  description?: string;
}

export interface AutomateFlowModel {
  type: 'automate_flow';
  id: string;
  name: string;
  description?: string;
  version: string;
  runtime?: 'client' | 'backend' | 'universal';
  nodes: AutomateNodeModel[];
  edges: AutomateEdgeModel[];
  variables?: AutomateVariableDefinition[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface AutomateFlowsModel {
  type: 'automate_flows';
  flows: AutomateFlowModel[];
}

export function createFlow(id: string, name: string): AutomateFlowModel {
  return {
    type: 'automate_flow',
    id,
    name,
    version: '1.0',
    nodes: [],
    edges: [],
    variables: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createFlowsCollection(flows: AutomateFlowModel[] = []): AutomateFlowsModel {
  return {
    type: 'automate_flows',
    flows,
  };
}
