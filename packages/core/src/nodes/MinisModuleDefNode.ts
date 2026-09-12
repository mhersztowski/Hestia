import { NodeBase } from './NodeBase';
import { MinisModuleDefModel } from '../models/MinisModuleDefModel';

export class MinisModuleDefNode extends NodeBase<MinisModuleDefModel> {
  readonly type = 'module_def' as const;
  id: string;
  name: string;
  isProgrammable: boolean;

  constructor(model: MinisModuleDefModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.isProgrammable = model.isProgrammable;
  }

  static fromModel(model: MinisModuleDefModel): MinisModuleDefNode { return new MinisModuleDefNode(model); }
  static fromModels(models: MinisModuleDefModel[]): MinisModuleDefNode[] { return models.map(m => new MinisModuleDefNode(m)); }

  getDisplayName(): string {
    return this.name;
  }

  matches(query: string): boolean {
    return this.name.toLowerCase().includes(query.toLowerCase());
  }

  toModel(): MinisModuleDefModel {
    return {
      type: 'module_def',
      id: this.id,
      name: this.name,
      isProgrammable: this.isProgrammable,
    };
  }

  clone(): MinisModuleDefNode {
    return this.copyBaseStateTo(new MinisModuleDefNode(this.toModel()));
  }
}
