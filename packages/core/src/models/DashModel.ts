// DashModel — data model of the dash editor scene (*.dash.json) from Drive.
//
// Definitions of scene blocks (nodes): DashObject (generic / group / qt-widget),
// Var, FunctionCall, ClassObj, GetProp, SetProp + connections (FcEdge) and the
// whole scene (DashScene). Framework-agnostic (no React) — shared models.
//
// Note: NodeData (React Flow node prop data, with callbacks) does NOT belong
// here — those are view-layer types and stay in the editor component.

/** Value of a block field/property (recursive JSON). */
export type DashValue = string | number | boolean | null | DashValue[] | { [k: string]: DashValue };

/** Entity field type (mapped to an editing widget in Properties). */
export type QFieldType =
  | 'QIcon'
  | 'QImage'
  | 'QString'
  | 'QNumber'
  | 'QArray'
  | 'QMap'
  | 'QObjectRef'
  | 'QChildsObjectRef'
  | 'QFilePath';

/** Value of a QObjectRef field — a reference to an object in another file. */
export interface QObjectRefValue {
  filePath: string;
  objectPath: string;
  [k: string]: DashValue;
}

/** Entity field definition (name + type as text). */
export interface FieldDef {
  name: string;
  type: string;
}

/** Base transform — every DashObject has one (like QWidget geometry in Qt). */
export interface DashTransform {
  x: number;
  y: number;
  rot: number;
  scale: number;
  width: number;
  height: number;
}

/** The main scene block: entity / group / Qt widget. */
export interface DashObject {
  id: string;
  className: string;
  objectName: string;
  transform: DashTransform;
  customFields?: FieldDef[];
  properties: Record<string, DashValue>;
  showPins?: boolean;
  showDetails?: boolean;
  showHeader?: boolean;
  zIndex?: number;
  /** 'group' renders a container that moves its children; 'qt-widget' is a MinisQt widget
   *  (core/browser/qt) — `className` holds the widget type (e.g. 'QPushButton'). */
  kind?: 'group' | 'qt-widget' | 'shape';
  /** Id of the group/parent (children tracked through parentId). */
  parentId?: string;
  /** Qt signal connections (signal name → handler from the data source). */
  signalHandlers?: Record<string, { sourceId: string; symbolPath: string }>;
}

/** A flat function entry from the data source (to pick as a signal handler). */
export interface HandlerFn {
  sourceId: string;
  sourceName: string;
  fileType: DataSourceEntry['fileType'];
  symbolPath: string;
  params: string; // raw parameter text (with types for TS)
  paramCount: number;
  lang?: 'python';
}

/** Used only when parsing older scenes (x/y without a transform). */
export type LegacyDashObject = Omit<DashObject, 'transform'> & {
  transform?: DashTransform;
  x?: number;
  y?: number;
};

/** A data source (file with functions/classes/JSON) attached to the scene. */
export interface DataSourceEntry {
  id: string;
  name: string;
  filePath: string;
  fileType: 'json' | 'js' | 'python' | 'ts' | 'pdf' | 'djvu' | 'dash';
}

/** A block calling a function from the data source. */
export interface FunctionCallObject {
  id: string;
  sourceId: string; // DataSourceEntry.id
  symbolPath: string; // e.g. "ClassName.methodName" or "functionName"
  paramNames: string[];
  argOverrides: Record<number, string>; // manual argument values, when no Var is wired in
  result: string | null; // JSON-serialized last result
  error: string | null;
  x: number;
  y: number;
  pinsFlipped?: boolean; // true: argument pins on the right, return on the right
  /** 'python' → run the function through Pyodide (the source is a .py file). */
  lang?: 'python';
  /** Id of the group the block belongs to (grouping in the SCENE tree). */
  parentId?: string;
}

/** A variable block (Var). */
export interface VarObject {
  id: string;
  varName: string;
  varValue: string | null; // JSON-serialized value
  x: number;
  y: number;
  pinsFlipped?: boolean; // true: both pins on the right
  parentId?: string;
  /** true: hide the "Set var value" editor on the canvas (the block shows only name/pins). */
  hideValue?: boolean;
}

