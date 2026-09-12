export interface MinisModuleModel {
  type: 'module';
  id: string;
  moduleDefId: string;
  sn: string;
}

export interface MinisModulesModel {
  type: 'modules';
  modules: MinisModuleModel[];
}
