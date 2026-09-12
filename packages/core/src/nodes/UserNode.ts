import { NodeBase } from './NodeBase';
import { UserModel } from '../models/UserModel';

export class UserNode extends NodeBase<UserModel> {
  readonly type = 'user' as const;
  id: string;
  name: string;
  password: string;
  isAdmin: boolean;
  roles: string[];

  constructor(model: UserModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.password = model.password;
    this.isAdmin = model.isAdmin;
    this.roles = [...model.roles];
  }

  static fromModel(model: UserModel): UserNode { return new UserNode(model); }
  static fromModels(models: UserModel[]): UserNode[] { return models.map(m => new UserNode(m)); }

  getDisplayName(): string {
    return this.name;
  }

  hasRole(role: string): boolean {
    return this.roles.includes(role);
  }

  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.id.toLowerCase().includes(lowerQuery) ||
      this.name.toLowerCase().includes(lowerQuery) ||
      this.roles.some(r => r.toLowerCase().includes(lowerQuery))
    );
  }

  updateFrom(model: UserModel): this {
    this.name = model.name;
    this.password = model.password;
    this.isAdmin = model.isAdmin;
    this.roles = [...model.roles];
    this.markDirty();
    return this;
  }

  toModel(): UserModel {
    return {
      type: 'user',
      id: this.id,
      name: this.name,
      password: this.password,
      isAdmin: this.isAdmin,
      roles: [...this.roles],
    };
  }

  clone(): UserNode {
    return this.copyBaseStateTo(new UserNode(this.toModel()));
  }

  equals(other: UserNode | UserModel): boolean {
    return this.id === other.id;
  }
}