/** A connection (edge) between blocks. */
export interface FcEdge {
  id: string;
  source: string;
  sourceHandle: string; // 'return' on FunctionCall, 'value_out' on Var, 'get_X'/'instance_out' on ClassObj
  target: string;
  targetHandle: string; // 'arg_N'/'this' on FunctionCall, 'value_in' on Var, 'set_X'/'instance_in' on ClassObj
}

/** A class instance block (ClassObj). */
export interface ClassObjItem {
  id: string;
  sourceId: string;
  className: string;
  fieldNames: string[]; // ordered list of fields/getters
  instanceValue: string | null; // JSON-serialized current instance
  x: number;
  y: number;
  pinsFlipped?: boolean; // true: SET pins on the right, GET on the left
  parentId?: string;
}

/** A property read block (GetProp). */
export interface GetPropObject {
  id: string;
  propNameOverride: string; // inline fallback, when propname_in is not wired in
  result: string | null;
  error: string | null;
  x: number;
  y: number;
  parentId?: string;
}

/** A property write block (SetProp). */
export interface SetPropObject {
  id: string;
  propNameOverride: string;
  result: string | null;
  error: string | null;
  x: number;
  y: number;
  parentId?: string;
}

/** Built-in sandbox libraries (unified with Markdown automation). */
export interface DashLibs {
  three?: boolean;
  lit?: boolean;
}

/** The scene's Python (Pyodide) environment config. Structurally matches
 *  PyodideConfig from the web layer (mycastle-web) — core does not depend on web. */
export interface DashPyodideConfig {
  enabled: boolean;
  packages: string[];
  pypi: string[];
}

/** Canvas VIEW settings (grid / origin 0,0 / rulers / display grid).
 *  Saved in the scene (*.dash.json) → persisted in the backend VFS with it. */
export interface DashViewSettings {
  /** Helper grid. */
  grid?: boolean;
  /** Grid spacing in scene units (px). */
  gridSpacing?: number;
  /** Crosshair at the origin (0,0). */
  origin?: boolean;
  /** Rulers along the top and left edges. */
  rulers?: boolean;
  /** Display grid — heavier rectangles at the real screen size. */
  display?: {
    enabled?: boolean;
    /** Real display width in scene units (e.g. 800). */
    width?: number;
    /** Real display height (e.g. 480). */
    height?: number;
  };
}

/** The whole dash editor scene (*.dash.json). */
export interface DashScene {
  type: 'dash-scene';
  /** 1 = global transforms (legacy); 2 = transforms local to the parent (parentId). */
  version: 1 | 2;
  umlProjectPath?: string;
  umlSources?: Array<{ id: string; path: string }>;
  dataSources?: DataSourceEntry[];
  functionCalls?: FunctionCallObject[];
  vars?: VarObject[];
  classObjs?: ClassObjItem[];
  getProps?: GetPropObject[];
  setProps?: SetPropObject[];
  fcEdges?: FcEdge[];
  objects: DashObject[];
  /** Built-in libraries enabled for this dashboard's sandbox (Three.js / Lit). */
  libs?: DashLibs;
  /** Python environment (Pyodide) — run alongside in a Web Worker when enabled. */
  pyodide?: DashPyodideConfig;
  /** Canvas view settings (grid / 0,0 / rulers / display grid). */
  view?: DashViewSettings;
}

/** A UML class member (field/method) — used when importing UML into a scene. */
export interface UmlMember {
  id: string;
  kind: 'field' | 'method';
  text: string;
}

/** A UML class definition (name + kind + fields) used to create entities. */
export interface UmlClassDef {
  name: string;
  kind: 'class' | 'abstract' | 'interface' | 'enum';
  fields: FieldDef[];
}

/** A UML source (`.umlproj.json` file) with a list of classes. */
export interface UmlSource {
  id: string;
  path: string;
  name: string;
  classes: UmlClassDef[];
}
