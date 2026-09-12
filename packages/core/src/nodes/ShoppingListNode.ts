import { NodeBase } from './NodeBase';
import { ShoppingListModel, ShoppingItemModel } from '../models/ShoppingModel';

/**
 * ShoppingListNode extends ShoppingListModel with UI state and utility functions
 */
export class ShoppingListNode extends NodeBase<ShoppingListModel> {
  readonly type = 'shopping_list' as const;
  id: string;
  name: string;
  description?: string;
  store?: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  completedAt?: string;
  budget?: number;
  items: ShoppingItemModel[];

  constructor(model: ShoppingListModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.description = model.description;
    this.store = model.store;
    this.status = model.status;
    this.createdAt = model.createdAt;
    this.completedAt = model.completedAt;
    this.budget = model.budget;
    this.items = model.items || [];
  }

  static fromModel(model: ShoppingListModel): ShoppingListNode { return new ShoppingListNode(model); }
  static fromModels(models: ShoppingListModel[]): ShoppingListNode[] { return models.map(m => new ShoppingListNode(m)); }

  // Display
  getDisplayName(): string {
    return this.name;
  }

  // Status checks
  isActive(): boolean {
    return this.status === 'active';
  }

  isCompleted(): boolean {
    return this.status === 'completed';
  }

  isArchived(): boolean {
    return this.status === 'archived';
  }

  // Item queries
  getCheckedItems(): ShoppingItemModel[] {
    return this.items.filter(i => i.checked);
  }

  getUncheckedItems(): ShoppingItemModel[] {
    return this.items.filter(i => !i.checked);
  }

  getItemById(id: string): ShoppingItemModel | undefined {
    return this.items.find(i => i.id === id);
  }

  getItemsByCategory(category: string): ShoppingItemModel[] {
    return this.items.filter(i => i.category === category);
  }

  getItemsByPerson(personId: string): ShoppingItemModel[] {
    return this.items.filter(i => i.assignedPersonId === personId);
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    for (const item of this.items) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats).sort();
  }

  getItemsGroupedByCategory(): Map<string, ShoppingItemModel[]> {
    const groups = new Map<string, ShoppingItemModel[]>();
    for (const item of this.items) {
      const cat = item.category || 'inne';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return groups;
  }

  // Progress
  getProgress(): number {
    if (this.items.length === 0) return 0;
    return Math.round((this.getCheckedItems().length / this.items.length) * 100);
  }

  getProgressText(): string {
    return `${this.getCheckedItems().length}/${this.items.length}`;
  }

  // Budget
  getEstimatedTotal(): number {
    return this.items.reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);
  }

  getActualTotal(): number {
    return this.items
      .filter(i => i.checked)
      .reduce((sum, i) => sum + (i.actualPrice || i.estimatedPrice || 0), 0);
  }

  getBudgetStatus(): 'under' | 'over' | 'on_track' | 'no_budget' {
    if (this.budget === undefined || this.budget <= 0) return 'no_budget';
    const actual = this.getActualTotal();
    const estimated = this.getEstimatedTotal();
    if (actual > this.budget) return 'over';
    if (estimated > this.budget) return 'over';
    return 'on_track';
  }

  getEstimatedTotalFormatted(currency: string = 'PLN'): string {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
    }).format(this.getEstimatedTotal());
  }

  getActualTotalFormatted(currency: string = 'PLN'): string {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
    }).format(this.getActualTotal());
  }

  getBudgetFormatted(currency: string = 'PLN'): string | null {
    if (this.budget === undefined) return null;
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
    }).format(this.budget);
  }

  // Search
  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(lowerQuery) ||
      (this.store?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false) ||
      this.items.some(i => i.name.toLowerCase().includes(lowerQuery))
    );
  }

  // Update from model
  updateFrom(model: ShoppingListModel): this {
    this.name = model.name;
    this.description = model.description;
    this.store = model.store;
    this.status = model.status;
    this.createdAt = model.createdAt;
    this.completedAt = model.completedAt;
    this.budget = model.budget;
    this.items = model.items || [];
    this.markDirty();
    return this;
  }

  // Convert back to model
  toModel(): ShoppingListModel {
    return {
      type: 'shopping_list',
      id: this.id,
      name: this.name,
      description: this.description,
      store: this.store,
      status: this.status,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      budget: this.budget,
      items: this.items,
    };
  }

  clone(): ShoppingListNode {
    return this.copyBaseStateTo(new ShoppingListNode(this.toModel()));
  }

  // Compare
  equals(other: ShoppingListNode | ShoppingListModel): boolean {
    return this.id === other.id;
  }
}
