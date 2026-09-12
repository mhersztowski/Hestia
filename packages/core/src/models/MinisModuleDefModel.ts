export interface MinisModuleDefModel {
  type: 'module_def';
  id: string;
  name: string;
  isProgrammable: boolean;
  fqbn?: string;
  boardProfileKey?: string;
  arduinoOptions?: Record<string, string>;
}

export interface MinisModuleDefsModel {
  type: 'module_defs';
  moduleDefs: MinisModuleDefModel[];
}
