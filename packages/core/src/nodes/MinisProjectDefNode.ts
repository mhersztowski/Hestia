import { NodeBase } from './NodeBase';
import { MinisProjectDefModel } from '../models/MinisProjectDefModel';

export class MinisProjectDefNode extends NodeBase<MinisProjectDefModel> {
  readonly type = 'project_def' as const;
  id: string;
  name: string;
  version: string;
  deviceDefId: string;
  moduleDefId: string;
  softwarePlatform: string;
  blocklyDef: string;

  constructor(model: MinisProjectDefModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.version = model.version;
    this.deviceDefId = model.deviceDefId;
    this.moduleDefId = model.moduleDefId;
    this.softwarePlatform = model.softwarePlatform;
    this.blocklyDef = model.blocklyDef;
  }

  static fromModel(model: MinisProjectDefModel): MinisProjectDefNode { return new MinisProjectDefNode(model); }
  static fromModels(models: MinisProjectDefModel[]): MinisProjectDefNode[] { return models.map(m => new MinisProjectDefNode(m)); }

  getDisplayName(): string {
    return `${this.name} v${this.version}`;
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(q) ||
      this.moduleDefId.toLowerCase().includes(q) ||
      this.softwarePlatform.toLowerCase().includes(q)
    );
  }

  toModel(): MinisProjectDefModel {
    return {
      type: 'project_def',
      id: this.id,
      name: this.name,
      version: this.version,
      deviceDefId: this.deviceDefId,
      moduleDefId: this.moduleDefId,
      softwarePlatform: this.softwarePlatform,
      blocklyDef: this.blocklyDef,
    };
  }

  clone(): MinisProjectDefNode {
    return this.copyBaseStateTo(new MinisProjectDefNode(this.toModel()));
  }
}
