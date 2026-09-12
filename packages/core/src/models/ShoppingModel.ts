export interface ShoppingItemModel {
    type: "shopping_item";
    id: string;
    name: string;
    quantity?: number;
    unit?: string;
    category?: string;
    estimatedPrice?: number;
    actualPrice?: number;
    checked: boolean;
    note?: string;
    assignedPersonId?: string;
}

export interface ShoppingListModel {
    type: "shopping_list";
    id: string;
    name: string;
    description?: string;
    store?: string;
    status: "active" | "completed" | "archived";
    createdAt: string;
    completedAt?: string;
    budget?: number;
    items: ShoppingItemModel[];
}

export interface ShoppingListsModel {
    type: "shopping_lists";
    lists: ShoppingListModel[];
    categories?: string[];
    units?: string[];
    favoriteItems?: string[];
}
