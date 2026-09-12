import { NodeBase } from './NodeBase';
import { MinisDeviceDefModel } from '../models/MinisDeviceDefModel';

export class MinisDeviceDefNode extends NodeBase<MinisDeviceDefModel> {
  readonly type = 'device_def' as const;
  id: string;
  name: string;
  modules: string[];

  constructor(model: MinisDeviceDefModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.modules = [...model.modules];
  }

  static fromModel(model: MinisDeviceDefModel): MinisDeviceDefNode { return new MinisDeviceDefNode(model); }
  static fromModels(models: MinisDeviceDefModel[]): MinisDeviceDefNode[] { return models.map(m => new MinisDeviceDefNode(m)); }

  getDisplayName(): string {
    return this.name;
  }

  hasModule(moduleDefId: string): boolean {
    return this.modules.includes(moduleDefId);
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    return this.name.toLowerCase().includes(q);
  }

  toModel(): MinisDeviceDefModel {
    return {
      type: 'device_def',
      id: this.id,
      name: this.name,
      modules: [...this.modules],
    };
  }

  clone(): MinisDeviceDefNode {
    return this.copyBaseStateTo(new MinisDeviceDefNode(this.toModel()));
  }
}
