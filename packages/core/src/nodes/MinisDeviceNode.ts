import { NodeBase } from './NodeBase';
import type { MinisDeviceModel, MinisDeviceBuild } from '../models/MinisDeviceModel';

export class MinisDeviceNode extends NodeBase<MinisDeviceModel> {
  readonly type = 'device' as const;
  id: string;
  name: string;
  deviceDefId: string;
  isAssembled: boolean;
  isIot: boolean;
  sn: string;
  description?: string;
  localizationId?: string;
  lastBuild?: MinisDeviceBuild;

  constructor(model: MinisDeviceModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.deviceDefId = model.deviceDefId;
    this.isAssembled = model.isAssembled;
    this.isIot = model.isIot;
    this.sn = model.sn;
    this.description = model.description;
    this.localizationId = model.localizationId;
    this.lastBuild = model.lastBuild;
  }

  static fromModel(model: MinisDeviceModel): MinisDeviceNode { return new MinisDeviceNode(model); }
  static fromModels(models: MinisDeviceModel[]): MinisDeviceNode[] { return models.map(m => new MinisDeviceNode(m)); }

  getDisplayName(): string {
    return this.name || this.sn || this.id;
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(q) ||
      this.deviceDefId.toLowerCase().includes(q) ||
      this.sn.toLowerCase().includes(q)
    );
  }

  toModel(): MinisDeviceModel {
    return {
      type: 'device',
      id: this.id,
      name: this.name,
      deviceDefId: this.deviceDefId,
      isAssembled: this.isAssembled,
      isIot: this.isIot,
      sn: this.sn,
      description: this.description,
      localizationId: this.localizationId,
      lastBuild: this.lastBuild,
    };
  }

  clone(): MinisDeviceNode {
    return this.copyBaseStateTo(new MinisDeviceNode(this.toModel()));
  }
}
