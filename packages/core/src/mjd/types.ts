export type MjdFieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array';

export type MjdViewType = 'form';

export interface MjdFieldDef {
  name: string;
  type: MjdFieldType;
  tags: string[];
  label?: string;
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
  /** Only for type='enum' */
  options?: string[];
  /** Only for type='array' */
  itemType?: MjdFieldType;
}

export interface MjdViewDef {
  name: string;
  type: MjdViewType;
  tag: string;
}

export interface MjdDocument {
  version: string;
  tags: string[];
  fields: MjdFieldDef[];
  views: MjdViewDef[];
}
