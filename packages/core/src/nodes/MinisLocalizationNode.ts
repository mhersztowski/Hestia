import { NodeBase } from './NodeBase';
import { MinisLocalizationModel } from '../models/MinisLocalizationModel';

export class MinisLocalizationNode extends NodeBase<MinisLocalizationModel> {
  readonly type = 'localization' as const;
  id: string;
  name: string;
  typ: 'place' | 'geo';
  place: string | null;
  geo: { lat: number; lon: number } | null;
  device: string;

  constructor(model: MinisLocalizationModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.typ = model.typ;
    this.place = model.place;
    this.geo = model.geo;
    this.device = model.device;
  }

  static fromModel(model: MinisLocalizationModel): MinisLocalizationNode { return new MinisLocalizationNode(model); }
  static fromModels(models: MinisLocalizationModel[]): MinisLocalizationNode[] { return models.map(m => new MinisLocalizationNode(m)); }

  getDisplayName(): string {
    return this.name;
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    return this.name.toLowerCase().includes(q) || this.device.toLowerCase().includes(q);
  }

  toModel(): MinisLocalizationModel {
    return {
      type: 'localization',
      id: this.id,
      name: this.name,
      typ: this.typ,
      place: this.place,
      geo: this.geo,
      device: this.device,
    };
  }

  clone(): MinisLocalizationNode {
    return this.copyBaseStateTo(new MinisLocalizationNode(this.toModel()));
  }
}
