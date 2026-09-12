/**
 * Node model - blok w grafie automatyzacji
 */

import { AutomatePortModel } from './AutomatePortModel';

export type AutomateNodeType =
  | 'start'
  | 'manual_trigger'
  | 'webhook_trigger'
  | 'schedule_trigger'
  | 'js_execute'
  | 'system_api'
  | 'if_else'
  | 'switch'
  | 'for_loop'
  | 'while_loop'
  | 'read_variable'
  | 'write_variable'
  | 'log'
  | 'notification'
  | 'llm_call'
  | 'tts'
  | 'stt'
  | 'comment'
  | 'call_flow'
  | 'rate_limit'
  | 'foreach'
  | 'merge';

export type AutomateNodeRuntime = 'client' | 'backend' | 'universal';

export interface AutomateNodePosition {
  x: number;
  y: number;
}

export interface AutomateNodeModel {
  type: 'automate_node';
  id: string;
  nodeType: AutomateNodeType;
  name: string;
  description?: string;
  position: AutomateNodePosition;
  width?: number;
  height?: number;
  inputs: AutomatePortModel[];
  outputs: AutomatePortModel[];
  config: Record<string, unknown>;
  script?: string;
  disabled?: boolean;
}

export const NODE_RUNTIME_MAP: Record<AutomateNodeType, AutomateNodeRuntime> = {
  start: 'universal',
  manual_trigger: 'universal',
  webhook_trigger: 'backend',
  schedule_trigger: 'backend',
  js_execute: 'universal',
  system_api: 'universal',
  if_else: 'universal',
  switch: 'universal',
  for_loop: 'universal',
  while_loop: 'universal',
  read_variable: 'universal',
  write_variable: 'universal',
  log: 'universal',
  notification: 'client',
  llm_call: 'universal',
  tts: 'client',
  stt: 'client',
  comment: 'universal',
  call_flow: 'universal',
  rate_limit: 'universal',
  foreach: 'universal',
  merge: 'universal',
};

export function createNode(
  id: string,
  nodeType: AutomateNodeType,
  name: string,
  position: AutomateNodePosition,
  inputs: AutomatePortModel[],
  outputs: AutomatePortModel[],
  config: Record<string, unknown> = {},
): AutomateNodeModel {
  return {
    type: 'automate_node',
    id,
    nodeType,
    name,
    position,
    inputs,
    outputs,
    config,
  };
}
