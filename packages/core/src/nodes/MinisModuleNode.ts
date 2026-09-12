import { NodeBase } from './NodeBase';
import { MinisModuleModel } from '../models/MinisModuleModel';

export class MinisModuleNode extends NodeBase<MinisModuleModel> {
  readonly type = 'module' as const;
  id: string;
  moduleDefId: string;
  sn: string;

  constructor(model: MinisModuleModel) {
    super();
    this.id = model.id;
    this.moduleDefId = model.moduleDefId;
    this.sn = model.sn;
  }

  static fromModel(model: MinisModuleModel): MinisModuleNode { return new MinisModuleNode(model); }
  static fromModels(models: MinisModuleModel[]): MinisModuleNode[] { return models.map(m => new MinisModuleNode(m)); }

  getDisplayName(): string {
    return `${this.moduleDefId} (${this.sn})`;
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    return (
      this.moduleDefId.toLowerCase().includes(q) ||
      this.sn.toLowerCase().includes(q)
    );
  }

  toModel(): MinisModuleModel {
    return {
      type: 'module',
      id: this.id,
      moduleDefId: this.moduleDefId,
      sn: this.sn,
    };
  }

  clone(): MinisModuleNode {
    return this.copyBaseStateTo(new MinisModuleNode(this.toModel()));
  }
}
