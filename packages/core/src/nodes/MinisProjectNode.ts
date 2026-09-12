import { NodeBase } from './NodeBase';
import { MinisProjectModel } from '../models/MinisProjectModel';

export class MinisProjectNode extends NodeBase<MinisProjectModel> {
  readonly type = 'minis_project' as const;
  id: string;
  name: string;
  githubProjectId: string;
  softwarePlatform: string;
  moduleId?: string;
  boardProfileKey?: string;

  constructor(model: MinisProjectModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.githubProjectId = model.githubProjectId;
    this.softwarePlatform = model.softwarePlatform;
    this.moduleId = model.moduleId;
    this.boardProfileKey = model.boardProfileKey;
  }

  static fromModel(model: MinisProjectModel): MinisProjectNode { return new MinisProjectNode(model); }
  static fromModels(models: MinisProjectModel[]): MinisProjectNode[] { return models.map(m => new MinisProjectNode(m)); }

  getDisplayName(): string {
    return this.name;
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(q) ||
      this.githubProjectId.toLowerCase().includes(q)
    );
  }

  toModel(): MinisProjectModel {
    return {
      type: 'minis_project',
      id: this.id,
      name: this.name,
      githubProjectId: this.githubProjectId,
      softwarePlatform: this.softwarePlatform,
      moduleId: this.moduleId,
      boardProfileKey: this.boardProfileKey,
    };
  }

  clone(): MinisProjectNode {
    return this.copyBaseStateTo(new MinisProjectNode(this.toModel()));
  }
}
