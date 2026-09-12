export interface MinisProjectDefModel {
  type: 'project_def';
  id: string;
  name: string;
  version: string;
  deviceDefId: string;
  moduleDefId: string;
  softwarePlatform: string;
  blocklyDef: string;
}

export interface MinisProjectDefsModel {
  type: 'project_defs';
  projectDefs: MinisProjectDefModel[];
}
