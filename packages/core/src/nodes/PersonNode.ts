import { NodeBase } from './NodeBase';
import { PersonModel } from '../models/PersonModel';

/**
 * PersonNode extends PersonModel with UI state and utility functions
 */
export class PersonNode extends NodeBase<PersonModel> {
  readonly type = 'person' as const;
  id: string;
  nick: string;
  firstName?: string;
  secondName?: string;
  description?: string;

  constructor(model: PersonModel) {
    super();
    this.id = model.id;
    this.nick = model.nick;
    this.firstName = model.firstName;
    this.secondName = model.secondName;
    this.description = model.description;
  }

  static fromModel(model: PersonModel): PersonNode { return new PersonNode(model); }
  static fromModels(models: PersonModel[]): PersonNode[] { return models.map(m => new PersonNode(m)); }

  // Display name - prefer full name, fallback to nick
  getDisplayName(): string {
    if (this.firstName || this.secondName) {
      return [this.firstName, this.secondName].filter(Boolean).join(' ');
    }
    return this.nick;
  }

  // Get full name if available
  getFullName(): string | null {
    if (this.firstName && this.secondName) {
      return `${this.firstName} ${this.secondName}`;
    }
    if (this.firstName) return this.firstName;
    if (this.secondName) return this.secondName;
    return null;
  }

  // Get initials for avatar display
  getInitials(): string {
    if (this.firstName && this.secondName) {
      return `${this.firstName[0]}${this.secondName[0]}`.toUpperCase();
    }
    if (this.firstName) {
      return this.firstName.substring(0, 2).toUpperCase();
    }
    return this.nick.substring(0, 2).toUpperCase();
  }

  // Check if person has full name set
  hasFullName(): boolean {
    return !!(this.firstName || this.secondName);
  }

  // Search helper - matches query against all text fields
  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.id.toLowerCase().includes(lowerQuery) ||
      this.nick.toLowerCase().includes(lowerQuery) ||
      (this.firstName?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.secondName?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  // Update from another model
  updateFrom(model: PersonModel): this {
    this.nick = model.nick;
    this.firstName = model.firstName;
    this.secondName = model.secondName;
    this.description = model.description;
    this.markDirty();
    return this;
  }

  // Convert back to plain model
  toModel(): PersonModel {
    return {
      type: 'person',
      id: this.id,
      nick: this.nick,
      firstName: this.firstName,
      secondName: this.secondName,
      description: this.description,
    };
  }

  clone(): PersonNode {
    return this.copyBaseStateTo(new PersonNode(this.toModel()));
  }

  // Compare with another person
  equals(other: PersonNode | PersonModel): boolean {
    return this.id === other.id;
  }
}
