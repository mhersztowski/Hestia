/**
 * Language-agnostic intermediate representation (IR) of parsed source code.
 * Every language parser produces a {@link CodeModel}; everything downstream
 * (UML generation, diff/history, code generation) operates on this IR alone.
 */

export type Language = 'typescript' | 'javascript' | 'python' | 'c' | 'cpp';

export type SymbolKind = 'class' | 'interface' | 'enum' | 'struct' | 'module';
export type MemberKind = 'field' | 'method';
export type Visibility = 'public' | 'private' | 'protected' | 'package';

export const VISIBILITY_SIGIL: Record<Visibility, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
};

export interface CodeParam {
  name: string;
  type?: string;
}

/**
 * TSDoc/JSDoc documentation, extracted from the code and carried over into UML.
 *
 * It is kept broken down (description, parameters and return value separately)
 * rather than as a raw comment — that way the UML editor can show an argument's
 * description next to the argument, and the code generator can rebuild the
 * comment in the same shape.
 */
export interface DocMeta {
  /** The first paragraph — the sentence describing the element. */
  summary?: string;
  /** The rest of the description (`@remarks` or further paragraphs). */
  remarks?: string;
  /** Parameter descriptions by name (`@param name description`). */
  params?: Record<string, string>;
  /** Description of the return value (`@returns`). */
  returns?: string;
  /** Usage examples (`@example`) — each as a separate entry. */
  examples?: string[];
  /** The text of `@deprecated` (empty string = marked without a reason). */
  deprecated?: string;
  /** `@see` references. */
  see?: string[];
  /** Tags without content, e.g. `internal`, `experimental`. */
  tags?: string[];
}

export interface CodeMember {
  /** Stable within a symbol — matched across re-parses for diffing. */
  id: string;
  kind: MemberKind;
  name: string;
  visibility: Visibility;
  /** Field type, or method return type. */
  type?: string;
  /** Method parameters (undefined for fields). */
  params?: CodeParam[];
  isStatic?: boolean;
  isAbstract?: boolean;
  /** An `async` method — gets the "async" category on the diagram. */
  isAsync?: boolean;
  /** This member's TSDoc documentation (description, `@param`, `@returns`, …). */
  doc?: DocMeta;
  /** Pre-rendered UML line, e.g. `+ getId(): string`. */
  text: string;
}

export interface CodeSymbol {
  /** Stable id (qualified name) — survives re-parses, used by diff + layout. */
  id: string;
  kind: SymbolKind;
  name: string;
  /** User-root-relative source file the symbol was parsed from. */
  file: string;
  language: Language;
  isAbstract?: boolean;
  /** TSDoc documentation of the class/interface/module. */
  doc?: DocMeta;
  members: CodeMember[];
  /** Raw base-type names (resolved to relations by resolveRelations). */
  extends: string[];
  implements: string[];
}

export type RelationType =
  'generalization' | 'realization' | 'association' | 'composition' | 'dependency';

export interface CodeRelation {
  id: string;
  fromId: string;
  toId: string;
  type: RelationType;
  label?: string;
}

export interface CodeModel {
  symbols: CodeSymbol[];
  relations: CodeRelation[];
  files: string[];
}

export function emptyModel(): CodeModel {
  return { symbols: [], relations: [], files: [] };
}

/** Map a UML/source visibility into the leading sigil used in member text. */
export function sigil(v: Visibility): string {
  return VISIBILITY_SIGIL[v];
}
