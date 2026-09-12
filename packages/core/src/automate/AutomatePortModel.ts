/**
 * Port model - a connection point on a node
 */

export type AutomatePortDataType = 'flow' | 'string' | 'number' | 'boolean' | 'object' | 'any' | 'error';

export type AutomatePortDirection = 'input' | 'output';

export interface AutomatePortModel {
  id: string;
  name: string;
  direction: AutomatePortDirection;
  dataType: AutomatePortDataType;
  required?: boolean;
  multiple?: boolean;
}

/**
 * Data passed through the error port
 */
export interface AutomateErrorData {
  message: string;
  stack?: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  timestamp: number;
  input?: unknown;
}
