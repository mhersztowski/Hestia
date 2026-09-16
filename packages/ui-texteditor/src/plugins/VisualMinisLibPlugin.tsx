/**
 * VisualMinisLib Plugin
 *
 * Visual Signal-Slot graph for @hestia/core.
 * - Parses the active TS file for CoreObject subclasses, Signal<T>, Property<T>, Timer…
 * - Renders them as ReactFlow nodes; drag from signal port → slot port to connect.
 * - Clicking a node opens a Properties panel with editable constructor parameters.
 *   Changing a value patches the source code in the Monaco editor.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  createContext,
  useContext,
} from 'react';
import { createPortal } from 'react-dom';
import * as monaco from 'monaco-editor';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import CircularProgress from '@mui/material/CircularProgress';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import SettingsIcon from '@mui/icons-material/Settings';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DownloadIcon from '@mui/icons-material/Download';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import FolderIcon from '@mui/icons-material/Folder';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import Switch from '@mui/material/Switch';
import Slider from '@mui/material/Slider';
import InputAdornment from '@mui/material/InputAdornment';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { defineEditorPlugin, globalEventBus, globalPluginRegistry } from '../monaco';
import * as Blockly from 'blockly';
import {
  extractCallables,
  callExpression,
  importSpecifierFor,
  blockTypeFor,
  returnsValue,
  groupByCategory,
  extractTypes,
  hasDoc,
  docSections,
  type UmlCallable,
  type UmlProjectLike,
  type UmlType,
  type DocSection,
} from './umlCallables';
import { buildTypeOptions, insertImportLine, type TypeOption } from './sourceTypes';
import { defineDynArgsBlock } from './dynArgsBlock';
import {
  parseSignalArgs,
  buildSignalMember,
  buildPropertyMember,
  buildVariableMember,
  parseParamList,
  formatParamList,
  replaceFieldInCode,
  removeFieldFromCode,
  renameMemberInCode,
  hasFieldInCode,
  parseSignalPorts,
  type SignalArg,
} from './classMembers';
import { checkCallArgs, formatIssues, unwrapPromise } from './argTypeCheck';
import {
  DEFAULT_UML_SERVER,
  readUmlSource,
  writeUmlSource,
  umlEndpoint,
  describeUmlSource,
  loginForToken,
  normalizeBaseUrl,
  filterUmlEntries,
  base64ToUtf8,
  type UmlSourceConfig,
  type UmlSourceMode,
} from './umlSource';
// Side-effect import: registers Blockly's built-in block types
// (controls_if, math_number, lists_*, text_*, variables_*, procedures_*, …).
// Without this the toolbox tries to instantiate them and the flyout blanks
// out the moment the user clicks any standard category (Lists, Math, …).
import 'blockly/blocks';
import { javascriptGenerator, Order } from 'blockly/javascript';

/* ── Types ────────────────────────────────────────────────────────────────────*/

type EntityKind =
  | 'class'
  | 'instance'
  | 'signal'
  | 'property'
  | 'timer'
  | 'fsm'
  | 'bus'
  | 'commandstack'
  | 'listmodel'
  | 'logger';

interface SignalPort {
  name: string;
  type: string;
}
// SlotPort — parsed slot method. `params` and `body` are populated only
// when we walked a class definition (not for prototype/external entity kinds).
// They feed the "edit existing slot" flow; older code paths that only need
// `name` keep working because all extra fields are optional.
//   `state`: when the body carries a `// @blockly-state: <base64-json>` marker
//   we parse it back into the original Blockly workspace JSON so Edit Slot can
//   rehydrate the blocks the user built last time, instead of starting empty.
interface SlotPort {
  name: string;
  params?: SignalArg[];
  body?: string;
  state?: object | null;
}
// VarPort — plain class field `name: T = value;` (NOT wrapped in Property).
// Feeds the panel listing + Blockly get/set/call dropdowns inside slot editors.
interface VarPort {
  name: string;
  type: string;
  /** Literał inicjalizujący, np. `0` — panel edycji pokazuje go jako wartość domyślną. */ value?: string;
}

/** Schema for a single constructor parameter or class-level config field. */
interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  options?: string[];
  hint?: string;
  /** Index into the constructor argument list (for patching). */
  argIndex: number;
}

/**
 * UI control hint for a property panel.
 * If omitted, derived from the TS type ('boolean' → boolean toggle,
 * 'number' → numeric input, union of string literals → select, anything
 * else → plain text).
 */
type PropertyWidget =
  | 'text' // single-line string
  | 'multiline' // multi-line string (textarea)
  | 'csv' // comma-separated string with chip tokens
  | 'regex' // string with regex validation
  | 'number' // numeric input
  | 'slider' // numeric input with slider (uses min/max/step)
  | 'boolean' // switch
  | 'select' // dropdown (requires options)
  | 'dirpath' // string + VFS directory picker button
  | 'filepath' // string + VFS file picker button
  | 'pathOrDir' // string + picker that allows either a file or a directory
  | 'color' // string '#RRGGBB' or '#RRGGBBAA' with colour swatch picker
  | 'datetime'; // number (ms-since-epoch) with datetime picker

/**
 * Schema for an `Property<T>` editable from the node panel.
 *
 * - `name`         — property name as declared in the class.
 * - `type`         — TS type string (free-form, drives widget auto-detect).
 * - `widget`       — explicit UI control override.
 * - `default`      — source-code literal used when the user hasn't set it yet.
 * - `description`  — tooltip / hint shown under the field.
 * - `min/max/step` — numeric range for `slider` / `number`.
 * - `options`      — pick list for `select` (raw source-code literals, e.g. `"'asc'"`).
 * - `startPath`    — initial directory shown by the VFS picker.
 */
interface PropertyDef {
  name: string;
  type: string;
  widget?: PropertyWidget;
  default?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  startPath?: string;
}

interface MinisEntity {
  id: string;
  varName: string;
  label: string;
  kind: EntityKind;
  signals: SignalPort[];
  slots: SlotPort[];
  /** Plain (non-Property) class fields. Empty for non-class entity kinds. */
  variables?: VarPort[];
  /** Raw string constructor arguments as found in source, e.g. ["1000", "this"] */
  constructorArgs: string[];
  /** Parameter schema for this entity type. */
  paramDefs: ParamDef[];
  /** Property schema for this entity type (live-editable from the panel). */
  properties: PropertyDef[];
  /** Current property values parsed from `varName.propName.value = …` assignments. */
  propertyValues: Record<string, string>;
}

interface ParsedConnection {
  id: string;
  sourceVar: string;
  signalName: string | null;
  targetVar: string;
  slotName: string;
}

/* ── Parameter schemas ────────────────────────────────────────────────────────*/

const BUILTIN_PARAM_DEFS: Partial<Record<EntityKind | string, ParamDef[]>> = {
  timer: [
    {
      key: 'intervalMs',
      label: 'Interval (ms)',
      type: 'number',
      argIndex: 0,
      hint: 'milliseconds',
    },
  ],
  property: [{ key: 'initialValue', label: 'Initial value', type: 'string', argIndex: 0 }],
  commandstack: [
    { key: 'maxSize', label: 'Max stack size', type: 'number', argIndex: 0, hint: 'default: 100' },
  ],
  logger: [
    { key: 'category', label: 'Category', type: 'string', argIndex: 0 },
    {
      key: 'minLevel',
      label: 'Min level',
      type: 'select',
      argIndex: 2,
      options: ["'debug'", "'info'", "'warn'", "'error'"],
    },
  ],
};

/* ── Parser ───────────────────────────────────────────────────────────────────*/

const MINISLIB_BASE_KIND: Record<string, EntityKind> = {
  CoreObject: 'class',
  Node: 'class',
  Timer: 'timer',
  StateMachine: 'fsm',
  EventBus: 'bus',
  CommandStack: 'commandstack',
  ListModel: 'listmodel',
  Logger: 'logger',
};

/**
 * Built-in JS constructors and common standard-library types — never shown as
 * graph nodes even when they slip through as `new X(…)` in source.
 */
const JS_BUILTIN_CTORS = new Set([
  'Date',
  'RegExp',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Proxy',
  'Array',
  'Object',
  'Function',
  'Symbol',
  'ArrayBuffer',
  'DataView',
  'SharedArrayBuffer',
  'Uint8Array',
  'Uint16Array',
  'Uint32Array',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'URL',
  'URLSearchParams',
  'FormData',
  'Headers',
  'Request',
  'Response',
  'Blob',
  'File',
  'FileReader',
  'TextEncoder',
  'TextDecoder',
  'AbortController',
  'AbortSignal',
  'Event',
  'CustomEvent',
  'EventTarget',
]);

const NODE_BUILTIN_SIGNALS: SignalPort[] = [
  { name: 'childAdded', type: 'Node' },
  { name: 'childRemoved', type: 'Node' },
  { name: 'parentChanged', type: 'Node | null' },
];

const BUILTIN_SIGNALS: Record<EntityKind, SignalPort[]> = {
  class: [],
  instance: [],
  signal: [],
  property: [{ name: 'changed', type: 'T, T' }],
  timer: [{ name: 'timeout', type: '' }],
  fsm: [
    { name: 'stateChanged', type: 'State' },
    { name: 'transitionFailed', type: 'string' },
  ],
  bus: [],
  commandstack: [
    { name: 'changed', type: '' },
    { name: 'canUndoChanged', type: 'boolean' },
    { name: 'canRedoChanged', type: 'boolean' },
  ],
  listmodel: [
    { name: 'rowsInserted', type: 'number, number' },
    { name: 'rowsRemoved', type: 'number, number' },
    { name: 'modelReset', type: '' },
  ],
  logger: [{ name: 'logged', type: 'LogRecord' }],
};

function extractClassBody(code: string, searchStart: number): string {
  const braceIdx = code.indexOf('{', searchStart);
  if (braceIdx === -1) return '';
  let depth = 0,
    i = braceIdx;
  while (i < code.length) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  return code.slice(braceIdx + 1, i);
}

/** Extract the raw text between the outermost () of a call at `callStart`. */
function extractCallArgs(code: string, callStart: number): string[] {
  const parenIdx = code.indexOf('(', callStart);
  if (parenIdx === -1) return [];
  let depth = 0,
    i = parenIdx,
    end = parenIdx;
  while (i < code.length) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    i++;
  }
  const inner = code.slice(parenIdx + 1, end).trim();
  if (!inner) return [];
  // Split by top-level commas only
  const args: string[] = [];
  let cur = '',
    d = 0;
  for (const ch of inner) {
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') d++;
    else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') d--;
    if (ch === ',' && d === 0) {
      args.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

// TS control-flow keywords that look like `name(args) { … }` but are NOT
// class methods. Without this guard, `if (x) { … }` in a slot body would
// be parsed as a new slot named "if", and after an Update Slot the parser
// would render the body's control-flow statements as fake sibling slots.
const TS_BLOCK_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'return',
  'throw',
  'try',
  'catch',
  'finally',
  'with',
  'yield',
  'await',
  'break',
  'continue',
  'function',
]);

// Markers we embed in slot bodies to preserve the original Blockly workspace
// JSON across save/load cycles. The state is base64-encoded JSON living inside
// a single-line `//` comment — invisible to the running program, but lets us
// rehydrate the visual block layout exactly when the user re-opens Edit Slot.
const BLOCKLY_STATE_MARKER = '@blockly-state:';
const BLOCKLY_STATE_RE = /\/\/\s*@blockly-state:\s*([A-Za-z0-9+/=]+)\s*\n?/;

function encodeBlocklyState(state: object): string {
  // UTF-8 safe base64: TextEncoder → byte string → btoa
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function decodeBlocklyState(b64: string): object | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as object) : null;
  } catch {
    return null;
  }
}

function extractBlocklyState(slotBody: string): {
  state: object | null;
  bodyWithoutMarker: string;
} {
  const m = BLOCKLY_STATE_RE.exec(slotBody);
  if (!m) return { state: null, bodyWithoutMarker: slotBody };
  const state = decodeBlocklyState(m[1]);
  const bodyWithoutMarker = slotBody
    .replace(BLOCKLY_STATE_RE, '')
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '');
  return { state, bodyWithoutMarker };
}

/**
 * Plain class fields — `name: T = value;` — that are NOT wrapped in
 * Property/Signal/Timer. These are the "variable" members the user can read,
 * write and call methods on from inside slot Blockly editors.
 *
 * The regex deliberately requires a `:` between name and type so we don't
 * pick up generic assignments inside method bodies. It also requires that
 * the right-hand side does not start with `new Property` / `new Signal`
 * (those declarations get their own ports).
 */
function parseVariablePorts(body: string): VarPort[] {
  const vars: VarPort[] = [];
  // Walk the class body character-by-character tracking brace depth so we
  // only consider declarations at depth 0 (direct class members). A previous
  // implementation used a global regex and also matched `let x: number = 0`
  // inside method bodies, polluting the dropdown.
  const re =
    /(?:readonly\s+|public\s+|private\s+|protected\s+)?(\w+)\s*:\s*([\w<>[\]|,&.{}() ]+?)\s*=\s*([^;\n]+);/g;
  // Words that look like an identifier but are actually JS keywords for a
  // local declaration — skip the regex anchor when one of these immediately
  // precedes the match (the regex captures the next word).
  const localKeywords = new Set([
    'let',
    'const',
    'var',
    'return',
    'yield',
    'await',
    'throw',
    'new',
    'typeof',
    'in',
    'of',
    'instanceof',
    'delete',
  ]);
  const memberKeywords = new Set(['constructor', 'get', 'set', 'static', 'async', 'override']);
  const seen = new Set<string>();
  let depth = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '{') {
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      i++;
      continue;
    }
    if (depth !== 0) {
      i++;
      continue;
    }
    // At top level — try to anchor a member declaration here.
    re.lastIndex = i;
    const m = re.exec(body);
    if (!m || m.index !== i) {
      i++;
      continue;
    }
    const name = m[1];
    const type = m[2].trim();
    const init = m[3].trim();
    // Skip Signal/Property/Timer — they have their own dedicated ports.
    const skipInit =
      /^new\s+(Property|Signal|Timer|EventBus|StateMachine|Command|ListModel|Logger)\b/.test(init);
    // Look one word back to catch local-declaration forms (`let foo:`).
    // Inside a class body at depth 0, those should not appear — but better
    // safe than sorry if the source has nested top-level functions.
    const isLocalDecl = localKeywords.has(name) || memberKeywords.has(name);
    if (!skipInit && !isLocalDecl && !seen.has(name)) {
      seen.add(name);
      vars.push({ name, type, value: init });
    }
    i = re.lastIndex;
  }
  return vars;
}

function parseSlotPorts(body: string, signalNames: Set<string>): SlotPort[] {
  const slots: SlotPort[] = [];
  // Walk through `body` at the top level (depth 0). When we see a token that
  // looks like `name(args) { … }` *and* we're directly inside the class block
  // (not nested inside another method's `{ … }`), treat it as a slot method.
  // Nested matches (control-flow inside method bodies) are skipped — that's
  // the whole point of the depth check.
  const re = /(?:public\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*(?:void|Promise<[^>]*>|\w[\w<>]*))?\s*\{/g;
  let i = 0;
  let depth = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '{') {
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      i++;
      continue;
    }

    // Try to anchor a method match only at the top level.
    if (depth === 0) {
      re.lastIndex = i;
      const m = re.exec(body);
      if (m && m.index === i) {
        const name = m[1];
        const ok =
          !TS_BLOCK_KEYWORDS.has(name) &&
          name !== 'constructor' &&
          name !== 'get' &&
          name !== 'set' &&
          !name.startsWith('_') &&
          !signalNames.has(name);
        // Whether we accept it or not, jump past the opening `{` so the next
        // iteration walks the method body at depth 1 (and exits cleanly).
        const openIdx = m.index + m[0].length - 1;
        if (ok) {
          // Brace-count the body so we capture nested control flow correctly.
          let bd = 1;
          let j = openIdx + 1;
          while (j < body.length && bd > 0) {
            const k = body[j];
            if (k === '{') bd++;
            else if (k === '}') bd--;
            j++;
          }
          // Slot bywa wieloargumentowy — `Signal<[a, b]>` woła go z tyloma
          // wartościami, ile ma tupla, więc jeden parametr nie wystarcza.
          const params = parseParamList(m[2]);
          const rawBody = body
            .slice(openIdx + 1, j - 1)
            .replace(/^\n/, '')
            .replace(/\n\s*$/, '');
          // Strip the Blockly state marker out of `body` so the visible
          // "previous body" panel shows real code, not the base64 blob. Keep
          // it separately in `state` to feed back into Edit Slot.
          const { state, bodyWithoutMarker } = extractBlocklyState(rawBody);
          slots.push({ name, params, body: bodyWithoutMarker, state });
          i = j; // already past the closing brace
          continue;
        }
        // Rejected name (`if`, `for`, …) — just step into its block so its
        // body is treated as nested code, not a method.
        i = openIdx + 1;
        depth = 1;
        continue;
      }
    }
    i++;
  }
  return slots;
}

function hasMinislibImport(code: string): boolean {
  return /@hestia\/core/.test(code);
}

function parseMinisEntities(
  code: string,
  externalDefs: Map<string, ExternalClassDef> = new Map()
): {
  entities: MinisEntity[];
  connections: ParsedConnection[];
} {
  if (!hasMinislibImport(code)) return { entities: [], connections: [] };

  const entities: MinisEntity[] = [];
  let counter = 0;
  const nextId = () => `e${counter++}`;
  const knownClasses = new Map<string, EntityKind>(Object.entries(MINISLIB_BASE_KIND));

  // Seed knownClasses with externally discovered classes
  for (const [className, def] of externalDefs) knownClasses.set(className, def.kind);

  // Seed with classes imported from npm packages (not relative, not minislib itself).
  // This lets main.ts show instances like `new TemperatureSensor()` even without a manifest.
  // When a manifest loads, re-parse will replace these placeholder entries with full port info.
  for (const { packageName, names } of parseNpmImports(code)) {
    if (packageName === '@hestia/core') continue;
    for (const name of names) {
      if (!knownClasses.has(name)) knownClasses.set(name, 'instance');
    }
  }

  // 1. class X extends CoreObject / Timer / ...
  const classRe = /class\s+(\w+)\s+extends\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(code)) !== null) {
    const className = m[1],
      parent = m[2];
    const baseKind = knownClasses.get(parent);
    if (!baseKind) continue;
    knownClasses.set(className, 'class');

    const body = extractClassBody(code, m.index + m[0].length);
    const builtinSigs = parent === 'Node' ? NODE_BUILTIN_SIGNALS : BUILTIN_SIGNALS[baseKind];
    const signals = [...builtinSigs, ...parseSignalPorts(body)];
    const signalNameSet = new Set(signals.map((s) => s.name.split('.')[0]));
    const slots = parseSlotPorts(body, signalNameSet);
    const variables = parseVariablePorts(body);

    // Parse constructor params as ParamDefs from constructor signature
    const ctorMatch = /constructor\s*\(([^)]*)\)/.exec(body);
    const paramDefs: ParamDef[] = ctorMatch
      ? ctorMatch[1]
          .split(',')
          .map((p) => p.trim().replace(/^(private|public|protected|readonly)\s+/, ''))
          .filter(Boolean)
          .map((p, i) => {
            const [nameType] = p.split('=');
            const [name, rawType] = nameType.split(':').map((s) => s.trim());
            const type: ParamDef['type'] = rawType?.includes('number')
              ? 'number'
              : rawType?.includes('boolean')
                ? 'boolean'
                : 'string';
            return { key: name, label: name, type, argIndex: i };
          })
      : [];

    const localProps = parseLocalProperties(body);
    entities.push({
      id: nextId(),
      varName: className,
      label: className,
      kind: 'class',
      signals,
      slots,
      variables,
      constructorArgs: [],
      paramDefs,
      properties: localProps,
      propertyValues: {},
    });
  }

  // 2. const x = new ClassName<T>(...)
  const instanceRe =
    /(?:const|let|var)\s+(\w+)\s*(?::[^=\n;]+)?\s*=\s*(new\s+(\w+)\s*(?:<[^>]*>)?\s*\()/g;
  while ((m = instanceRe.exec(code)) !== null) {
    const varName = m[1],
      className = m[3];
    const callStart = m.index + m[1].length + code.slice(m.index).indexOf(m[2]);
    const constructorArgs = extractCallArgs(code, callStart);
    const propertyValues = parsePropertyValues(code, varName);

    if (className === 'Signal') {
      const tm = /new\s+Signal<([^>]*)>/.exec(code.slice(m.index, m.index + 100));
      entities.push({
        id: nextId(),
        varName,
        label: varName,
        kind: 'signal',
        signals: [{ name: 'emit', type: tm?.[1] ?? '' }],
        slots: [],
        constructorArgs,
        paramDefs: [],
        properties: [],
        propertyValues: {},
      });
      continue;
    }
    if (className === 'Property') {
      const tm = /new\s+Property<([^>]*)>/.exec(code.slice(m.index, m.index + 100));
      entities.push({
        id: nextId(),
        varName,
        label: varName,
        kind: 'property',
        signals: [{ name: 'changed', type: tm?.[1] ?? '' }],
        slots: [{ name: 'value' }],
        constructorArgs,
        paramDefs: BUILTIN_PARAM_DEFS['property'] ?? [],
        properties: [],
        propertyValues: {},
      });
      continue;
    }
    const builtinKind = MINISLIB_BASE_KIND[className];
    if (builtinKind) {
      // Timer constructor only accepts (parent?) — interval is set via .start().
      // Interval paramDefs apply only to Timer.create(ms, parent) handled below.
      const paramDefs = className === 'Timer' ? [] : (BUILTIN_PARAM_DEFS[builtinKind] ?? []);
      entities.push({
        id: nextId(),
        varName,
        label: `${varName}:${className}`,
        kind: builtinKind,
        signals: [...BUILTIN_SIGNALS[builtinKind]],
        slots: [],
        constructorArgs,
        paramDefs,
        properties: [],
        propertyValues: {},
      });
      continue;
    }
    if (knownClasses.has(className)) {
      // Check external manifest first, then fall back to in-file class definition
      const extDef = externalDefs.get(className);
      if (extDef) {
        // `kind: 'class'` in the manifest describes the class declaration —
        // an instance (`new X()`) must show up as `'instance'` so the renderer
        // picks PropertiesPanel (live Property editor) instead of
        // ClassBuilderPanel (signal/slot definition tool). Specialised kinds
        // (timer / property / fsm / …) are passed through as-is.
        const instanceKind: EntityKind = extDef.kind === 'class' ? 'instance' : extDef.kind;
        entities.push({
          id: nextId(),
          varName,
          label: `${varName}:${className}`,
          kind: instanceKind,
          signals: extDef.signals,
          slots: extDef.slots,
          constructorArgs,
          paramDefs: extDef.paramDefs,
          properties: extDef.properties,
          propertyValues,
        });
      } else {
        const proto = entities.find((e) => e.varName === className && e.kind === 'class');
        entities.push({
          id: nextId(),
          varName,
          label: `${varName}:${className}`,
          kind: 'instance',
          signals: proto?.signals ?? [],
          slots: proto?.slots ?? [],
          constructorArgs,
          paramDefs: proto?.paramDefs ?? [],
          properties: proto?.properties ?? [],
          propertyValues,
        });
      }
    } else if (/^[A-Z]/.test(className) && !JS_BUILTIN_CTORS.has(className)) {
      // Unknown class — neither imported, nor defined in the file, nor a
      // minislib builtin. Showing it as a placeholder lets the user spot the
      // missing import in the graph (instead of the node silently vanishing).
      // Empty signal/slot lists make it clear the editor doesn't know its
      // shape yet — the +Import dialog / + Import file workflow can backfill.
      entities.push({
        id: nextId(),
        varName,
        label: `${varName}:${className} (unknown)`,
        kind: 'instance',
        signals: [],
        slots: [],
        constructorArgs,
        paramDefs: [],
        properties: [],
        propertyValues,
      });
    }
  }

  // 3. Timer.create() / Timer.singleShot()
  const timerCreateRe = /(?:const|let|var)\s+(\w+)\s*=\s*(Timer\.(?:create|singleShot)\s*\()/g;
  while ((m = timerCreateRe.exec(code)) !== null) {
    const varName = m[1];
    if (entities.find((e) => e.varName === varName)) continue;
    const callStart = m.index + m[0].indexOf(m[2]);
    const constructorArgs = extractCallArgs(code, callStart);
    entities.push({
      id: nextId(),
      varName,
      label: `${varName}:Timer`,
      kind: 'timer',
      signals: [{ name: 'timeout', type: '' }],
      slots: [],
      constructorArgs,
      paramDefs: BUILTIN_PARAM_DEFS['timer'] ?? [],
      properties: [],
      propertyValues: {},
    });
  }

  // 4. Existing .connect() calls
  const connections: ParsedConnection[] = [];
  const connRe = /(\w+)(?:\.(\w+))?\.connect\s*\(\s*(\w+)(?:\.(\w+))?(?:\.bind\s*\([^)]*\))?\s*\)/g;
  while ((m = connRe.exec(code)) !== null) {
    const [, p1, p2, p3, p4] = m;
    if (p4)
      connections.push({
        id: `c${connections.length}`,
        sourceVar: p1,
        signalName: p2 ?? null,
        targetVar: p3,
        slotName: p4,
      });
    else if (p2)
      connections.push({
        id: `c${connections.length}`,
        sourceVar: p1,
        signalName: null,
        targetVar: p3,
        slotName: p2,
      });
  }

  return { entities, connections };
}

/* ── Code generation (signal → slot) ────────────────────────────────────────*/

function generateConnectCode(
  src: MinisEntity,
  signalHandle: string,
  tgt: MinisEntity,
  slotHandle: string
): string {
  const sourceExpr = src.kind === 'signal' ? src.varName : `${src.varName}.${signalHandle}`;
  let targetExpr: string;
  if (slotHandle === 'value' && tgt.kind === 'property')
    targetExpr = `(v) => { ${tgt.varName}.value = v; }`;
  else if (tgt.kind === 'instance' || tgt.kind === 'class')
    targetExpr = `${tgt.varName}.${slotHandle}.bind(${tgt.varName})`;
  else targetExpr = `${tgt.varName}.${slotHandle}`;
  return `${sourceExpr}.connect(${targetExpr});`;
}

/* ── Property helpers (widget auto-detect, value ↔ literal, code patch) ────*/

/**
 * Parse string-literal union types like `"'asc' | 'desc'"` or
 * `'a' | 'b' | 'c'` into `['asc', 'desc']` / `['a', 'b', 'c']`.
 * Returns null for non-union types.
 */
function parseStringUnionOptions(tsType: string): string[] | null {
  if (!tsType.includes('|') && !tsType.includes("'")) return null;
  const parts = tsType.split('|').map((s) => s.trim());
  const opts: string[] = [];
  for (const p of parts) {
    const m = p.match(/^['"](.*?)['"]$/);
    if (!m) return null;
    opts.push(m[1]);
  }
  return opts.length >= 2 ? opts : null;
}

/** Pick a sensible default widget from the declared TS type. */
function deriveWidget(prop: PropertyDef): PropertyWidget {
  if (prop.widget) return prop.widget;
  const t = prop.type.trim();
  if (t === 'boolean') return 'boolean';
  if (t === 'number') return 'number';
  if (parseStringUnionOptions(t)) return 'select';
  return 'text';
}

/** Effective option list — explicit `options` wins, otherwise parse from TS union type. */
function effectiveOptions(prop: PropertyDef): string[] {
  if (prop.options && prop.options.length > 0) {
    // Manifest options may be either raw literals ("'asc'") or plain strings ("asc").
    return prop.options.map((o) => o.replace(/^['"](.*)['"]$/, '$1'));
  }
  return parseStringUnionOptions(prop.type) ?? [];
}

/** Convert a TS source-code literal back to a plain JS value for the UI. */
function literalToValue(
  widget: PropertyWidget,
  literal: string | undefined
): string | number | boolean {
  if (literal === undefined || literal === null) {
    if (widget === 'boolean') return false;
    if (widget === 'number' || widget === 'slider' || widget === 'datetime') return 0;
    return '';
  }
  const t = literal.trim().replace(/;$/, '').trim();
  if (widget === 'boolean') return t === 'true';
  if (widget === 'number' || widget === 'slider' || widget === 'datetime') {
    // Strip numeric separators (1_000_000) and try Number()
    const n = Number(t.replace(/_/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  // String-like: strip surrounding quotes if present, unescape simple sequences
  const m = t.match(/^['"`](.*)['"`]$/s);
  if (!m) return t;
  return m[1]
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n');
}

/** Convert a UI value into a TS source-code literal for code patching. */
function valueToLiteral(widget: PropertyWidget, value: string | number | boolean): string {
  if (widget === 'boolean') return value ? 'true' : 'false';
  if (widget === 'number' || widget === 'slider' || widget === 'datetime') {
    const n = typeof value === 'number' ? value : Number(value);
    return String(Number.isFinite(n) ? n : 0);
  }
  // String-like: wrap in single quotes, escape backslash + quote + newline
  const s = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  return `'${s}'`;
}

/**
 * Parse every `varName.propName.value = expr;` assignment in the source and
 * return a map { propName: rawExpression }. Picks the last assignment for
 * each property (matching runtime semantics).
 */
function parsePropertyValues(code: string, varName: string): Record<string, string> {
  const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `\\b${esc}\\.(\\w+)\\.value\\s*=\\s*([^;\\n]+?)\\s*;?\\s*(?:\\r?\\n|$)`,
    'g'
  );
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) out[m[1]] = m[2].trim();
  return out;
}

/**
 * Patch (or insert) `varName.propName.value = newLiteral;` in the source.
 *
 * - If an assignment already exists, replace its RHS in place.
 * - Otherwise, insert a new line right after `const varName = new …;`.
 * - Returns null if neither the assignment nor the declaration can be found
 *   (caller decides whether to bail or warn).
 */
function patchPropertyValue(
  code: string,
  varName: string,
  propName: string,
  newLiteral: string
): string | null {
  const escVar = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escProp = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 1. Replace existing assignment (anywhere in the file).
  const assignRe = new RegExp(`(\\b${escVar}\\.${escProp}\\.value\\s*=\\s*)([^;\\n]+)(;?)`, 'g');
  if (assignRe.test(code)) {
    return code.replace(assignRe, (_match, lhs, _old, semi) => `${lhs}${newLiteral}${semi || ';'}`);
  }

  // 2. Insert just after the variable declaration.
  const declRe = new RegExp(
    `((?:const|let|var)\\s+${escVar}(?:\\s*:[^=]+)?\\s*=\\s*(?:new\\s+\\w+(?:<[^>]*>)?\\s*\\([^)]*\\)|Timer\\.(?:create|singleShot)\\s*\\([^)]*\\))\\s*;?)`
  );
  if (declRe.test(code)) {
    return code.replace(declRe, `$1\n${varName}.${propName}.value = ${newLiteral};`);
  }

  return null;
}

/**
 * Build a `PropertyDef[]` from a list of `.changed` signals (`name.changed`
 * → property `name` of the carrier type). Drops anything that doesn't end
 * with `.changed`. Used when a manifest lacks an explicit `properties` block.
 */
function deriveProperties(signals: Array<{ name: string; type: string }>): PropertyDef[] {
  const out: PropertyDef[] = [];
  const seen = new Set<string>();
  for (const s of signals) {
    if (!s.name.endsWith('.changed')) continue;
    const name = s.name.slice(0, -'.changed'.length);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, type: s.type });
  }
  return out;
}

/** Parse `readonly foo = new Property<T>(default)` declarations from a class body. */
function parseLocalProperties(body: string): PropertyDef[] {
  const out: PropertyDef[] = [];
  const re = /readonly\s+(\w+)\s*=\s*new\s+Property<([^>]+)>\s*\(\s*([^)]*?)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const [, name, type, defaultExpr] = m;
    out.push({ name, type: type.trim(), default: defaultExpr.trim() || undefined });
  }
  return out;
}

/* ── Code patching (constructor arg update) ─────────────────────────────────*/

/**
 * Replaces one constructor argument in the source code.
 * Finds: `const varName = new ClassName(...)` or `Timer.create(...)`
 * and rebuilds the arg list with the new value at argIndex.
 */
function patchConstructorArg(
  code: string,
  varName: string,
  argIndex: number,
  newValue: string
): string | null {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match both `new ClassName(` and `Timer.create(` / `Timer.singleShot(`
  const re = new RegExp(
    `((?:const|let|var)\\s+${escaped}[^=]*=\\s*(?:new\\s+\\w+(?:<[^>]*>)?\\s*|Timer\\.(?:create|singleShot)\\s*))(\\([^)]*\\))`
  );
  const match = re.exec(code);
  if (!match) return null;

  const prefix = match[1];
  const argsRaw = match[2].slice(1, -1); // strip outer parens
  const args = argsRaw.split(',').map((a) => a.trim());
  while (args.length <= argIndex) args.push('undefined');
  args[argIndex] = newValue;

  const replacement = `${prefix}(${args.join(', ')})`;
  return code.slice(0, match.index) + replacement + code.slice(match.index + match[0].length);
}

/* ── Graph metadata (positions saved as a comment in the source file) ────────*/

const METADATA_PREFIX = '// @minislib-graph ';
const METADATA_RE = /^\/\/ @minislib-graph (.+)$/m;

type SavedPositions = Record<string, { x: number; y: number }>;

function parseGraphMetadata(code: string): SavedPositions {
  const m = METADATA_RE.exec(code);
  if (!m) return {};
  try {
    return JSON.parse(m[1]) as SavedPositions;
  } catch {
    return {};
  }
}

function patchGraphMetadata(code: string, positions: SavedPositions): string {
  const line = METADATA_PREFIX + JSON.stringify(positions);
  if (METADATA_RE.test(code)) return code.replace(METADATA_RE, line);
  return (code.endsWith('\n') ? code : code + '\n') + line + '\n';
}

/* ── External package manifest loading ──────────────────────────────────────*/

interface ExternalClassDef {
  kind: EntityKind;
  signals: SignalPort[];
  slots: SlotPort[];
  paramDefs: ParamDef[];
  properties: PropertyDef[];
}

interface MinislibPluginManifest {
  version: string;
  classes: Record<
    string,
    {
      kind: EntityKind;
      signals?: Array<{ name: string; type: string }>;
      slots?: Array<{ name: string }>;
      paramDefs?: ParamDef[];
      properties?: PropertyDef[];
    }
  >;
}

/**
 * Translate a client-side VFS path to the correct backend API URL.
 *
 * The builtin `/home` mount, AND any user-created mount that uses the
 * **User Home** provider (whatever its mount-point name — `/user`, `/me`, …),
 * map to the per-user endpoint:
 *   /{mount}/{relPath} → /api/users/{user}/vfs/{op}?path=/data/Minis/Users/{user}/{relPath}
 *
 * The mount→provider mapping is read from the saved VFS presets
 * (`localStorage.mycastle_vfs_presets`). Everything else (system mounts like
 * `/server`, `/mycastle-code`, `/devices`, or unknown mounts) falls back to the
 * admin/composite endpoint — same as before.
 */
function vfsApiUrl(clientPath: string, op: string): string {
  const userName = window.location.pathname.match(/\/user\/([^/]+)\//)?.[1];
  const segs = clientPath.replace(/^\/+/, '').split('/');
  const mountSeg = segs[0] ?? '';
  const rest = segs.slice(1).join('/');

  // Any mount that isn't a known system mount is treated as the user's home dir
  // — strip its mount-point segment and map the rest under /data/Minis/Users/{user}.
  // This mirrors how the TypeScript-IntelliSense plugin resolves the same paths
  // (`/user/drive/x.ts` → /api/users/{u}/vfs?path=/data/Minis/Users/{u}/drive/x.ts)
  // and works for /home, /user, or any custom User-Home mount name.
  const SYSTEM_VFS_MOUNTS = new Set(['server', 'mycastle-code', 'devices', 'data', 'api']);
  if (userName && mountSeg && !SYSTEM_VFS_MOUNTS.has(mountSeg)) {
    const backendPath = `/data/Minis/Users/${userName}${rest ? '/' + rest : ''}`;
    return `/api/users/${encodeURIComponent(userName)}/vfs/${op}?path=${encodeURIComponent(backendPath)}`;
  }
  return `/api/vfs/${op}?path=${encodeURIComponent(clientPath)}`;
}

/**
 * Auth header for VFS requests. The host app (mycastle-web) stores the JWT
 * inside `localStorage.minis_current_user`; without it every VFS endpoint
 * answers 401 and the Import dialog silently sees no manifests.
 */
function vfsAuthHeader(): Record<string, string> {
  try {
    const raw = localStorage.getItem('minis_current_user');
    if (!raw) return {};
    const token = (JSON.parse(raw) as { token?: string })?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Parse bare npm package imports from TypeScript source. */
function parseNpmImports(code: string): { packageName: string; names: string[] }[] {
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  const result: { packageName: string; names: string[] }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const pkg = m[2];
    if (pkg.startsWith('.') || pkg.startsWith('/')) continue; // skip relative
    const names = m[1]
      .split(',')
      .map((n) =>
        n
          .trim()
          .split(/\s+as\s+/)[0]
          .trim()
      )
      .filter(Boolean);
    if (names.length > 0) result.push({ packageName: pkg, names });
  }
  return result;
}

/** Derive the project root (containing node_modules) from a VFS file URI. */
function deriveProjectRoot(uri: string): string {
  const parts = uri.split('/');
  // Look for common source dirs: src, lib, dist
  for (const marker of ['src', 'lib', 'dist']) {
    const idx = parts.lastIndexOf(marker);
    if (idx > 0) return parts.slice(0, idx).join('/');
  }
  return parts.slice(0, -1).join('/');
}

// Cache whole-manifest results so multiple class lookups for the same package
// share one fetch. We deliberately don't cache misses — package install /
// rebuild between dialog opens is common, and a sticky `null` would silently
// hide newly-installed packages until a hard reload.
const _manifestCache = new Map<string, Record<string, ExternalClassDef>>();

async function fetchManifest(
  projectRoot: string,
  packageName: string
): Promise<Record<string, ExternalClassDef>> {
  const manifestPath = `${projectRoot}/node_modules/${packageName}/minislib-plugin.json`;
  const cached = _manifestCache.get(manifestPath);
  if (cached) return cached;

  try {
    const res = await fetch(vfsApiUrl(manifestPath, 'readFile'), { headers: vfsAuthHeader() });
    if (!res.ok) return {};
    const { data } = (await res.json()) as { data: string };
    const manifest = JSON.parse(atob(data)) as MinislibPluginManifest;
    const result: Record<string, ExternalClassDef> = {};
    for (const [className, def] of Object.entries(manifest.classes)) {
      // Auto-derive properties from .changed signals when no explicit
      // `properties` block is given — every `Property<T>` emits a
      // `<name>.changed: T` signal, so the listing is a free side-channel.
      const properties: PropertyDef[] = def.properties ?? deriveProperties(def.signals ?? []);
      result[className] = {
        kind: def.kind ?? 'class',
        signals: def.signals ?? [],
        slots: def.slots ?? [],
        paramDefs: def.paramDefs ?? [],
        properties,
      };
    }
    _manifestCache.set(manifestPath, result);
    return result;
  } catch {
    return {};
  }
}

export interface ExternalClassEntry {
  packageName: string;
  className: string;
  def: ExternalClassDef;
}

/* ── Import-driven class parsing (manifest-free) ─────────────────────────────
 * Resolve imported classes straight from project source, so importing a Node
 * subclass is enough to expose its ports — no minislib-plugin.json required.
 * Handles field-style (`readonly x = new Signal/Property(...)`) AND reflective
 * getter-style wrappers (`get x() { return this.signal/prop('x') }`, e.g. the Qt
 * Node wrappers), merging ports across the `extends` chain and barrels. */

/** Collapse `.`/`..` segments in a VFS path (keeps a leading slash). */
function normalizeVfsPath(p: string): string {
  const abs = p.startsWith('/');
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
    } else out.push(seg);
  }
  return (abs ? '/' : '') + out.join('/');
}

async function cachedReadText(
  path: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (cache.has(path)) return cache.get(path)!;
  const txt = await vfsReadFileText(path);
  cache.set(path, txt);
  return txt;
}

/** Resolve an import specifier (relative or bare) to an existing VFS .ts file. */
async function resolveImportToFile(
  specifier: string,
  fromFile: string,
  projectRoot: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  const dir = fromFile.split('/').slice(0, -1).join('/');
  const bases = specifier.startsWith('.')
    ? [normalizeVfsPath(`${dir}/${specifier}`)]
    : [
        normalizeVfsPath(`${projectRoot}/${specifier}`),
        normalizeVfsPath(`${projectRoot}/node_modules/${specifier}`),
      ];
  for (const b of bases) {
    for (const cand of [`${b}.ts`, `${b}.tsx`, `${b}/index.ts`, `${b}/index.tsx`]) {
      if ((await cachedReadText(cand, cache)) !== null) return cand;
    }
  }
  return null;
}

/** Find the file + body where `className` is defined, following re-exports and
 *  imports across project files. */
async function findClassDefinition(
  className: string,
  startFile: string,
  projectRoot: string,
  cache: Map<string, string | null>,
  seen = new Set<string>()
): Promise<{ file: string; body: string; extendsName: string | null } | null> {
  if (seen.has(startFile) || seen.size > 40) return null;
  seen.add(startFile);
  const code = await cachedReadText(startFile, cache);
  if (!code) return null;

  const classRe = new RegExp(
    `(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+${className}\\b[^{]*`
  );
  const cm = classRe.exec(code);
  if (cm) {
    return {
      file: startFile,
      body: extractClassBody(code, cm.index + cm[0].length),
      extendsName: /extends\s+(\w+)/.exec(cm[0])?.[1] ?? null,
    };
  }

  // Re-export / import that brings `className` from another module → follow it.
  const linkRe = /(?:export|import)\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(code)) !== null) {
    const names = lm[1].split(',').map((n) =>
      n
        .trim()
        .split(/\s+as\s+/)[0]
        .trim()
    );
    if (!names.includes(className)) continue;
    const target = await resolveImportToFile(lm[2], startFile, projectRoot, cache);
    if (target) {
      const found = await findClassDefinition(className, target, projectRoot, cache, seen);
      if (found) return found;
    }
  }
  return null;
}

function propTypeFromGeneric(generic?: string): string {
  const t = (generic ?? '').trim();
  return t === 'boolean' || t === 'number' || t === 'string' ? t : t || 'string';
}

/** Parse field-style AND reflective getter-style ports from a class body. */
function parseAnyClassPorts(body: string): { signals: SignalPort[]; properties: PropertyDef[] } {
  const signals: SignalPort[] = [...parseSignalPorts(body)];
  const properties: PropertyDef[] = [...parseLocalProperties(body)];
  const getterRe =
    /get\s+(\w+)\s*\(\)\s*(?::[^={;]+)?\{\s*return\s+this\.(signal|prop)\s*(?:<([^>]*)>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = getterRe.exec(body)) !== null) {
    const [, name, kind, generic] = m;
    if (kind === 'signal') {
      if (!signals.some((s) => s.name === name))
        signals.push({ name, type: (generic ?? '').trim() });
    } else if (!properties.some((p) => p.name === name)) {
      properties.push({ name, type: propTypeFromGeneric(generic) });
    }
  }
  return { signals, properties };
}

function dedupeSignals(ports: SignalPort[]): SignalPort[] {
  const seen = new Set<string>();
  return ports.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)));
}
function dedupeProps(props: PropertyDef[]): PropertyDef[] {
  const seen = new Set<string>();
  return props.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)));
}

/** Build an ExternalClassDef for `className` by parsing its definition + the
 *  `extends` chain across project files. Null if it can't be located. */
async function buildClassDefFromSource(
  className: string,
  definingFile: string,
  projectRoot: string,
  cache: Map<string, string | null>,
  depth = 0
): Promise<ExternalClassDef | null> {
  if (depth > 12) return null;
  const src = await findClassDefinition(className, definingFile, projectRoot, cache);
  if (!src) return null;
  const own = parseAnyClassPorts(src.body);
  let signals = own.signals;
  let properties = own.properties;

  const base = src.extendsName;
  if (base === 'Node') {
    signals = [...NODE_BUILTIN_SIGNALS, ...signals];
  } else if (base && !MINISLIB_BASE_KIND[base]) {
    const baseDef = await buildClassDefFromSource(base, src.file, projectRoot, cache, depth + 1);
    if (baseDef) {
      signals = dedupeSignals([...baseDef.signals, ...signals]);
      properties = dedupeProps([...baseDef.properties, ...properties]);
    }
  }
  return { kind: 'class', signals, slots: [], paramDefs: [], properties };
}

/**
 * Hardcoded manifest for Qt widget wrapper classes from `@hestia/core`
 * (`packages/minislib/src/qt/widgets.ts`). Utrzymywane ręcznie w sync z widgets.ts
 * + qt.module.js (`packages/core/browser/qt/qt.module.js`) — źródło prawdy dla
 * signals/properties per klasa.
 *
 * DLACZEGO hardcoded (nie parsuje source ani nie ładuje runtime):
 *  1. Klasy QtNode używają REFLEKTYWNEGO bridge: `get text() { return this.prop('text') }`.
 *     Regex-parser plugin nie widzi tego jako signal/property — trzeba metadanych.
 *  2. Native Q-klasy (QLabel, QPushButton) mają `static properties/signals` w
 *     qt.module.js, ale ten plik nie jest importowany do plugin — jest ładowany
 *     runtime przez `runBrowserComponent` gdy user uruchamia komponent.
 *  3. Manifest JSON w node_modules/@hestia/core/ nie działa dla skryptów
 *     w Drive user (user data nie ma `node_modules/`), a `loadExternalClassDefs`
 *     świadomie pomija `@hestia/core` uważając ją za built-in.
 *
 * Signals/properties zawierają dziedziczone z całego łańcucha (QObject→QWidget→…).
 * Fields `slots` pomijamy — Qt widgets nie deklarują slotów jak minislib klasy;
 * użytkownik może podpiąć się do dowolnego settera przez `.connect(x.setFoo)`.
 */
const MINISLIB_QT_MANIFEST: Record<string, ExternalClassDef> = (() => {
  // Wspólne dla WSZYSTKICH widgetów Qt (dziedziczne QObject + QWidget).
  const baseSignals: SignalPort[] = [
    { name: 'destroyed', type: '' },
    { name: 'objectNameChanged', type: 'string' },
    { name: 'clicked', type: '' },
  ];
  const baseProps: PropertyDef[] = [
    { name: 'objectName', type: 'string' },
    { name: 'visible', type: 'bool' },
    { name: 'enabled', type: 'bool' },
    { name: 'toolTip', type: 'string' },
    { name: 'x', type: 'number' },
    { name: 'y', type: 'number' },
    { name: 'width', type: 'number' },
    { name: 'height', type: 'number' },
    { name: 'geometry', type: 'QRect' },
    { name: 'pos', type: 'QPoint' },
    { name: 'size', type: 'QSize' },
  ];
  // Common dla QAbstractButton → QPushButton / QToolButton / QCheckBox / QRadioButton.
  const abstractButtonSignals: SignalPort[] = [
    { name: 'clicked', type: 'boolean' },
    { name: 'toggled', type: 'boolean' },
    { name: 'pressed', type: '' },
    { name: 'released', type: '' },
  ];
  const abstractButtonProps: PropertyDef[] = [
    { name: 'text', type: 'string' },
    { name: 'checkable', type: 'bool' },
    { name: 'checked', type: 'bool' },
    { name: 'down', type: 'bool' },
  ];

  const mk = (signals: SignalPort[], properties: PropertyDef[]): ExternalClassDef => ({
    kind: 'class',
    signals,
    slots: [],
    paramDefs: [],
    properties,
  });

  return {
    QtWidgetNode: mk(baseSignals, baseProps),
    QtLabelNode: mk(baseSignals, [
      ...baseProps,
      { name: 'text', type: 'string' },
      { name: 'alignment', type: 'number' },
    ]),
    QtAbstractButtonNode: mk(
      [...baseSignals, ...abstractButtonSignals],
      [...baseProps, ...abstractButtonProps]
    ),
    QtButtonNode: mk(
      [...baseSignals, ...abstractButtonSignals],
      [
        ...baseProps,
        ...abstractButtonProps,
        { name: 'flat', type: 'bool' },
        { name: 'default', type: 'bool' },
      ]
    ),
    QtCheckBoxNode: mk(
      [...baseSignals, ...abstractButtonSignals, { name: 'stateChanged', type: 'number' }],
      [...baseProps, ...abstractButtonProps, { name: 'tristate', type: 'bool' }]
    ),
    QtRadioButtonNode: mk(
      [...baseSignals, ...abstractButtonSignals],
      [...baseProps, ...abstractButtonProps]
    ),
    QtLineEditNode: mk(
      [
        ...baseSignals,
        { name: 'textChanged', type: 'string' },
        { name: 'textEdited', type: 'string' },
        { name: 'returnPressed', type: '' },
        { name: 'editingFinished', type: '' },
      ],
      [
        ...baseProps,
        { name: 'text', type: 'string' },
        { name: 'placeholderText', type: 'string' },
        { name: 'readOnly', type: 'bool' },
        { name: 'maxLength', type: 'number' },
        { name: 'echoMode', type: 'number' },
      ]
    ),
    QtSliderNode: mk(
      [
        ...baseSignals,
        { name: 'valueChanged', type: 'number' },
        { name: 'sliderMoved', type: 'number' },
      ],
      [
        ...baseProps,
        { name: 'value', type: 'number' },
        { name: 'minimum', type: 'number' },
        { name: 'maximum', type: 'number' },
        { name: 'singleStep', type: 'number' },
        { name: 'pageStep', type: 'number' },
        { name: 'orientation', type: 'number' },
      ]
    ),
    QtProgressBarNode: mk(baseSignals, [
      ...baseProps,
      { name: 'value', type: 'number' },
      { name: 'minimum', type: 'number' },
      { name: 'maximum', type: 'number' },
    ]),
    QtSpinBoxNode: mk(
      [...baseSignals, { name: 'valueChanged', type: 'number' }],
      [
        ...baseProps,
        { name: 'value', type: 'number' },
        { name: 'minimum', type: 'number' },
        { name: 'maximum', type: 'number' },
        { name: 'singleStep', type: 'number' },
        { name: 'prefix', type: 'string' },
        { name: 'suffix', type: 'string' },
      ]
    ),
    QtComboBoxNode: mk(
      [
        ...baseSignals,
        { name: 'currentIndexChanged', type: 'number' },
        { name: 'activated', type: 'number' },
      ],
      [
        ...baseProps,
        { name: 'currentIndex', type: 'number' },
        { name: 'currentText', type: 'string' },
        { name: 'count', type: 'number' },
      ]
    ),
    QtListWidgetNode: mk(
      [
        ...baseSignals,
        { name: 'currentRowChanged', type: 'number' },
        { name: 'itemClicked', type: 'QListWidgetItem' },
        { name: 'itemDoubleClicked', type: 'QListWidgetItem' },
      ],
      [...baseProps, { name: 'currentRow', type: 'number' }, { name: 'count', type: 'number' }]
    ),
  };
})();

/**
 * Load all external minislib-plugin.json manifests available to the project.
 *
 * We scan both:
 *   1. Packages already imported in the current code (catches user-side imports).
 *   2. Every dependency from `package.json` (so Add Instance can offer classes
 *      from installed-but-not-yet-imported packages — same source the +Import
 *      dialog uses to populate its checkbox list).
 */
async function loadExternalClassDefs(
  code: string,
  uri: string
): Promise<{
  byClass: Map<string, ExternalClassDef>;
  entries: ExternalClassEntry[];
}> {
  if (!uri || uri.startsWith('virtual://')) {
    // Nawet dla virtual URI seedujemy Qt manifest — plugin działa gdy user
    // otwiera graph z untitled buforu.
    const seed = new Map<string, ExternalClassDef>();
    const seedEntries: ExternalClassEntry[] = [];
    for (const [className, def] of Object.entries(MINISLIB_QT_MANIFEST)) {
      seed.set(className, def);
      seedEntries.push({ packageName: '@hestia/core', className, def });
    }
    return { byClass: seed, entries: seedEntries };
  }
  const projectRoot = deriveProjectRoot(uri);
  const fromImports = parseNpmImports(code).map(({ packageName }) => packageName);
  const fromPackageJson = await readPackageJsonDeps(projectRoot);
  // Skip @hestia/core — it's handled separately as built-ins.
  const pkgSet = new Set([...fromImports, ...fromPackageJson].filter((p) => p !== '@hestia/core'));

  const byClass = new Map<string, ExternalClassDef>();
  const entries: ExternalClassEntry[] = [];

  // 0. Seed hardcoded Qt widget manifest (widgets.ts z minislib) — bez tego
  //    plugin nie widzi signal/property dla QtLabelNode/QtButtonNode/… (reflektywne
  //    gettery, `parseNpmImports` klasyfikuje je jako 'instance' bez portów).
  for (const [className, def] of Object.entries(MINISLIB_QT_MANIFEST)) {
    byClass.set(className, def);
    entries.push({ packageName: '@hestia/core', className, def });
  }

  // 1. Manifest-declared classes (minislib-plugin.json).
  await Promise.all(
    Array.from(pkgSet).map(async (packageName) => {
      const defs = await fetchManifest(projectRoot, packageName);
      for (const [className, def] of Object.entries(defs)) {
        byClass.set(className, def);
        entries.push({ packageName, className, def });
      }
    })
  );

  // 2. Imported classes parsed straight from project source (manifest-free).
  //    Resolves each import to a file, then parses the class + its `extends`
  //    chain — covering both field-style and reflective getter-style (Qt)
  //    wrappers. Manifest entries above win on name collisions.
  const readCache = new Map<string, string | null>();
  const imports = parseAllImports(code).filter(({ packageName }) => packageName !== '@hestia/core');
  await Promise.all(
    imports.map(async ({ packageName, names }) => {
      const classNames = names.filter(
        (n) => /^[A-Z]/.test(n) && !MINISLIB_EXPORTS.includes(n) && !byClass.has(n)
      );
      if (classNames.length === 0) return;
      const file = await resolveImportToFile(packageName, uri, projectRoot, readCache);
      if (!file) return;
      for (const className of classNames) {
        if (byClass.has(className)) continue;
        const def = await buildClassDefFromSource(className, file, projectRoot, readCache);
        if (def && (def.signals.length > 0 || def.properties.length > 0)) {
          byClass.set(className, def);
          entries.push({ packageName, className, def });
        }
      }
    })
  );

  return { byClass, entries };
}

/* ── Manifest export ─────────────────────────────────────────────────────────*/

/** Build minislib-plugin.json content from parsed class entities. */
function generateManifest(entities: MinisEntity[]): string {
  const classes: Record<string, unknown> = {};
  for (const e of entities) {
    if (e.kind !== 'class') continue;
    classes[e.varName] = {
      kind: e.kind,
      signals: e.signals.map((s) => ({ name: s.name, type: s.type })),
      slots: e.slots.map((s) => ({ name: s.name })),
      paramDefs: e.paramDefs,
    };
  }
  return JSON.stringify({ version: '1.0', classes }, null, 2);
}

/** Save manifest JSON to VFS at {projectRoot}/minislib-plugin.json */
async function saveManifestToVfs(fileUri: string, json: string): Promise<void> {
  const projectRoot = deriveProjectRoot(fileUri);
  const manifestPath = `${projectRoot}/minislib-plugin.json`;
  const bytes = new TextEncoder().encode(json);
  const data = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
  const res = await fetch(vfsApiUrl(manifestPath, 'writeFile'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...vfsAuthHeader() },
    body: JSON.stringify({ data, options: { create: true, overwrite: true } }),
  });
  if (!res.ok) throw new Error(`VFS write failed: ${res.status}`);
  // Invalidate manifest cache so next open re-reads the updated file
  _manifestCache.clear();
}

/* ── Monaco helpers ──────────────────────────────────────────────────────────*/

function getEditorModel(targetUri: string): monaco.editor.ITextModel | null {
  return findModel(targetUri);
}

function markDirty(path: string) {
  globalEventBus.emit('system:editor:markDirty', { path });
}

/** Re-parse entities from `newCode` and notify React components so the canvas updates.
 *  Uses notifyComponents() — NOT notifyState() — to avoid triggering updateToolbar()
 *  (which disposes/re-registers toolbar items and can cause them to disappear). */
function refreshStateFromEdit(newCode: string) {
  const byClass = new Map<string, ExternalClassDef>(
    _state.externalClassDefs.map((e) => [e.className, e.def])
  );
  const { entities, connections } = parseMinisEntities(newCode, byClass);
  const savedPositions = parseGraphMetadata(newCode);
  _state = {
    ..._state,
    entities,
    connections,
    currentCode: newCode,
    savedPositions,
    isMinisFile: hasMinislibImport(newCode),
  };
  notifyComponents();
}

function replaceModelContent(model: monaco.editor.ITextModel, newCode: string) {
  const full = model.getFullModelRange();
  model.pushEditOperations([], [{ range: full, text: newCode }], () => null);
  markDirty(model.uri.path);
  refreshStateFromEdit(newCode);
}

function findModel(targetUri: string): monaco.editor.ITextModel | null {
  // targetUri may lack the "file://" scheme; Monaco models always have it
  const withScheme = targetUri.startsWith('file://') ? targetUri : `file://${targetUri}`;
  const models = monaco.editor.getModels();
  return (
    models.find((m) => m.uri.toString() === targetUri) ??
    models.find((m) => m.uri.toString() === withScheme) ??
    models.find((m) => m.uri.path === targetUri) ??
    null
  );
}

function insertAtEnd(code: string, targetUri: string): boolean {
  const model = findModel(targetUri);
  if (!model) return false;
  const lastLine = model.getLineCount();
  const lastCol = model.getLineMaxColumn(lastLine);
  model.pushEditOperations(
    [],
    [{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol), text: '\n' + code }],
    () => null
  );
  markDirty(model.uri.path);
  refreshStateFromEdit(model.getValue());
  return true;
}

function removeConnectLine(conn: ParsedConnection, targetUri: string): boolean {
  const model = findModel(targetUri);
  if (!model) return false;
  const lines = model.getValue().split('\n');
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const srcPart = conn.signalName
    ? `${esc(conn.sourceVar)}\\.${esc(conn.signalName)}`
    : esc(conn.sourceVar);
  const tgtPart = conn.slotName
    ? `${esc(conn.targetVar)}(?:\\.${esc(conn.slotName)})?`
    : esc(conn.targetVar);
  const re = new RegExp(
    `${srcPart}\\.connect\\s*\\(\\s*${tgtPart}(?:\\.bind\\s*\\([^)]*\\))?\\s*\\)`
  );
  const lineIdx = lines.findIndex((l) => re.test(l));
  if (lineIdx < 0) return false;
  lines.splice(lineIdx, 1);
  replaceModelContent(model, lines.join('\n'));
  return true;
}

function insertMemberIntoClass(memberCode: string, className: string, targetUri: string): boolean {
  const model = findModel(targetUri);
  if (!model) return false;
  const code = model.getValue();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Find "class ClassName ... {" and insert right after the opening brace
  const re = new RegExp(`class\\s+${esc(className)}\\b[^{]*\\{`);
  const match = re.exec(code);
  if (!match) return false;
  const insertPos = match.index + match[0].length;
  replaceModelContent(
    model,
    code.slice(0, insertPos) + '\n  ' + memberCode + code.slice(insertPos)
  );
  return true;
}

/**
 * Find the slot method `oldName` inside class `className` and replace its entire
 * `name(...): void { ... }` block with `newMemberCode`. Brace counting walks
 * through nested blocks (if/for/etc.) so we cover the full body.
 * Returns false when class or slot can't be located.
 */
function replaceSlotInClass(
  oldName: string,
  newMemberCode: string,
  className: string,
  targetUri: string
): boolean {
  const model = findModel(targetUri);
  if (!model) return false;
  const code = model.getValue();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Locate the class block first so we don't accidentally edit an unrelated
  // method with the same name elsewhere.
  const classRe = new RegExp(`class\\s+${esc(className)}\\b[^{]*\\{`);
  const classMatch = classRe.exec(code);
  if (!classMatch) return false;
  const classStart = classMatch.index + classMatch[0].length;

  // Now find the slot method declaration inside the class body.
  const slotRe = new RegExp(
    `(\\n\\s*)(?:public\\s+)?${esc(oldName)}\\s*\\(([^)]*)\\)\\s*(?::\\s*(?:void|Promise<[^>]*>|\\w[\\w<>]*))?\\s*\\{`,
    'g'
  );
  slotRe.lastIndex = classStart;
  const slotMatch = slotRe.exec(code);
  if (!slotMatch) return false;

  // Walk braces from the opening { to find the matching close.
  const openIdx = slotMatch.index + slotMatch[0].length - 1;
  let depth = 1;
  let i = openIdx + 1;
  while (i < code.length && depth > 0) {
    const c = code[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  if (depth !== 0) return false; // unbalanced — bail out, don't corrupt source

  // Slot method spans [methodStart .. i). Preserve the leading whitespace
  // (slotMatch[1]) so the indentation stays consistent.
  const methodStart = slotMatch.index + slotMatch[1].length;
  const methodEnd = i;
  replaceModelContent(model, code.slice(0, methodStart) + newMemberCode + code.slice(methodEnd));
  return true;
}

/**
 * Jedna transakcja na pliku dla edycji składowej klasy: podmiana (albo
 * usunięcie) deklaracji plus przeniesienie użyć na nową nazwę. Robimy to
 * jednym `replaceModelContent`, bo dwa kolejne zapisy modelu wywołałyby
 * dwa przeparsowania i pośredni stan, w którym `connect()` wskazuje na
 * sygnał, którego już nie ma.
 */
function applyMemberEdit(opts: {
  className: string;
  /** Nazwa pola w źródle — po niej szukamy deklaracji. */
  oldName: string;
  /** Nowa nazwa; równa `oldName`, gdy zmieniono tylko typ. */
  newName: string;
  /** Gotowa deklaracja, albo `null` gdy pole ma zniknąć. */
  newMember: string | null;
  /** Zmienne trzymające instancje tej klasy — ich `x.sygnal` też idzie za nazwą. */
  instanceVars: string[];
  targetUri: string;
}): boolean {
  const model = findModel(opts.targetUri);
  if (!model) return false;
  const code = model.getValue();
  const afterDecl =
    opts.newMember === null
      ? removeFieldFromCode(code, opts.className, opts.oldName)
      : replaceFieldInCode(code, opts.className, opts.oldName, opts.newMember);
  if (afterDecl === null) return false;
  const finalCode =
    opts.newMember !== null && opts.newName && opts.newName !== opts.oldName
      ? renameMemberInCode(afterDecl, opts.className, opts.instanceVars, opts.oldName, opts.newName)
      : afterDecl;
  replaceModelContent(model, finalCode);
  return true;
}

/** Zmienne, w których leżą instancje danej klasy (label ma postać `zm:Klasa`). */
function instanceVarsOfClass(className: string): string[] {
  return _state.entities
    .filter((e) => e.kind === 'instance' && e.label.split(':')[1] === className)
    .map((e) => e.varName);
}

/** Adds `name` to an existing named import from `pkg`, or inserts a new import line. */
function ensureNamedImport(name: string, pkg: string, targetUri: string): void {
  const model = findModel(targetUri);
  if (!model) return;
  const code = model.getValue();
  // Already imported — nothing to do
  if (new RegExp(`\\b${name}\\b`).test(code)) return;
  // Extend an existing import from the same package:
  // matches e.g. `import { CoreObject, Signal } from '@hestia/core'`
  const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingRe = new RegExp(`(import\\s*\\{[^}]*)\\}(\\s*from\\s*['"]${escapedPkg}['"])`);
  const m = existingRe.exec(code);
  if (m) {
    // m[1] = "import { CoreObject, Signal "  m[2] = " from '@hestia/core'"
    const newImport = `${m[1]}, ${name} }${m[2]}`;
    replaceModelContent(
      model,
      code.slice(0, m.index) + newImport + code.slice(m.index + m[0].length)
    );
    return;
  }
  // No existing import from this package — insert a new line after the last import
  const lines = code.split('\n');
  let lastImportIdx = -1;
  lines.forEach((l, i) => {
    if (/^\s*import\s/.test(l)) lastImportIdx = i;
  });
  lines.splice(lastImportIdx + 1, 0, `import { ${name} } from '${pkg}';`);
  replaceModelContent(model, lines.join('\n'));
}

const BASE_CLASS_OPTIONS = [
  { label: 'Node', value: 'Node', pkg: '@hestia/core' },
  { label: 'CoreObject', value: 'CoreObject', pkg: '@hestia/core' },
] as const;

function insertNewClass(
  className: string,
  baseClass: string,
  pkg: string,
  targetUri: string
): boolean {
  ensureNamedImport(baseClass, pkg, targetUri);
  return insertAtEnd(`\nclass ${className} extends ${baseClass} {\n}`, targetUri);
}

/* ── Module-level shared state ───────────────────────────────────────────────*/

interface ImportedClass {
  packageName: string;
  className: string;
}

interface PluginState {
  entities: MinisEntity[];
  connections: ParsedConnection[];
  uri: string;
  isMinisFile: boolean;
  currentCode: string;
  savedPositions: SavedPositions;
  externalClassDefs: ExternalClassEntry[];
  importedClasses: ImportedClass[];
}

let _state: PluginState = {
  entities: [],
  connections: [],
  uri: '',
  isMinisFile: false,
  currentCode: '',
  savedPositions: {},
  externalClassDefs: [],
  importedClasses: [],
};
// Persists ReactFlow viewport across tab switches (component unmount/remount)
let _savedViewport: { x: number; y: number; zoom: number } | null = null;

const _stateListeners = new Set<() => void>();
/** Notify ALL listeners — React components + toolbar updater. */
function notifyState() {
  _stateListeners.forEach((fn) => fn());
}

/** Only notify React component listeners (not toolbar).
 *  Used after programmatic edits so the canvas refreshes without disturbing toolbar state. */
const _componentListeners = new Set<() => void>();
function notifyComponents() {
  _componentListeners.forEach((fn) => fn());
}

function usePluginState(): PluginState {
  const [s, setS] = useState<PluginState>(_state);
  useEffect(() => {
    const fn = () => setS({ ..._state });
    _stateListeners.add(fn);
    _componentListeners.add(fn);
    return () => {
      _stateListeners.delete(fn);
      _componentListeners.delete(fn);
    };
  }, []);
  return s;
}

let _onInsertCode: ((code: string) => void) | null = null;
let _currentUpdateToolbar: (() => void) | null = null;
let _vfsContentUnsub: (() => void) | null = null;

/* ── Snippets ────────────────────────────────────────────────────────────────*/

interface Snippet {
  id: string;
  code: string;
  inserted: boolean;
}
let _snippets: Snippet[] = [];
const _snippetListeners = new Set<() => void>();
function addSnippet(code: string, inserted: boolean) {
  _snippets = [{ id: `s${Date.now()}`, code, inserted }, ..._snippets.slice(0, 4)];
  _snippetListeners.forEach((fn) => fn());
}
function useSnippets() {
  const [s, setS] = useState<Snippet[]>(_snippets);
  useEffect(() => {
    const fn = () => setS([..._snippets]);
    _snippetListeners.add(fn);
    return () => {
      _snippetListeners.delete(fn);
    };
  }, []);
  return s;
}

/* ── Visual constants ────────────────────────────────────────────────────────*/

const KIND_COLOR: Record<EntityKind, string> = {
  class: '#4fc3f7',
  instance: '#81c784',
  signal: '#ffb74d',
  property: '#ce93d8',
  timer: '#f48fb1',
  fsm: '#80cbc4',
  bus: '#ffcc02',
  commandstack: '#a5d6a7',
  listmodel: '#90caf9',
  logger: '#bcaaa4',
};
const KIND_ICON: Record<EntityKind, string> = {
  class: '🏛',
  instance: '📦',
  signal: '⚡',
  property: '🔵',
  timer: '⏱',
  fsm: '🔄',
  bus: '📡',
  commandstack: '↩',
  listmodel: '📋',
  logger: '📝',
};

const HEADER_H = 34;
const ROW_H = 22;
const BODY_PAD = 4;

/* ── ReactFlow node ──────────────────────────────────────────────────────────*/

interface MinisNodeData extends Record<string, unknown> {
  entity: MinisEntity;
}

function MinisObjectNode({ data, selected }: NodeProps) {
  const { entity } = data as MinisNodeData;
  const color = KIND_COLOR[entity.kind] ?? '#4fc3f7';
  const icon = KIND_ICON[entity.kind] ?? '📦';
  const rowCount = Math.max(entity.signals.length, entity.slots.length);
  const bodyH = BODY_PAD + rowCount * ROW_H + BODY_PAD;
  const hasParams = entity.paramDefs.length > 0;

  return (
    <div
      style={{
        minWidth: 160,
        background: '#1e1e2e',
        border: `1.5px solid ${selected ? color : color + '55'}`,
        borderTop: `3px solid ${color}`,
        borderRadius: 6,
        fontSize: 11,
        color: '#cdd6f4',
        userSelect: 'none',
        boxShadow: selected ? `0 0 10px ${color}44` : '0 2px 8px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          height: HEADER_H,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '0 10px',
          borderBottom: '1px solid #313244',
        }}
      >
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span
          style={{
            fontWeight: 600,
            color,
            fontSize: 11,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {entity.label}
        </span>
        {hasParams && (
          <span title="Has properties" style={{ fontSize: 9, color: '#585b70', marginLeft: 2 }}>
            ⚙
          </span>
        )}
        {/* Delete × — always visible (previously: only when selected, which
            was hard to discover). Slightly larger + clearer hover so it reads
            as a clickable button rather than punctuation. */}
        {
          <span
            title="Delete entity (Del)"
            onClick={(e) => {
              e.stopPropagation();
              globalEventBus.emit('minislib:deleteEntity', { varName: entity.varName });
            }}
            // pointer down stop too — ReactFlow drags on pointer; without this,
            // clicking × on an unselected node would start a drag instead.
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              fontSize: 16,
              lineHeight: 1,
              color: selected ? '#f38ba8' : '#6c7086',
              cursor: 'pointer',
              padding: '2px 5px',
              borderRadius: 3,
              marginLeft: 2,
              fontWeight: 700,
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = '#3e1e1e';
              el.style.color = '#f38ba8';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = 'transparent';
              el.style.color = selected ? '#f38ba8' : '#6c7086';
            }}
          >
            ×
          </span>
        }
      </div>

      <div style={{ position: 'relative', height: bodyH }}>
        {entity.slots.map((slot, i) => {
          // Edit affordance only for slots we actually parsed from this file's
          // class body. Prototype/external slots (Timer.singleShot etc.) lack
          // `body` — there's nothing to load into Blockly.
          const editable = entity.kind === 'class' && slot.body !== undefined;
          return (
            <div
              key={slot.name}
              title={editable ? `Edit slot ${slot.name}(...)` : slot.name}
              onClick={(e) => {
                if (!editable) return;
                e.stopPropagation();
                globalEventBus.emit('minislib:editSlot', {
                  varName: entity.varName,
                  slotName: slot.name,
                });
              }}
              onPointerDown={(e) => {
                if (editable) e.stopPropagation();
              }}
              style={{
                position: 'absolute',
                top: BODY_PAD + i * ROW_H,
                left: 14,
                height: ROW_H,
                lineHeight: `${ROW_H}px`,
                fontSize: 10,
                color: '#a6adc8',
                whiteSpace: 'nowrap',
                cursor: editable ? 'pointer' : 'default',
                padding: '0 4px',
                marginLeft: -4,
                borderRadius: 3,
                textDecoration: editable ? 'underline dotted' : 'none',
                textDecorationColor: '#585b70',
                textUnderlineOffset: 2,
              }}
              onMouseEnter={(e) => {
                if (!editable) return;
                const el = e.currentTarget as HTMLElement;
                el.style.background = '#313244';
                el.style.color = '#cdd6f4';
              }}
              onMouseLeave={(e) => {
                if (!editable) return;
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'transparent';
                el.style.color = '#a6adc8';
              }}
            >
              {slot.name}
            </div>
          );
        })}
        {entity.signals.map((sig, i) => (
          <div
            key={sig.name}
            style={{
              position: 'absolute',
              top: BODY_PAD + i * ROW_H,
              right: 14,
              height: ROW_H,
              lineHeight: `${ROW_H}px`,
              fontSize: 10,
              color: '#cba6f7',
              textAlign: 'right',
              whiteSpace: 'nowrap',
            }}
          >
            {sig.name}
          </div>
        ))}
        {entity.slots.map((slot, i) => (
          <Handle
            key={`in-${slot.name}`}
            type="target"
            position={Position.Left}
            id={slot.name}
            style={{
              top: BODY_PAD + i * ROW_H + ROW_H / 2,
              width: 8,
              height: 8,
              background: '#585b70',
              border: '1.5px solid #313244',
              borderRadius: '50%',
            }}
          />
        ))}
        {entity.signals.map((sig, i) => (
          <Handle
            key={`out-${sig.name}`}
            type="source"
            position={Position.Right}
            id={sig.name}
            style={{
              top: BODY_PAD + i * ROW_H + ROW_H / 2,
              width: 8,
              height: 8,
              background: color,
              border: '1.5px solid #313244',
              borderRadius: '50%',
            }}
          />
        ))}
      </div>
    </div>
  );
}

const NODE_TYPES = { minisObject: MinisObjectNode };

/* ── Layout ──────────────────────────────────────────────────────────────────*/

function layoutNodes(entities: MinisEntity[], savedPositions: SavedPositions = {}): Node[] {
  const left = entities.filter((e) => e.kind === 'class' || e.kind === 'instance');
  const right = entities.filter((e) => e.kind !== 'class' && e.kind !== 'instance');
  const nodeH = (e: MinisEntity) =>
    HEADER_H + BODY_PAD * 2 + Math.max(e.signals.length, e.slots.length) * ROW_H;
  const nodes: Node[] = [];
  let yL = 0;
  for (const e of left) {
    nodes.push({
      id: e.id,
      type: 'minisObject',
      position: savedPositions[e.varName] ?? { x: 10, y: yL },
      data: { entity: e } as MinisNodeData,
    });
    yL += nodeH(e) + 24;
  }
  let yR = 0;
  for (const e of right) {
    nodes.push({
      id: e.id,
      type: 'minisObject',
      position: savedPositions[e.varName] ?? { x: 230, y: yR },
      data: { entity: e } as MinisNodeData,
    });
    yR += nodeH(e) + 24;
  }
  return nodes;
}

function connectionsToEdges(connections: ParsedConnection[], entities: MinisEntity[]): Edge[] {
  return connections.flatMap((conn) => {
    const src = entities.find((e) => e.varName === conn.sourceVar);
    const tgt = entities.find((e) => e.varName === conn.targetVar);
    if (!src || !tgt) return [];
    return [
      {
        id: conn.id,
        source: src.id,
        sourceHandle: conn.signalName ?? 'emit',
        target: tgt.id,
        targetHandle: conn.slotName,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#cba6f7' },
        style: { stroke: '#cba6f7', strokeWidth: 1.5 },
      },
    ];
  });
}

/* ── VFS picker dialog ──────────────────────────────────────────────────────*/

interface VfsEntry {
  name: string;
  isDir: boolean;
  path: string;
}
type PickerMode = 'file' | 'dir' | 'pathOrDir';

interface VfsPickerDialogProps {
  open: boolean;
  mode: PickerMode;
  title?: string;
  startPath?: string;
  /** Current value (used to highlight + expand parents on open). */
  initialValue?: string;
  onClose: () => void;
  onPick: (path: string) => void;
}

function VfsPickerDialog({
  open,
  mode,
  title,
  startPath,
  initialValue,
  onClose,
  onPick,
}: VfsPickerDialogProps) {
  const [cwd, setCwd] = useState<string>(startPath ?? '/home');
  const [entries, setEntries] = useState<VfsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    try {
      const items = await vfsReadDir(dir);
      // Sort: dirs first, alphabetically
      items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
      setEntries(
        items.map((e) => ({
          name: e.name,
          isDir: e.isDir,
          path: dir === '/' ? `/${e.name}` : `${dir}/${e.name}`,
        }))
      );
    } catch (e) {
      setError(String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Prefer initialValue if it looks like a sibling of startPath, else use startPath
    const seed =
      initialValue && initialValue.includes('/')
        ? initialValue.replace(/\/[^/]*$/, '') || '/'
        : (startPath ?? '/home');
    setCwd(seed);
    setSelected(initialValue ?? null);
    void load(seed);
  }, [open, startPath, initialValue, load]);

  useEffect(() => {
    if (open) void load(cwd);
  }, [cwd, open, load]);

  const goUp = useCallback(() => {
    if (cwd === '/' || cwd === '/home') return;
    const parent = cwd.replace(/\/[^/]+$/, '') || '/';
    setCwd(parent);
  }, [cwd]);

  const handleEntryClick = useCallback(
    (e: VfsEntry) => {
      if (e.isDir) {
        setCwd(e.path);
        if (mode === 'dir' || mode === 'pathOrDir') setSelected(e.path);
      } else {
        if (mode === 'file' || mode === 'pathOrDir') setSelected(e.path);
      }
    },
    [mode]
  );

  const canPick = selected !== null;
  const pickCurrent = mode !== 'file'; // "Pick current folder" only when dirs are valid

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #313244' } }}
    >
      <DialogTitle
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: '#cba6f7',
          py: 1,
          borderBottom: '1px solid #313244',
        }}
      >
        {title ??
          (mode === 'dir'
            ? 'Choose directory'
            : mode === 'file'
              ? 'Choose file'
              : 'Choose file or directory')}
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {/* Path bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1.5,
            py: 0.75,
            background: '#181825',
            borderBottom: '1px solid #313244',
          }}
        >
          <Tooltip title="Up one level">
            <span>
              <IconButton
                size="small"
                onClick={goUp}
                disabled={cwd === '/' || cwd === '/home'}
                sx={{ color: '#a6adc8', p: 0.25 }}
              >
                <ExpandMoreIcon sx={{ fontSize: 14, transform: 'rotate(90deg)' }} />
              </IconButton>
            </span>
          </Tooltip>
          <Typography
            sx={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: '#cdd6f4',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cwd}
          </Typography>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => load(cwd)} sx={{ color: '#a6adc8', p: 0.25 }}>
              <RefreshIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
        {/* Entries list */}
        <Box sx={{ maxHeight: 380, minHeight: 280, overflowY: 'auto', background: '#13131e' }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={20} sx={{ color: '#cba6f7' }} />
            </Box>
          )}
          {error && (
            <Typography sx={{ fontSize: 11, color: '#f38ba8', px: 2, py: 2 }}>{error}</Typography>
          )}
          {!loading && !error && entries.length === 0 && (
            <Typography sx={{ fontSize: 11, color: '#45475a', px: 2, py: 2 }}>(empty)</Typography>
          )}
          {!loading &&
            entries.map((e) => {
              const isSel = selected === e.path;
              const dimFile = mode === 'dir' && !e.isDir;
              return (
                <Box
                  key={e.path}
                  onClick={() => handleEntryClick(e)}
                  onDoubleClick={() => {
                    if (!e.isDir && (mode === 'file' || mode === 'pathOrDir')) {
                      onPick(e.path);
                      onClose();
                    }
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.5,
                    cursor: dimFile ? 'default' : 'pointer',
                    opacity: dimFile ? 0.4 : 1,
                    background: isSel ? '#2d2040' : 'transparent',
                    '&:hover': { background: dimFile ? 'transparent' : '#181825' },
                    borderLeft: isSel ? '2px solid #cba6f7' : '2px solid transparent',
                  }}
                >
                  {e.isDir ? (
                    <FolderIcon sx={{ fontSize: 14, color: '#fab387' }} />
                  ) : (
                    <InsertDriveFileIcon sx={{ fontSize: 14, color: '#89dceb' }} />
                  )}
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: dimFile ? '#45475a' : '#cdd6f4',
                    }}
                  >
                    {e.name}
                  </Typography>
                </Box>
              );
            })}
        </Box>
        {/* Selection bar */}
        <Box
          sx={{
            px: 1.5,
            py: 0.75,
            background: '#181825',
            borderTop: '1px solid #313244',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography sx={{ fontSize: 10, color: '#6c7086' }}>Selected:</Typography>
          <Typography
            sx={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: selected ? '#a6e3a1' : '#45475a',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selected ?? '(none)'}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ borderTop: '1px solid #313244', px: 1.5, py: 0.75, gap: 1 }}>
        {pickCurrent && (
          <Button
            size="small"
            onClick={() => {
              onPick(cwd);
              onClose();
            }}
            sx={{ fontSize: 10, color: '#89dceb', textTransform: 'none' }}
          >
            Pick current folder
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          onClick={onClose}
          sx={{ fontSize: 10, color: '#6c7086', textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          size="small"
          disabled={!canPick}
          onClick={() => {
            if (selected) {
              onPick(selected);
              onClose();
            }
          }}
          sx={{ fontSize: 10, color: '#a6e3a1', textTransform: 'none' }}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ── Property widgets ────────────────────────────────────────────────────────*/

interface PropertyRowProps {
  def: PropertyDef;
  value: string | number | boolean;
  onCommit: (literal: string) => void;
  color: string;
}

const FIELD_SX = {
  '& .MuiInputBase-root': { fontSize: 11, background: '#1e1e2e', color: '#cdd6f4' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
  '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#cba6f7' },
  '& input, & textarea': { py: 0.5, px: 1, fontFamily: 'monospace' },
} as const;

function PropertyRow({ def, value, onCommit, color }: PropertyRowProps) {
  const widget = deriveWidget(def);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localText, setLocalText] = useState<string>(String(value ?? ''));

  useEffect(() => {
    setLocalText(String(value ?? ''));
  }, [value, def.name]);

  const commitText = useCallback(
    (s: string) => onCommit(valueToLiteral(widget, s)),
    [widget, onCommit]
  );
  const commitNum = useCallback(
    (n: number) => onCommit(valueToLiteral(widget, n)),
    [widget, onCommit]
  );
  const commitBool = useCallback(
    (b: boolean) => onCommit(valueToLiteral('boolean', b)),
    [onCommit]
  );

  const inputSx = FIELD_SX;
  const labelSx = { fontSize: 10, color: '#6c7086', mb: 0.25 };

  const renderControl = () => {
    switch (widget) {
      case 'boolean':
        return (
          <Switch
            size="small"
            checked={Boolean(value)}
            onChange={(e) => commitBool(e.target.checked)}
            sx={{
              '& .MuiSwitch-thumb': { background: color },
              '& .Mui-checked + .MuiSwitch-track': { background: `${color}88 !important` },
            }}
          />
        );
      case 'select': {
        const opts = effectiveOptions(def);
        return (
          <FormControl size="small" fullWidth>
            <Select
              value={String(value ?? '')}
              onChange={(e) => commitText(String(e.target.value))}
              displayEmpty
              MenuProps={{
                PaperProps: {
                  sx: { background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #313244' },
                },
              }}
              sx={{
                fontSize: 11,
                background: '#1e1e2e',
                color: '#cdd6f4',
                fontFamily: 'monospace',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cba6f7' },
                '& .MuiSelect-select': { py: 0.5, px: 1 },
              }}
            >
              {opts.map((o) => (
                <MenuItem
                  key={o}
                  value={o}
                  sx={{
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: '#cdd6f4',
                    '&:hover': { background: '#313244' },
                  }}
                >
                  {o}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      }
      case 'slider': {
        const min = def.min ?? 0;
        const max = def.max ?? 100;
        const step = def.step ?? 1;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Slider
              size="small"
              min={min}
              max={max}
              step={step}
              value={typeof value === 'number' ? value : Number(value) || 0}
              onChange={(_e, v) => commitNum(Array.isArray(v) ? v[0] : v)}
              sx={{ color, flex: 1, '& .MuiSlider-rail': { color: '#313244' } }}
            />
            <TextField
              size="small"
              value={String(value ?? '')}
              type="number"
              onChange={(e) => commitNum(Number(e.target.value) || 0)}
              sx={{ ...inputSx, width: 70 }}
            />
          </Box>
        );
      }
      case 'number':
        return (
          <TextField
            size="small"
            fullWidth
            type="number"
            value={localText}
            onChange={(e) => {
              setLocalText(e.target.value);
              commitNum(Number(e.target.value) || 0);
            }}
            inputProps={{ min: def.min, max: def.max, step: def.step ?? 'any' }}
            sx={inputSx}
          />
        );
      case 'multiline':
        return (
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onBlur={() => commitText(localText)}
            sx={inputSx}
          />
        );
      case 'color':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              value={localText}
              onChange={(e) => setLocalText(e.target.value)}
              onBlur={() => commitText(localText)}
              sx={inputSx}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: '2px',
                        background: localText || '#000',
                        border: '1px solid #313244',
                      }}
                    />
                  </InputAdornment>
                ),
              }}
            />
            <input
              type="color"
              value={(() => {
                const m = localText.match(/^#([0-9a-fA-F]{6})/);
                return m ? `#${m[1]}` : '#000000';
              })()}
              onChange={(e) => {
                const v = e.target.value;
                setLocalText(v);
                commitText(v);
              }}
              style={{
                width: 22,
                height: 22,
                border: '1px solid #313244',
                background: '#1e1e2e',
                cursor: 'pointer',
              }}
            />
          </Box>
        );
      case 'datetime': {
        const ms = typeof value === 'number' ? value : Number(value) || 0;
        const iso = ms > 0 ? new Date(ms).toISOString().slice(0, 16) : '';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              type="datetime-local"
              value={iso}
              onChange={(e) => commitNum(e.target.value ? Date.parse(e.target.value) : 0)}
              sx={inputSx}
            />
            <Tooltip title="Clear">
              <IconButton
                size="small"
                onClick={() => commitNum(0)}
                sx={{ color: '#6c7086', p: 0.25 }}
              >
                <CloseIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          </Box>
        );
      }
      case 'csv': {
        const tokens = String(value ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        return (
          <Box>
            <TextField
              size="small"
              fullWidth
              value={localText}
              onChange={(e) => setLocalText(e.target.value)}
              onBlur={() => commitText(localText)}
              placeholder="comma-separated"
              sx={inputSx}
            />
            {tokens.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25, mt: 0.5 }}>
                {tokens.map((t, i) => (
                  <Chip
                    key={`${t}-${i}`}
                    label={t}
                    size="small"
                    onDelete={() => {
                      const next = tokens.filter((_, j) => j !== i).join(',');
                      setLocalText(next);
                      commitText(next);
                    }}
                    sx={{
                      fontSize: 9,
                      height: 16,
                      bgcolor: '#2d2040',
                      color: '#cdd6f4',
                      '& .MuiChip-deleteIcon': { fontSize: 12, color: '#6c7086' },
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>
        );
      }
      case 'regex': {
        let bad = false;
        try {
          if (localText) new RegExp(localText);
        } catch {
          bad = true;
        }
        return (
          <TextField
            size="small"
            fullWidth
            value={localText}
            error={bad}
            onChange={(e) => setLocalText(e.target.value)}
            onBlur={() => commitText(localText)}
            placeholder="JS regex"
            helperText={bad ? 'invalid regex' : undefined}
            FormHelperTextProps={{ sx: { fontSize: 9, color: '#f38ba8', mx: 0.5, mt: 0.25 } }}
            sx={{
              ...inputSx,
              '& .MuiInputBase-root.Mui-error .MuiOutlinedInput-notchedOutline': {
                borderColor: '#f38ba8',
              },
            }}
          />
        );
      }
      case 'dirpath':
      case 'filepath':
      case 'pathOrDir':
        return (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TextField
                size="small"
                fullWidth
                value={localText}
                onChange={(e) => setLocalText(e.target.value)}
                onBlur={() => commitText(localText)}
                placeholder={
                  widget === 'dirpath'
                    ? '/path/to/dir'
                    : widget === 'filepath'
                      ? '/path/to/file'
                      : '/path/to/file-or-dir'
                }
                sx={inputSx}
              />
              <Tooltip
                title={
                  widget === 'dirpath'
                    ? 'Browse directory'
                    : widget === 'filepath'
                      ? 'Browse file'
                      : 'Browse file or directory'
                }
              >
                <IconButton
                  size="small"
                  onClick={() => setPickerOpen(true)}
                  sx={{ color: '#cba6f7', p: 0.25 }}
                >
                  <FolderOpenIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>
            <VfsPickerDialog
              open={pickerOpen}
              mode={widget === 'dirpath' ? 'dir' : widget === 'filepath' ? 'file' : 'pathOrDir'}
              startPath={
                def.startPath ??
                (localText.includes('/') ? localText.replace(/\/[^/]*$/, '') : '/home')
              }
              initialValue={localText || undefined}
              onClose={() => setPickerOpen(false)}
              onPick={(p) => {
                // VFS returns "/home/app/node/MyProj/src/x.ts" (browser-side VFS path)
                // but Node.js runtime resolves paths against process.cwd() — usually
                // the project root. Convert to "./src/x.ts" so `npm run start` /
                // `tsx src/main.ts` can find the file regardless of where the
                // user's MyCastle workspace lives on disk.
                const projectRoot = _state.uri ? deriveProjectRoot(_state.uri) : '';
                let normalised = p;
                if (projectRoot && p.startsWith(projectRoot + '/')) {
                  normalised = './' + p.slice(projectRoot.length + 1);
                }
                setLocalText(normalised);
                commitText(normalised);
              }}
            />
          </>
        );
      case 'text':
      default:
        return (
          <TextField
            size="small"
            fullWidth
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onBlur={() => commitText(localText)}
            sx={inputSx}
          />
        );
    }
  };

  // Boolean rows put the toggle inline with the label for compactness
  if (widget === 'boolean') {
    return (
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.25 }}
      >
        <Box>
          <Typography sx={{ fontSize: 11, color: '#cdd6f4', fontFamily: 'monospace' }}>
            {def.name}
          </Typography>
          {def.description && (
            <Typography sx={{ fontSize: 9, color: '#6c7086' }}>{def.description}</Typography>
          )}
        </Box>
        {renderControl()}
      </Box>
    );
  }

  return (
    <Box>
      <Typography sx={labelSx}>
        <span style={{ fontFamily: 'monospace', color: '#a6adc8' }}>{def.name}</span>
        <span style={{ color: '#45475a' }}>: {def.type}</span>
      </Typography>
      {renderControl()}
      {def.description && (
        <Typography sx={{ fontSize: 9, color: '#6c7086', mt: 0.25 }}>{def.description}</Typography>
      )}
    </Box>
  );
}

/* ── Properties panel ────────────────────────────────────────────────────────*/

function PropertiesPanel({ entity, onClose }: { entity: MinisEntity; onClose: () => void }) {
  const color = KIND_COLOR[entity.kind] ?? '#4fc3f7';
  const icon = KIND_ICON[entity.kind] ?? '📦';

  // Local draft values: initialise from parsed constructorArgs
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const def of entity.paramDefs) {
      init[def.key] = entity.constructorArgs[def.argIndex] ?? '';
    }
    return init;
  });

  // Re-init when entity changes (different node selected)
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const def of entity.paramDefs) {
      init[def.key] = entity.constructorArgs[def.argIndex] ?? '';
    }
    setDrafts(init);
  }, [entity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    (def: ParamDef, value: string) => {
      setDrafts((d) => ({ ...d, [def.key]: value }));
      // Patch source code immediately — always read live model content, not debounced _state.currentCode
      const { uri } = _state;
      if (!uri) return;
      const model = getEditorModel(uri);
      if (!model) return;
      const patched = patchConstructorArg(model.getValue(), entity.varName, def.argIndex, value);
      if (!patched) return;
      replaceModelContent(model, patched);
    },
    [entity.varName]
  );

  // Patch a single `varName.propName.value = …` assignment in the source.
  // The next parse cycle picks the new literal up automatically — no local state needed.
  const handlePropertyCommit = useCallback(
    (propName: string, newLiteral: string) => {
      const { uri } = _state;
      if (!uri) return;
      const model = getEditorModel(uri);
      if (!model) return;
      const patched = patchPropertyValue(model.getValue(), entity.varName, propName, newLiteral);
      if (!patched) return;
      replaceModelContent(model, patched);
    },
    [entity.varName]
  );

  return (
    <Box sx={{ borderTop: '1px solid #313244', background: '#13131e' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, gap: 1 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entity.label}
        </Typography>
        <Tooltip title="Close properties">
          <IconButton size="small" onClick={onClose} sx={{ color: '#45475a', p: 0.25 }}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider sx={{ borderColor: '#313244' }} />

      {entity.paramDefs.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: '#45475a', px: 1.5, py: 1 }}>
          No configurable parameters.
        </Typography>
      ) : (
        <Box sx={{ px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {entity.paramDefs.map((def) => (
            <Box key={def.key}>
              <Typography sx={{ fontSize: 10, color: '#6c7086', mb: 0.25 }}>
                {def.label}
                {def.hint ? ` (${def.hint})` : ''}
              </Typography>
              {def.type === 'select' && def.options ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {def.options.map((opt) => (
                    <Chip
                      key={opt}
                      label={opt.replace(/'/g, '')}
                      size="small"
                      onClick={() => handleChange(def, opt)}
                      sx={{
                        fontSize: 10,
                        height: 20,
                        cursor: 'pointer',
                        bgcolor: drafts[def.key] === opt ? color + '33' : '#1e1e2e',
                        color: drafts[def.key] === opt ? color : '#6c7086',
                        border: `1px solid ${drafts[def.key] === opt ? color + '88' : '#313244'}`,
                      }}
                    />
                  ))}
                </Box>
              ) : (
                <TextField
                  size="small"
                  fullWidth
                  value={drafts[def.key] ?? ''}
                  type={def.type === 'number' ? 'number' : 'text'}
                  onChange={(e) => handleChange(def, e.target.value)}
                  sx={{
                    '& .MuiInputBase-root': {
                      fontSize: 11,
                      background: '#1e1e2e',
                      color: '#cdd6f4',
                    },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
                    '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: color + '88',
                    },
                    '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: color,
                    },
                    '& input': { py: 0.5, px: 1 },
                  }}
                />
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Properties (live Property.value editor) */}
      {entity.properties.length > 0 && (
        <>
          <Divider sx={{ borderColor: '#1e1e2e' }} />
          <Typography
            sx={{
              fontSize: 9,
              color: '#45475a',
              letterSpacing: 1,
              textTransform: 'uppercase',
              px: 1.5,
              pt: 0.75,
            }}
          >
            Properties
          </Typography>
          <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {entity.properties.map((prop) => {
              const widget = deriveWidget(prop);
              const literal = entity.propertyValues[prop.name] ?? prop.default;
              const value = literalToValue(widget, literal);
              return (
                <PropertyRow
                  key={prop.name}
                  def={prop}
                  value={value}
                  color={color}
                  onCommit={(newLit) => handlePropertyCommit(prop.name, newLit)}
                />
              );
            })}
          </Box>
        </>
      )}

      {/* Signals & Slots summary */}
      {(entity.signals.length > 0 || entity.slots.length > 0) && (
        <>
          <Divider sx={{ borderColor: '#1e1e2e' }} />
          <Box sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 2 }}>
            {entity.signals.length > 0 && (
              <Box>
                <Typography
                  sx={{
                    fontSize: 9,
                    color: '#45475a',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    mb: 0.5,
                  }}
                >
                  Signals
                </Typography>
                {entity.signals.map((s) => (
                  <Typography
                    key={s.name}
                    sx={{ fontSize: 10, color: '#cba6f7', fontFamily: 'monospace' }}
                  >
                    {s.name}
                  </Typography>
                ))}
              </Box>
            )}
            {entity.slots.length > 0 && (
              <Box>
                <Typography
                  sx={{
                    fontSize: 9,
                    color: '#45475a',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    mb: 0.5,
                  }}
                >
                  Slots
                </Typography>
                {entity.slots.map((s) => (
                  <Typography
                    key={s.name}
                    sx={{ fontSize: 10, color: '#a6adc8', fontFamily: 'monospace' }}
                  >
                    {s.name}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

/* ── Snippet row ─────────────────────────────────────────────────────────────*/

function SnippetRow({ snippet }: { snippet: Snippet }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(snippet.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [snippet.code]);
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.25,
        borderBottom: '1px solid #1e1e2e',
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      <Chip
        label={snippet.inserted ? 'inserted' : 'copy'}
        size="small"
        sx={{
          fontSize: 9,
          height: 14,
          bgcolor: snippet.inserted ? '#1e3a2e' : '#2d2040',
          color: snippet.inserted ? '#a6e3a1' : '#cba6f7',
          border: 'none',
          mr: 0.5,
        }}
      />
      <Typography
        sx={{
          flex: 1,
          fontSize: 10,
          fontFamily: '"Fira Code","Cascadia Code",monospace',
          color: '#cdd6f4',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {snippet.code}
      </Typography>
      <Tooltip title={copied ? 'Copied!' : 'Copy'} placement="top">
        <IconButton size="small" onClick={handleCopy} sx={{ color: '#6c7086', p: 0.25 }}>
          {copied ? <CheckIcon sx={{ fontSize: 12 }} /> : <ContentCopyIcon sx={{ fontSize: 12 }} />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}

/* ── Add-node templates ──────────────────────────────────────────────────────*/

function generateExternalSnippet(className: string, paramDefs: ParamDef[]): string {
  const maxIdx = paramDefs.reduce((m, p) => Math.max(m, p.argIndex), -1);
  const args: string[] = new Array(maxIdx + 1).fill('undefined');
  for (const p of paramDefs) {
    args[p.argIndex] =
      p.type === 'number' ? '0' : p.type === 'boolean' ? 'false' : (p.options?.[0] ?? `''`);
  }
  const varName = className.charAt(0).toLowerCase() + className.slice(1);
  return `const ${varName} = new ${className}(${args.join(', ')});`;
}

function generateVarName(prefix: string, taken: Set<string>): string {
  if (!taken.has(prefix)) return prefix;
  let i = 1;
  while (taken.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/* ── Export manifest button ──────────────────────────────────────────────────*/

type ExportState = 'idle' | 'saving' | 'saved' | 'error';

function ExportManifestButton({ uri, entities }: { uri: string; entities: MinisEntity[] }) {
  const [status, setStatus] = useState<ExportState>('idle');
  const classCount = entities.filter((e) => e.kind === 'class').length;

  const handleExport = useCallback(async () => {
    if (!uri || uri.startsWith('virtual://') || classCount === 0) return;
    setStatus('saving');
    try {
      const json = generateManifest(entities);
      await saveManifestToVfs(uri, json);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [uri, entities, classCount]);

  const label =
    status === 'saving'
      ? 'Saving…'
      : status === 'saved'
        ? 'Saved!'
        : status === 'error'
          ? 'Error!'
          : 'Export manifest';

  const color = status === 'saved' ? '#a6e3a1' : status === 'error' ? '#f38ba8' : '#89dceb';

  return (
    <Tooltip
      title={
        classCount === 0 ? 'No class definitions found' : 'Write minislib-plugin.json next to src/'
      }
      placement="bottom"
    >
      <span>
        <Button
          size="small"
          startIcon={
            status === 'saved' ? (
              <CheckIcon sx={{ fontSize: 13 }} />
            ) : (
              <DownloadIcon sx={{ fontSize: 13 }} />
            )
          }
          onClick={handleExport}
          disabled={classCount === 0 || status === 'saving'}
          sx={{
            fontSize: 11,
            color,
            textTransform: 'none',
            py: 0.25,
            px: 1,
            minWidth: 0,
            '&:hover': { background: '#1e3a3a' },
            '&.Mui-disabled': { color: '#45475a' },
          }}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}

/* ── Path Builder type system ────────────────────────────────────────────────
 *
 * Powers the IntelliSense-style picker that drives `minis_var_*` blocks: given
 * a starting type (e.g. `User`, `Array<Item>`, `Property<number>`,
 * `{ id: number; name: string }`), enumerate its members so the user can
 * click through `name → field/method → sub-member` without typing TS by hand.
 *
 * Members come from five sources, tried in order:
 *   1. Inline object literals `{ a: T; b: T }` — parsed from the type string
 *   2. Array shape (`T[]`, `Array<T>`)                    → array methods + [0]: T
 *   3. Map/Set generics (`Map<K, V>`, `Set<T>`)           → corresponding methods
 *   4. Class entity in the current file (state.entities)  → signals + slots + vars + props
 *   5. External manifest                                  → signals + slots + props
 *   6. Interface / type alias in the current source       → parsed regex
 *   7. Builtin TS scalars (Date, String, Number)          → hardcoded shortlist
 *
 * No TypeScript compiler API in scope — everything regex-based. Accepts that
 * exotic shapes (conditional types, mapped types, complex unions) won't
 * resolve and fall back to an empty member list; in that case the dialog
 * still lets the user type the path manually as a fallback.
 */

export interface PathMember {
  name: string;
  /** field / method / signal / slot / index access */
  kind: 'field' | 'method' | 'signal' | 'slot' | 'index';
  /** Result type after dotting into this member — feeds the next picker step. */
  resultType?: string;
  /** Pretty-print signature for methods — e.g. "(x: number): void" */
  signature?: string;
  /** Source label, for tooltips ("from @hestia/core", "interface User") */
  source?: string;
}

/** Strip union with null/undefined and outer optionality markers. */
function normalizeType(t: string): string {
  let s = t.trim();
  // Drop trailing comments
  s = s.replace(/\s*\/\/.*$/, '').trim();
  // | null | undefined removal
  s = s
    .replace(/\s*\|\s*null\b/g, '')
    .replace(/\s*\|\s*undefined\b/g, '')
    .trim();
  // Outer parens
  while (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1).trim();
  return s;
}

/** Detect `T[]` / `Array<T>` / `ReadonlyArray<T>`. Returns element type or null. */
function arrayElementType(t: string): string | null {
  const n = normalizeType(t);
  let m = /^(.+)\[\]$/.exec(n);
  if (m) return normalizeType(m[1]);
  m = /^(?:Readonly)?Array<(.+)>$/.exec(n);
  if (m) return normalizeType(m[1]);
  return null;
}

/** Detect `Map<K, V>` — returns [K, V] or null. */
function mapTypeArgs(t: string): [string, string] | null {
  const n = normalizeType(t);
  const m = /^Map<\s*(.+?)\s*,\s*(.+)\s*>$/.exec(n);
  if (!m) return null;
  return [normalizeType(m[1]), normalizeType(m[2])];
}

/** Detect `Set<T>` — returns element type or null. */
function setElementType(t: string): string | null {
  const n = normalizeType(t);
  const m = /^Set<(.+)>$/.exec(n);
  return m ? normalizeType(m[1]) : null;
}

/** Detect generic with single argument like `Property<T>`, `Signal<T>`. */
function singleGenericArg(t: string): { wrapper: string; arg: string } | null {
  const n = normalizeType(t);
  const m = /^(\w+)<(.+)>$/.exec(n);
  return m ? { wrapper: m[1], arg: normalizeType(m[2]) } : null;
}

/** Inline object literal `{ a: T; b: T }` → list of members. */
function parseInlineObject(t: string): PathMember[] | null {
  const n = normalizeType(t);
  if (!n.startsWith('{') || !n.endsWith('}')) return null;
  const body = n.slice(1, -1);
  const members: PathMember[] = [];
  // Split on `;` or `,` at depth-0 only — handles `{ a: number; nested: { x: 1 } }`.
  const parts: string[] = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '<' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === '>' || c === ')' || c === ']') depth--;
    else if (depth === 0 && (c === ';' || c === ',')) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  for (const part of parts) {
    const m = /^\s*(\w+)\??\s*:\s*(.+?)\s*$/.exec(part);
    if (m) members.push({ name: m[1], kind: 'field', resultType: m[2].trim() });
  }
  return members.length ? members : null;
}

/** Parse an interface or type alias body from raw source. */
function parseInterfaceFromSource(code: string, typeName: string): PathMember[] | null {
  const esc = typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // interface Foo { … }
  let body: string | null;
  const ifaceRe = new RegExp(`interface\\s+${esc}\\b[^{]*\\{`);
  const ifaceMatch = ifaceRe.exec(code);
  if (ifaceMatch) {
    body = extractClassBody(code, ifaceMatch.index + ifaceMatch[0].length - 1);
  } else {
    // type Foo = { … }
    const typeRe = new RegExp(`type\\s+${esc}\\b[^=]*=\\s*\\{`);
    const typeMatch = typeRe.exec(code);
    if (typeMatch) {
      body = extractClassBody(code, typeMatch.index + typeMatch[0].length - 1);
    } else {
      return null;
    }
  }
  return parseInlineObject(`{${body}}`);
}

/** Hardcoded shortlist of common builtin TS types — fallback intellisense. */
const BUILTIN_TYPE_MEMBERS: Record<string, PathMember[]> = {
  Date: [
    { name: 'getTime', kind: 'method', signature: '(): number', resultType: 'number' },
    { name: 'toISOString', kind: 'method', signature: '(): string', resultType: 'string' },
    { name: 'toLocaleString', kind: 'method', signature: '(): string', resultType: 'string' },
    { name: 'toLocaleDateString', kind: 'method', signature: '(): string', resultType: 'string' },
    { name: 'toLocaleTimeString', kind: 'method', signature: '(): string', resultType: 'string' },
    { name: 'getFullYear', kind: 'method', signature: '(): number', resultType: 'number' },
    { name: 'getMonth', kind: 'method', signature: '(): number', resultType: 'number' },
    { name: 'getDate', kind: 'method', signature: '(): number', resultType: 'number' },
    { name: 'getHours', kind: 'method', signature: '(): number', resultType: 'number' },
    { name: 'getMinutes', kind: 'method', signature: '(): number', resultType: 'number' },
    { name: 'getSeconds', kind: 'method', signature: '(): number', resultType: 'number' },
  ],
  String: [
    { name: 'length', kind: 'field', resultType: 'number' },
    { name: 'toLowerCase', kind: 'method', signature: '(): string', resultType: 'string' },
    { name: 'toUpperCase', kind: 'method', signature: '(): string', resultType: 'string' },
    { name: 'trim', kind: 'method', signature: '(): string', resultType: 'string' },
    { name: 'split', kind: 'method', signature: '(sep: string): string[]', resultType: 'string[]' },
    {
      name: 'startsWith',
      kind: 'method',
      signature: '(s: string): boolean',
      resultType: 'boolean',
    },
    { name: 'endsWith', kind: 'method', signature: '(s: string): boolean', resultType: 'boolean' },
    { name: 'includes', kind: 'method', signature: '(s: string): boolean', resultType: 'boolean' },
    { name: 'indexOf', kind: 'method', signature: '(s: string): number', resultType: 'number' },
    {
      name: 'replace',
      kind: 'method',
      signature: '(a: string, b: string): string',
      resultType: 'string',
    },
    {
      name: 'slice',
      kind: 'method',
      signature: '(from?: number, to?: number): string',
      resultType: 'string',
    },
    { name: 'charAt', kind: 'method', signature: '(i: number): string', resultType: 'string' },
    { name: 'concat', kind: 'method', signature: '(...s: string[]): string', resultType: 'string' },
  ],
  Number: [
    { name: 'toString', kind: 'method', signature: '(): string', resultType: 'string' },
    { name: 'toFixed', kind: 'method', signature: '(n: number): string', resultType: 'string' },
    { name: 'toPrecision', kind: 'method', signature: '(n: number): string', resultType: 'string' },
  ],
};
const ARRAY_MEMBERS = (elem: string): PathMember[] => [
  { name: 'length', kind: 'field', resultType: 'number' },
  { name: '[0]', kind: 'index', signature: `[i: number]: ${elem}`, resultType: elem },
  { name: 'push', kind: 'method', signature: `(item: ${elem}): number`, resultType: 'number' },
  {
    name: 'pop',
    kind: 'method',
    signature: `(): ${elem} | undefined`,
    resultType: `${elem} | undefined`,
  },
  {
    name: 'shift',
    kind: 'method',
    signature: `(): ${elem} | undefined`,
    resultType: `${elem} | undefined`,
  },
  { name: 'unshift', kind: 'method', signature: `(item: ${elem}): number`, resultType: 'number' },
  {
    name: 'find',
    kind: 'method',
    signature: `(fn): ${elem} | undefined`,
    resultType: `${elem} | undefined`,
  },
  { name: 'filter', kind: 'method', signature: `(fn): ${elem}[]`, resultType: `${elem}[]` },
  { name: 'map', kind: 'method', signature: '(fn): unknown[]', resultType: 'unknown[]' },
  { name: 'forEach', kind: 'method', signature: '(fn): void', resultType: 'void' },
  { name: 'slice', kind: 'method', signature: `(from?, to?): ${elem}[]`, resultType: `${elem}[]` },
  { name: 'join', kind: 'method', signature: '(sep?: string): string', resultType: 'string' },
  { name: 'indexOf', kind: 'method', signature: `(item: ${elem}): number`, resultType: 'number' },
  {
    name: 'includes',
    kind: 'method',
    signature: `(item: ${elem}): boolean`,
    resultType: 'boolean',
  },
  { name: 'reverse', kind: 'method', signature: `(): ${elem}[]`, resultType: `${elem}[]` },
  { name: 'sort', kind: 'method', signature: `(): ${elem}[]`, resultType: `${elem}[]` },
];
const MAP_MEMBERS = (k: string, v: string): PathMember[] => [
  { name: 'size', kind: 'field', resultType: 'number' },
  {
    name: 'get',
    kind: 'method',
    signature: `(key: ${k}): ${v} | undefined`,
    resultType: `${v} | undefined`,
  },
  {
    name: 'set',
    kind: 'method',
    signature: `(key: ${k}, value: ${v}): Map<${k}, ${v}>`,
    resultType: `Map<${k}, ${v}>`,
  },
  { name: 'has', kind: 'method', signature: `(key: ${k}): boolean`, resultType: 'boolean' },
  { name: 'delete', kind: 'method', signature: `(key: ${k}): boolean`, resultType: 'boolean' },
  { name: 'clear', kind: 'method', signature: '(): void', resultType: 'void' },
  {
    name: 'keys',
    kind: 'method',
    signature: `(): IterableIterator<${k}>`,
    resultType: `IterableIterator<${k}>`,
  },
  {
    name: 'values',
    kind: 'method',
    signature: `(): IterableIterator<${v}>`,
    resultType: `IterableIterator<${v}>`,
  },
];
const SET_MEMBERS = (t: string): PathMember[] => [
  { name: 'size', kind: 'field', resultType: 'number' },
  { name: 'add', kind: 'method', signature: `(item: ${t}): Set<${t}>`, resultType: `Set<${t}>` },
  { name: 'has', kind: 'method', signature: `(item: ${t}): boolean`, resultType: 'boolean' },
  { name: 'delete', kind: 'method', signature: `(item: ${t}): boolean`, resultType: 'boolean' },
  { name: 'clear', kind: 'method', signature: '(): void', resultType: 'void' },
];

/** Members of an entity (class in current file). */
function classEntityMembers(entity: MinisEntity): PathMember[] {
  const out: PathMember[] = [];
  for (const v of entity.variables ?? [])
    out.push({
      name: v.name,
      kind: 'field',
      resultType: v.type,
      source: `class ${entity.varName}`,
    });
  for (const p of entity.properties ?? [])
    out.push({
      name: p.name,
      kind: 'field',
      resultType: `Property<${p.type ?? 'unknown'}>`,
      source: `class ${entity.varName}`,
    });
  for (const s of entity.signals) {
    if (s.name.includes('.')) continue; // skip "<prop>.changed" pseudo-signals
    out.push({
      name: s.name,
      kind: 'signal',
      resultType: `Signal<[${s.type || ''}]>`,
      source: `class ${entity.varName}`,
    });
  }
  for (const s of entity.slots) {
    out.push({
      name: s.name,
      kind: 'slot',
      signature: `(${formatParamList(s.params ?? [])}): void`,
      resultType: 'void',
      source: `class ${entity.varName}`,
    });
  }
  return out;
}

/** Members of an external class manifest entry. */
function externalClassMembers(entry: ExternalClassEntry): PathMember[] {
  const out: PathMember[] = [];
  for (const p of entry.def.properties ?? [])
    out.push({
      name: p.name,
      kind: 'field',
      resultType: `Property<${p.type ?? 'unknown'}>`,
      source: entry.packageName,
    });
  for (const s of entry.def.signals)
    out.push({
      name: s.name,
      kind: 'signal',
      resultType: `Signal<[${s.type || ''}]>`,
      source: entry.packageName,
    });
  for (const s of entry.def.slots)
    out.push({
      name: s.name,
      kind: 'slot',
      signature: '(v): void',
      resultType: 'void',
      source: entry.packageName,
    });
  return out;
}

/**
 * Top-level resolver — given a type string and the plugin's current state,
 * return the list of clickable members. Empty array means "no introspection
 * available — fall back to free-text path entry".
 */
function resolveTypeMembers(typeStr: string, state: PluginState): PathMember[] {
  if (!typeStr) return [];
  const norm = normalizeType(typeStr);

  // 1. Inline object — `{ a: T; b: T }`
  const inline = parseInlineObject(norm);
  if (inline) return inline;

  // 2. Array
  const elem = arrayElementType(norm);
  if (elem) return ARRAY_MEMBERS(elem);

  // 3. Map
  const map = mapTypeArgs(norm);
  if (map) return MAP_MEMBERS(map[0], map[1]);

  // 4. Set
  const set = setElementType(norm);
  if (set) return SET_MEMBERS(set);

  // 5. Single-arg generic — `Property<T>` reveals `.value: T` and `.changed`
  const gen = singleGenericArg(norm);
  if (gen) {
    if (gen.wrapper === 'Property') {
      return [
        { name: 'value', kind: 'field', resultType: gen.arg, source: '@hestia/core' },
        {
          name: 'changed',
          kind: 'signal',
          resultType: `Signal<[${gen.arg}]>`,
          source: '@hestia/core',
        },
      ];
    }
    if (gen.wrapper === 'Signal') {
      return [
        {
          name: 'emit',
          kind: 'method',
          signature: `(v: ${gen.arg}): void`,
          resultType: 'void',
          source: '@hestia/core',
        },
        {
          name: 'connect',
          kind: 'method',
          signature: `(fn: (v: ${gen.arg}) => void): void`,
          resultType: 'void',
          source: '@hestia/core',
        },
        {
          name: 'disconnect',
          kind: 'method',
          signature: '(fn): void',
          resultType: 'void',
          source: '@hestia/core',
        },
      ];
    }
    // Unknown generic — try its base name as a plain identifier (line below).
  }

  // 6. Plain identifier — file class, external class, interface, builtin
  const fileClass = state.entities.find((e) => e.varName === norm && e.kind === 'class');
  if (fileClass) return classEntityMembers(fileClass);

  const ext = state.externalClassDefs.find((e) => e.className === norm);
  if (ext) return externalClassMembers(ext);

  const iface = parseInterfaceFromSource(state.currentCode, norm);
  if (iface) return iface;

  if (BUILTIN_TYPE_MEMBERS[norm]) return BUILTIN_TYPE_MEMBERS[norm];

  return [];
}

/** Convert a `PathMember` into the code suffix it inserts. */
function memberToPathSegment(m: PathMember): string {
  if (m.kind === 'index') return '[0]';
  if (m.kind === 'method' || m.kind === 'slot') return `.${m.name}()`;
  return `.${m.name}`;
}

/** Argument list parsed from a method/slot signature, e.g. `(a: number, b: string): void`.
 *  Returns `[]` when the signature has no args or can't be parsed. Used by the
 *  PathBuilderDialog to detect "trailing method call needs N value inputs". */
export interface PathArg {
  name: string;
  type: string;
}
function parseMethodArgs(signature: string | undefined): PathArg[] {
  if (!signature) return [];
  const m = /^\(([^)]*)\)/.exec(signature.trim());
  if (!m) return [];
  const inside = m[1].trim();
  if (!inside) return [];
  // Split on depth-0 commas so we don't bisect e.g. `Record<string, number>`.
  const parts: string[] = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < inside.length; i++) {
    const c = inside[i];
    if (c === '<' || c === '(' || c === '[' || c === '{') depth++;
    else if (c === '>' || c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && c === ',') {
      parts.push(inside.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inside.slice(start));
  const out: PathArg[] = [];
  for (const part of parts) {
    const am = /^\s*(\.\.\.)?(\w+)\??\s*:\s*(.+?)\s*$/.exec(part);
    if (am) {
      out.push({ name: (am[1] ?? '') + am[2], type: am[3].trim() });
      continue;
    }
    const nm = /^\s*(\.\.\.)?(\w+)\??\s*$/.exec(part);
    if (nm) out.push({ name: (nm[1] ?? '') + nm[2], type: 'unknown' });
  }
  return out;
}

/* ── Type selector helpers ───────────────────────────────────────────────────*/

interface TypeOpt {
  label: string;
  group: string;
}

const BUILTIN_TYPE_OPTS: TypeOpt[] = [
  // Primitives
  { label: 'number', group: 'Primitive' },
  { label: 'string', group: 'Primitive' },
  { label: 'boolean', group: 'Primitive' },
  { label: 'unknown', group: 'Primitive' },
  { label: 'void', group: 'Primitive' },
  { label: 'null', group: 'Primitive' },
  { label: 'undefined', group: 'Primitive' },
  // Arrays
  { label: 'number[]', group: 'Array' },
  { label: 'string[]', group: 'Array' },
  { label: 'boolean[]', group: 'Array' },
  { label: 'unknown[]', group: 'Array' },
  // Collections
  { label: 'Record<string, unknown>', group: 'Collection' },
  { label: 'Record<string, number>', group: 'Collection' },
  { label: 'Map<string, unknown>', group: 'Collection' },
  { label: 'Set<string>', group: 'Collection' },
  // Object shapes
  { label: '{ id: string; value: number }', group: 'Object' },
  { label: '{ device: string; value: number }', group: 'Object' },
  { label: '{ topic: string; payload: unknown }', group: 'Object' },
  // Unions
  { label: 'number | null', group: 'Union' },
  { label: 'string | null', group: 'Union' },
  { label: 'string | number', group: 'Union' },
  { label: 'boolean | null', group: 'Union' },
];

function defaultsForType(t: string): string[] {
  const s = t.trim();
  if (s === 'number') return ['0', '1', '-1'];
  if (s === 'string') return ["''", "'default'"];
  if (s === 'boolean') return ['false', 'true'];
  if (s === 'null') return ['null'];
  if (s === 'undefined' || s === 'unknown') return ['undefined'];
  if (s === 'void') return [];
  if (s.endsWith('[]') || s.startsWith('Array<')) return ['[]'];
  if (s.startsWith('Record') || s.startsWith('{') || s.startsWith('Map') || s.startsWith('Set'))
    return ['{}'];
  if (s.includes('| null') || s.includes('null |')) return ['null'];
  return ['undefined'];
}

const COMBO_PAPER_SX = {
  background: '#1e1e2e',
  border: '1px solid #313244',
  color: '#cdd6f4',
  '& .MuiAutocomplete-listbox': { p: 0 },
};
const COMBO_INPUT_SX = {
  '& .MuiOutlinedInput-root': {
    background: '#1e1e2e',
    color: '#cdd6f4',
    pr: '4px !important',
    '& fieldset': { borderColor: '#313244' },
    '&:hover fieldset': { borderColor: '#585b70' },
    '& input::placeholder': { color: '#585b70', opacity: 1 },
  },
};

function TypeComboBox({
  value,
  onChange,
  placeholder,
  onCommit,
  onCancel,
  fullWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onCommit?: () => void;
  onCancel?: () => void;
  /** Stretch the input to fill its parent (used inside flex rows). */
  fullWidth?: boolean;
}) {
  // Subscribe to plugin state so the class-options list updates live as the
  // file parser discovers new classes. Reading `_state` once at render time
  // (the previous behaviour) meant the dropdown opened with whatever entities
  // existed at mount — typically empty for the first time the panel appeared
  // — and only refreshed on the next typed change.
  const state = usePluginState();
  // Three sources, in priority order: classes declared in this file, classes
  // imported from other project files, and classes exported by external
  // packages (minislib's CoreObject/Signal/Property/Timer/..., user manifests).
  // Each external class lives under its package name so the user sees where it
  // came from. De-dupe by label so the same class doesn't appear twice when
  // it's both imported and exposed via manifest.
  const seen = new Set<string>();
  const classOpts: TypeOpt[] = [];
  const push = (label: string, group: string) => {
    if (seen.has(label)) return;
    seen.add(label);
    classOpts.push({ label, group });
  };
  for (const e of state.entities) {
    if (e.kind === 'class') push(e.varName, 'File classes');
  }
  for (const c of state.importedClasses) {
    push(c.className, 'Imported');
  }
  for (const e of state.externalClassDefs) {
    push(e.className, e.packageName);
    // Convenience: common generic instantiations for parameterised classes
    // (Property<T>, Signal<T>). User can still freely type any other variant
    // — Autocomplete is `freeSolo`.
    if (e.className === 'Property' || e.className === 'Signal') {
      push(`${e.className}<number>`, e.packageName);
      push(`${e.className}<string>`, e.packageName);
      push(`${e.className}<boolean>`, e.packageName);
    }
  }
  const opts = [...BUILTIN_TYPE_OPTS, ...classOpts];

  return (
    <Autocomplete
      freeSolo
      disableClearable
      options={opts}
      groupBy={(o) => (typeof o === 'string' ? '' : o.group)}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
      inputValue={value}
      onInputChange={(_, v) => onChange(v)}
      onChange={(_, v) => onChange(typeof v === 'string' ? v : v.label)}
      size="small"
      // When fullWidth: occupy parent's width with a sensible minimum so the
      // dropdown popper still has somewhere to anchor on very narrow rows.
      sx={fullWidth ? { ...COMBO_INPUT_SX, width: '100%', minWidth: 80 } : COMBO_INPUT_SX}
      slotProps={{ paper: { sx: COMBO_PAPER_SX }, popper: { placement: 'top-start' } }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder ?? 'type'}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit?.();
            if (e.key === 'Escape') onCancel?.();
          }}
          inputProps={{
            ...params.inputProps,
            style: { fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' },
          }}
        />
      )}
      renderOption={(props, o) => (
        <Box
          component="li"
          {...props}
          sx={{ fontSize: 11, fontFamily: 'monospace', py: '2px !important', px: 1.5 }}
        >
          {typeof o === 'string' ? o : o.label}
        </Box>
      )}
      renderGroup={(params) => (
        <div key={params.key}>
          <Typography
            sx={{
              fontSize: 9,
              color: '#45475a',
              px: 1.5,
              pt: 0.5,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            {params.group}
          </Typography>
          {params.children}
        </div>
      )}
    />
  );
}

function DefaultComboBox({
  typeVal,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  typeVal: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
}) {
  const opts = defaultsForType(typeVal);
  return (
    <Autocomplete
      freeSolo
      disableClearable
      options={opts}
      inputValue={value}
      onInputChange={(_, v) => onChange(v)}
      onChange={(_, v) => onChange(v ?? '')}
      size="small"
      sx={COMBO_INPUT_SX}
      slotProps={{ paper: { sx: COMBO_PAPER_SX } }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="default value"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit?.();
            if (e.key === 'Escape') onCancel?.();
          }}
          inputProps={{
            ...params.inputProps,
            style: { fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' },
          }}
        />
      )}
      renderOption={(props, o) => (
        <Box
          component="li"
          {...props}
          sx={{ fontSize: 11, fontFamily: 'monospace', py: '2px !important', px: 1.5 }}
        >
          {o}
        </Box>
      )}
    />
  );
}

/* ── Slot builder — visual block editor for slot bodies ─────────────────────*/

type StmtKind =
  | 'set-prop'
  | 'emit'
  | 'if'
  | 'if-else'
  | 'log'
  | 'declare'
  | 'assign'
  | 'return'
  | 'call'
  | 'append'
  | 'comment';

type SlotStmt =
  | { id: string; k: 'set-prop'; prop: string; expr: string }
  | { id: string; k: 'emit'; signal: string; expr: string }
  | { id: string; k: 'if'; cond: string; body: SlotStmt[] }
  | { id: string; k: 'if-else'; cond: string; then: SlotStmt[]; els: SlotStmt[] }
  | { id: string; k: 'log'; level: string; args: string }
  | { id: string; k: 'declare'; name: string; expr: string }
  | { id: string; k: 'assign'; target: string; expr: string }
  | { id: string; k: 'return'; expr: string }
  | { id: string; k: 'call'; obj: string; method: string; arg: string }
  | { id: string; k: 'append'; prop: string; item: string; maxLen: string }
  | { id: string; k: 'comment'; text: string };

let _sbId = 0;
const mkSid = () => `sb${_sbId++}`;

function mkStmt(k: StmtKind): SlotStmt {
  switch (k) {
    case 'set-prop':
      return { id: mkSid(), k, prop: '', expr: 'v' };
    case 'emit':
      return { id: mkSid(), k, signal: '', expr: 'v' };
    case 'if':
      return { id: mkSid(), k, cond: 'v > 0', body: [] };
    case 'if-else':
      return { id: mkSid(), k, cond: 'v > 0', then: [], els: [] };
    case 'log':
      return { id: mkSid(), k, level: 'log', args: 'v' };
    case 'declare':
      return { id: mkSid(), k, name: 'result', expr: 'v' };
    case 'assign':
      return { id: mkSid(), k, target: '', expr: 'v' };
    case 'return':
      return { id: mkSid(), k, expr: 'v' };
    case 'call':
      return { id: mkSid(), k, obj: 'this', method: '', arg: 'v' };
    case 'append':
      return { id: mkSid(), k, prop: '', item: 'v', maxLen: '20' };
    case 'comment':
      return { id: mkSid(), k, text: '' };
  }
}

function genStmt(s: SlotStmt, d = 2): string {
  const p = '  '.repeat(d);
  const e = (x: string) => x || '_';
  switch (s.k) {
    case 'set-prop':
      return `${p}this.${e(s.prop)}.value = ${e(s.expr)};`;
    case 'emit':
      return `${p}this.${e(s.signal)}.emit(${e(s.expr)});`;
    case 'if':
      return `${p}if (${e(s.cond)}) {\n${genStmts(s.body, d + 1)}\n${p}}`;
    case 'if-else':
      return `${p}if (${e(s.cond)}) {\n${genStmts(s.then, d + 1)}\n${p}} else {\n${genStmts(s.els, d + 1)}\n${p}}`;
    case 'log':
      return `${p}console.${s.level}(${e(s.args)});`;
    case 'declare':
      return `${p}const ${e(s.name)} = ${e(s.expr)};`;
    case 'assign':
      return `${p}${e(s.target)} = ${e(s.expr)};`;
    case 'return':
      return `${p}return ${e(s.expr)};`;
    case 'call':
      return `${p}${s.obj ? s.obj + '.' : 'this.'}${e(s.method)}(${s.arg});`;
    case 'append':
      return `${p}this.${e(s.prop)}.value = [...this.${e(s.prop)}.value${s.maxLen ? `.slice(-(${s.maxLen}-1))` : ''}, ${e(s.item)}];`;
    case 'comment':
      return `${p}// ${s.text}`;
  }
}
function genStmts(ss: SlotStmt[], d = 2): string {
  return ss.map((s) => genStmt(s, d)).join('\n') || `${'  '.repeat(d)}// empty`;
}

interface SlotCtx {
  props: string[];
  signals: string[];
  slots: string[];
  vars: string[];
  /** Parametry edytowanego slotu — źródło listy w bloczku `param`. */
  params: SignalArg[];
  /** Argumenty każdego sygnału klasy — bloczek `emit` bierze stąd liczbę wejść. */
  signalArgs: Record<string, SignalArg[]>;
  /** Parametry każdego slotu klasy — to samo dla bloczka `call`. */
  slotArgs: Record<string, SignalArg[]>;
  exprOpts: string[];
  condOpts: string[];
}

/**
 * `params` przychodzi z formularza slotu, a nie z encji: użytkownik dopisuje
 * parametr i ma go od razu widzieć w bloczkach, zanim slot trafi do pliku.
 */
function buildSlotCtx(entity: MinisEntity, params: SignalArg[] = []): SlotCtx {
  const code = _state.currentCode;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the class header WITHOUT the opening brace, then let
  // extractClassBody find the real `{` from there. The previous regex
  // included the `{` in `m[0]`, so `m.index + m[0].length` pointed PAST it
  // — extractClassBody would then scan to the next inner `{` (a method
  // body) and return that instead of the class body, so Property
  // declarations declared as class fields were never found.
  const clsMatch = new RegExp(`class\\s+${esc(entity.varName)}\\b`).exec(code);
  const body = clsMatch ? extractClassBody(code, clsMatch.index + clsMatch[0].length) : '';
  const props: string[] = [];
  let m: RegExpExecArray | null;
  // Match every common shape:
  //   readonly foo = new Property<T>(...)
  //   public foo = new Property<T>(...)
  //   private foo: Property<T> = new Property(...)
  //   foo = new Property<T>(...)
  // The old regex required `readonly`, which silently hid any property
  // declared differently — making the get/set property dropdowns empty.
  const propRe =
    /(?:readonly\s+|public\s+|private\s+|protected\s+)?(\w+)\s*(?:!?\s*:\s*Property<[^>]*>\s*)?=\s*new\s+Property\b/g;
  // Common reserved/dangerous identifiers that the regex above could pick up
  // on the right side of an `=` (e.g. `const foo = new Property(...)` inside
  // a method body). Skip them to keep the dropdown clean.
  const skip = new Set(['const', 'let', 'var', 'return', 'this', 'new']);
  while ((m = propRe.exec(body)) !== null) {
    const name = m[1];
    if (skip.has(name)) continue;
    if (!props.includes(name)) props.push(name);
  }
  const signals = entity.signals
    .map((s) => s.name)
    .filter((n) => !['changed', 'emit', 'timeout'].includes(n));
  const slots = entity.slots.map((s) => s.name);
  // Arność obu stron połączenia: `emit` i `call` budują z tego swoje wejścia.
  const signalArgs: Record<string, SignalArg[]> = {};
  for (const sig of entity.signals) {
    if (sig.name.includes('.')) continue; // `x.changed` należy do property
    signalArgs[sig.name] = parseSignalArgs(sig.type);
  }
  const slotArgs: Record<string, SignalArg[]> = {};
  for (const slot of entity.slots) slotArgs[slot.name] = slot.params ?? [];
  // Plain class fields (this.foo = …, NOT Property) — exposed to the
  // var get/set/call blocks. Deduplicated across the entity parser and the
  // current code in case they drift.
  const vars = entity.variables?.map((v) => v.name) ?? [];
  // Podpowiedzi wyrażeń odnoszą się do pierwszego parametru — dawniej zawsze
  // `v`, bo innego nie było.
  const v = params[0]?.name?.trim() || 'v';
  const exprOpts = [
    ...params.map((p) => p.name.trim()).filter(Boolean),
    ...props.map((p) => `this.${p}.value`),
    `Number(${v})`,
    `String(${v})`,
    `Boolean(${v})`,
    `Math.round(${v})`,
    `Math.abs(${v})`,
    `Math.floor(${v})`,
    `Math.ceil(${v})`,
    `Math.min(${v}, 0)`,
    `Math.max(${v}, 0)`,
    `${v} + 1`,
    `${v} - 1`,
    `${v} * 2`,
    `${v} / 2`,
    `${v} % 2`,
    `${v}.toFixed(2)`,
    `${v}.toString()`,
    '`${' + v + '}`',
    '`${' + v + '} °C`',
    '`${' + v + '} %`',
    '`${' + v + '} ms`',
    'Date.now()',
    'new Date().toLocaleTimeString()',
    'true',
    'false',
    'null',
    'undefined',
    '[]',
    '{}',
    "''",
    ...props.map((p) => `[...this.${p}.value.slice(-19), ${v}]`),
  ];
  const condOpts = [
    `${v} > 0`,
    `${v} < 0`,
    `${v} >= 0`,
    `${v} <= 0`,
    `${v} !== undefined`,
    `${v} !== null`,
    `${v} === true`,
    `${v} === false`,
    ...props.map((p) => `${v} > this.${p}.value`),
    ...props.map((p) => `${v} < this.${p}.value`),
    ...props.map((p) => `${v} === this.${p}.value`),
    ...props.map((p) => `${v} !== this.${p}.value`),
    'true',
    'false',
  ];
  return { props, signals, slots, vars, params, signalArgs, slotArgs, exprOpts, condOpts };
}

const STMT_COLOR: Record<StmtKind, string> = {
  'set-prop': '#1565c0',
  emit: '#6a1b9a',
  if: '#e65100',
  'if-else': '#bf360c',
  log: '#2e7d32',
  declare: '#00838f',
  assign: '#c62828',
  return: '#ad1457',
  call: '#4527a0',
  append: '#006064',
  comment: '#37474f',
};
const STMT_LABEL: Record<StmtKind, string> = {
  'set-prop': 'set',
  emit: 'emit',
  if: 'if',
  'if-else': 'if/else',
  log: 'log',
  declare: 'const',
  assign: '=',
  return: 'return',
  call: 'call',
  append: 'push',
  comment: '//',
};
const PALETTE_GROUPS: Array<{ label: string; items: StmtKind[] }> = [
  { label: 'State', items: ['set-prop', 'emit', 'append'] },
  { label: 'Flow', items: ['if', 'if-else', 'return'] },
  { label: 'Vars', items: ['declare', 'assign'] },
  { label: 'Other', items: ['log', 'call', 'comment'] },
];

const INLINE_INPUT_SX = {
  '& .MuiOutlinedInput-root': {
    background: '#252535',
    color: '#cdd6f4',
    pr: '2px !important',
    '& fieldset': { borderColor: '#45475a' },
    '&:hover fieldset': { borderColor: '#585b70' },
    '& input': { padding: '1px 4px !important', fontSize: 10, fontFamily: 'monospace' },
  },
};

function ExprField({
  value,
  onChange,
  opts,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  opts: string[];
  width?: number | string;
}) {
  return (
    <Autocomplete
      freeSolo
      disableClearable
      options={opts}
      inputValue={value}
      onInputChange={(_, v) => onChange(v)}
      onChange={(_, v) => onChange(typeof v === 'string' ? v : '')}
      size="small"
      sx={{ width: width ?? 100, minWidth: 60 }}
      slotProps={{ paper: { sx: COMBO_PAPER_SX }, popper: { placement: 'top-start' } }}
      renderInput={(params) => (
        <TextField
          {...params}
          inputProps={{
            ...params.inputProps,
            style: { fontSize: 10, padding: '1px 4px', fontFamily: 'monospace', color: '#cdd6f4' },
          }}
          sx={INLINE_INPUT_SX}
        />
      )}
      renderOption={(props, o) => (
        <Box
          component="li"
          {...props}
          sx={{ fontSize: 10, fontFamily: 'monospace', py: '1px !important', px: 1 }}
        >
          {o}
        </Box>
      )}
    />
  );
}

function TinyField({
  value,
  onChange,
  placeholder,
  width = 60,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <TextField
      size="small"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{
        style: {
          fontSize: 10,
          padding: '1px 4px',
          fontFamily: 'monospace',
          color: '#cdd6f4',
          width,
        },
      }}
      sx={INLINE_INPUT_SX}
    />
  );
}

const IL = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
    {children}
  </Box>
);
const Lbl = ({ children }: { children: React.ReactNode }) => (
  <Typography sx={{ fontSize: 10, color: '#585b70', whiteSpace: 'nowrap', userSelect: 'none' }}>
    {children}
  </Typography>
);

function StmtBlockFields({
  stmt,
  ctx,
  onChange,
}: {
  stmt: SlotStmt;
  ctx: SlotCtx;
  onChange: (s: SlotStmt) => void;
}) {
  switch (stmt.k) {
    case 'set-prop':
      return (
        <IL>
          <Lbl>this.</Lbl>
          <ExprField
            value={stmt.prop}
            onChange={(v) => onChange({ ...stmt, prop: v })}
            opts={ctx.props}
            width={80}
          />
          <Lbl>.value =</Lbl>
          <ExprField
            value={stmt.expr}
            onChange={(v) => onChange({ ...stmt, expr: v })}
            opts={ctx.exprOpts}
            width={100}
          />
        </IL>
      );
    case 'emit':
      return (
        <IL>
          <Lbl>this.</Lbl>
          <ExprField
            value={stmt.signal}
            onChange={(v) => onChange({ ...stmt, signal: v })}
            opts={ctx.signals}
            width={90}
          />
          <Lbl>.emit(</Lbl>
          <ExprField
            value={stmt.expr}
            onChange={(v) => onChange({ ...stmt, expr: v })}
            opts={ctx.exprOpts}
            width={90}
          />
          <Lbl>)</Lbl>
        </IL>
      );
    case 'return':
      return (
        <IL>
          <ExprField
            value={stmt.expr}
            onChange={(v) => onChange({ ...stmt, expr: v })}
            opts={ctx.exprOpts}
            width={140}
          />
        </IL>
      );
    case 'declare':
      return (
        <IL>
          <TinyField
            value={stmt.name}
            onChange={(v) => onChange({ ...stmt, name: v })}
            placeholder="name"
          />
          <Lbl>=</Lbl>
          <ExprField
            value={stmt.expr}
            onChange={(v) => onChange({ ...stmt, expr: v })}
            opts={ctx.exprOpts}
            width={100}
          />
        </IL>
      );
    case 'assign':
      return (
        <IL>
          <TinyField
            value={stmt.target}
            onChange={(v) => onChange({ ...stmt, target: v })}
            placeholder="target"
          />
          <Lbl>=</Lbl>
          <ExprField
            value={stmt.expr}
            onChange={(v) => onChange({ ...stmt, expr: v })}
            opts={ctx.exprOpts}
            width={100}
          />
        </IL>
      );
    case 'log':
      return (
        <IL>
          <Autocomplete
            freeSolo
            disableClearable
            options={['log', 'warn', 'error']}
            inputValue={stmt.level}
            onInputChange={(_, v) => onChange({ ...stmt, level: v })}
            size="small"
            sx={{ width: 68 }}
            slotProps={{ paper: { sx: COMBO_PAPER_SX }, popper: { placement: 'top-start' } }}
            renderInput={(p) => (
              <TextField
                {...p}
                inputProps={{
                  ...p.inputProps,
                  style: {
                    fontSize: 10,
                    padding: '1px 4px',
                    color: '#cdd6f4',
                    fontFamily: 'monospace',
                  },
                }}
                sx={INLINE_INPUT_SX}
              />
            )}
            renderOption={(p, o) => (
              <Box component="li" {...p} sx={{ fontSize: 10, py: '1px !important', px: 1 }}>
                {o}
              </Box>
            )}
          />
          <Lbl>(</Lbl>
          <ExprField
            value={stmt.args}
            onChange={(v) => onChange({ ...stmt, args: v })}
            opts={ctx.exprOpts}
            width={120}
          />
          <Lbl>)</Lbl>
        </IL>
      );
    case 'call':
      return (
        <IL>
          <TinyField
            value={stmt.obj}
            onChange={(v) => onChange({ ...stmt, obj: v })}
            placeholder="this"
            width={45}
          />
          <Lbl>.</Lbl>
          <ExprField
            value={stmt.method}
            onChange={(v) => onChange({ ...stmt, method: v })}
            opts={ctx.slots}
            width={90}
          />
          <Lbl>(</Lbl>
          <ExprField
            value={stmt.arg}
            onChange={(v) => onChange({ ...stmt, arg: v })}
            opts={ctx.exprOpts}
            width={80}
          />
          <Lbl>)</Lbl>
        </IL>
      );
    case 'append':
      return (
        <IL>
          <Lbl>this.</Lbl>
          <ExprField
            value={stmt.prop}
            onChange={(v) => onChange({ ...stmt, prop: v })}
            opts={ctx.props}
            width={80}
          />
          <Lbl>push</Lbl>
          <ExprField
            value={stmt.item}
            onChange={(v) => onChange({ ...stmt, item: v })}
            opts={ctx.exprOpts}
            width={80}
          />
          <Lbl>max</Lbl>
          <TinyField
            value={stmt.maxLen}
            onChange={(v) => onChange({ ...stmt, maxLen: v })}
            placeholder="20"
            width={30}
          />
        </IL>
      );
    case 'comment':
      return (
        <TinyField
          value={stmt.text}
          onChange={(v) => onChange({ ...stmt, text: v })}
          placeholder="comment…"
          width={160}
        />
      );
    case 'if':
    case 'if-else':
      return (
        <IL>
          <ExprField
            value={stmt.cond}
            onChange={(v) => onChange({ ...stmt, cond: v } as SlotStmt)}
            opts={ctx.condOpts}
            width={160}
          />
        </IL>
      );
  }
}

function StmtBlock({
  stmt,
  ctx,
  onChange,
  onDelete,
  onUp,
  onDown,
  canUp,
  canDown,
  depth,
}: {
  stmt: SlotStmt;
  ctx: SlotCtx;
  onChange: (s: SlotStmt) => void;
  onDelete: () => void;
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
  depth: number;
}) {
  const color = STMT_COLOR[stmt.k];
  const label = STMT_LABEL[stmt.k];
  const isNested = stmt.k === 'if' || stmt.k === 'if-else';
  return (
    <Box
      sx={{
        mb: 0.5,
        border: `1px solid ${color}44`,
        borderRadius: 0.75,
        background: `${color}0d`,
        overflow: 'hidden',
      }}
    >
      {/* Row: badge + fields + controls */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, p: 0.5 }}>
        <Box
          sx={{
            minWidth: 34,
            mt: '1px',
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: color,
            borderRadius: 0.5,
            flexShrink: 0,
          }}
        >
          <Typography sx={{ fontSize: 8, color: '#fff', fontWeight: 700, letterSpacing: 0.3 }}>
            {label}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <StmtBlockFields stmt={stmt} ctx={ctx} onChange={onChange} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {['▲', '▼', '×'].map((ch, i) => (
            <Box
              key={ch}
              onClick={i === 0 ? onUp : i === 1 ? onDown : onDelete}
              sx={{
                width: 14,
                height: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: 0.25,
                fontSize: 9,
                color: i === 2 ? '#f38ba866' : '#45475a',
                '&:hover': { color: i === 2 ? '#f38ba8' : '#cdd6f4', background: '#31324422' },
                opacity: (i === 0 && !canUp) || (i === 1 && !canDown) ? 0.25 : 1,
                pointerEvents: (i === 0 && !canUp) || (i === 1 && !canDown) ? 'none' : 'auto',
              }}
            >
              {ch}
            </Box>
          ))}
        </Box>
      </Box>
      {/* Nested blocks for if / if-else */}
      {stmt.k === 'if' && (
        <Box sx={{ px: 0.75, pb: 0.5 }}>
          <StmtList
            stmts={stmt.body}
            ctx={ctx}
            onChange={(body) => onChange({ ...stmt, body })}
            depth={depth + 1}
          />
        </Box>
      )}
      {stmt.k === 'if-else' && (
        <Box sx={{ px: 0.75, pb: 0.5 }}>
          <Typography sx={{ fontSize: 8, color: '#a6adc8', px: 0.25, pb: 0.25 }}>then:</Typography>
          <StmtList
            stmts={stmt.then}
            ctx={ctx}
            onChange={(then) => onChange({ ...stmt, then })}
            depth={depth + 1}
          />
          <Typography sx={{ fontSize: 8, color: '#a6adc8', px: 0.25, py: 0.25 }}>else:</Typography>
          <StmtList
            stmts={stmt.els}
            ctx={ctx}
            onChange={(els) => onChange({ ...stmt, els })}
            depth={depth + 1}
          />
        </Box>
      )}
      {isNested && <Box sx={{ height: 2 }} />}
    </Box>
  );
}

function StmtList({
  stmts,
  ctx,
  onChange,
  depth = 0,
}: {
  stmts: SlotStmt[];
  ctx: SlotCtx;
  onChange: (ss: SlotStmt[]) => void;
  depth?: number;
}) {
  const upd = (i: number, s: SlotStmt) => onChange(stmts.map((x, j) => (j === i ? s : x)));
  const del = (i: number) => onChange(stmts.filter((_, j) => j !== i));
  const mv = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stmts.length) return;
    const a = [...stmts];
    [a[i], a[j]] = [a[j], a[i]];
    onChange(a);
  };
  const add = (k: StmtKind) => onChange([...stmts, mkStmt(k)]);
  return (
    <Box
      sx={{
        pl: depth > 0 ? 1 : 0,
        borderLeft: depth > 0 ? '2px solid #31324466' : 'none',
        ml: depth > 0 ? 0.5 : 0,
      }}
    >
      {stmts.map((s, i) => (
        <StmtBlock
          key={s.id}
          stmt={s}
          ctx={ctx}
          depth={depth}
          onChange={(ns) => upd(i, ns)}
          onDelete={() => del(i)}
          onUp={() => mv(i, -1)}
          onDown={() => mv(i, 1)}
          canUp={i > 0}
          canDown={i < stmts.length - 1}
        />
      ))}
      {depth > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25, mt: 0.25 }}>
          {PALETTE_GROUPS.flatMap((g) => g.items)
            .filter((k) => k !== 'if' && k !== 'if-else')
            .map((k) => (
              <Box
                key={k}
                onClick={() => add(k)}
                sx={{
                  px: 0.5,
                  py: 0.1,
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: 0.25,
                  cursor: 'pointer',
                  color: STMT_COLOR[k],
                  background: STMT_COLOR[k] + '22',
                  border: `1px solid ${STMT_COLOR[k]}44`,
                  '&:hover': { background: STMT_COLOR[k] + '44' },
                }}
              >
                {STMT_LABEL[k]}
              </Box>
            ))}
        </Box>
      )}
    </Box>
  );
}

/* ── Blockly-based slot editor ────────────────────────────────────────────────*/

// Was a one-shot flag — removed because it prevented new blocks added in
// later builds from registering after HMR (the function would early-return
// based on a stale `true`). All block registrations are idempotent simple
// assignments to `Blockly.Blocks[…]` / `javascriptGenerator.forBlock[…]`,
// so re-running on every mount is cheap and safe.
let _blkSlotCtx: SlotCtx = {
  props: [],
  signals: [],
  slots: [],
  vars: [],
  params: [],
  signalArgs: {},
  slotArgs: {},
  exprOpts: [],
  condOpts: [],
};

/**
 * Funkcje z wybranych projektów UML — czytane przez dropdown i generator
 * w momencie użycia (tak samo jak `_blkSlotCtx`), bo lista zmienia się po
 * zapisaniu ustawień, a bloczki rejestrowane są raz.
 */
let _blkUmlCallables: UmlCallable[] = [];

/**
 * Typy do wyboru przy deklaracji zmiennej: wbudowane TS + zadeklarowane w tym
 * pliku + sprowadzone importami. Liczone z aktualnej treści pliku przy każdym
 * otwarciu listy, żeby nowa klasa albo świeży import były widoczne od razu.
 */
/**
 * Nazwy zmiennych zadeklarowanych bloczkiem `let` w TYM workspace.
 * Czytane przy każdym otwarciu listy, więc świeżo dodana deklaracja jest
 * widoczna od razu; etykieta niesie też typ, żeby nie trzeba było wracać
 * wzrokiem do deklaracji.
 */
/**
 * Nazwa zmiennej wskazywanej przez pole odczytu. Wartość pola to zwykle id bloku
 * deklaracji; starsze zapisy trzymały samą nazwę, więc przyjmujemy oba warianty.
 */
function varRefName(block: Blockly.Block): string {
  const value = String(block.getFieldValue('NAME') || '').trim();
  if (!value || value === '(zmienna)') return '';
  // Zgodność: krótko istniał wariant, w którym w polu siedziało id deklaracji.
  const referenced = block.workspace?.getBlockById(value);
  if (referenced?.type === 'minis_var_declare')
    return String(referenced.getFieldValue('NAME') || '').trim();
  return value;
}

/**
 * Przepisuje nazwę zmiennej w bloczkach odczytu po jej zmianie w deklaracji.
 *
 * Pole nazwy to zwykła etykieta (`FieldLabelSerializable`), więc `setFieldValue`
 * działa bez walidacji względem listy opcji — w przeciwieństwie do dropdownu,
 * który odrzucał wartości i gubił je przy wczytywaniu zapisanego slotu.
 */
function renameVarReferences(ws: Blockly.Workspace | null, oldName: string, newName: string): void {
  if (!ws || !oldName || !newName || oldName === newName) return;
  for (const type of ['minis_var_ref', 'minis_var_ref_cast']) {
    for (const block of ws.getBlocksByType(type, false)) {
      const field = block.getField('NAME');
      if (!field || String(field.getValue() || '') !== oldName) continue;
      try {
        field.setValue(newName);
      } catch {
        // Starsze bloczki miały tu dropdown, który odrzuca wartość spoza listy —
        // wtedy regenerujemy opcje i ustawiamy ponownie (patrz test regresyjny
        // blocklyDropdownRefresh).
        const dyn = field as Blockly.Field & { getOptions?: (useCache: boolean) => unknown };
        try {
          dyn.getOptions?.(false);
          field.setValue(newName);
        } catch {
          /* pomijamy ten bloczek */
        }
      }
    }
  }
}

/**
 * Przepisuje nazwę parametru w bloczkach `param` po jej zmianie w sygnaturze
 * slotu. Bez tego bloczek zostałby przy starej nazwie i wygenerowałby kod
 * odwołujący się do parametru, którego już nie ma — a to widać dopiero
 * w kompilacji, nie w edytorze.
 */
function renameParamReferences(
  ws: Blockly.Workspace | null,
  oldName: string,
  newName: string
): void {
  if (!ws || !oldName || !newName || oldName === newName) return;
  for (const block of ws.getBlocksByType('minis_get_param', false)) {
    const field = block.getField('NAME');
    if (!field || String(field.getValue() || '') !== oldName) continue;
    // Dropdown odrzuca wartość spoza listy opcji, a lista jest generowana
    // leniwie — trzeba ją przeliczyć, zanim ustawimy nową nazwę.
    const dyn = field as Blockly.Field & { getOptions?: (useCache: boolean) => unknown };
    try {
      dyn.getOptions?.(false);
      field.setValue(newName);
    } catch {
      /* pomijamy ten bloczek */
    }
  }
}

/** Typ zadeklarowany dla danej zmiennej — podpowiedź przy rzutowaniu. */
function declaredVarType(refValue: string): string {
  const ws = _blkWorkspace;
  if (!ws || !refValue) return '';
  const byId = ws.getBlockById(refValue);
  const block =
    byId?.type === 'minis_var_declare'
      ? byId
      : ws
          .getBlocksByType('minis_var_declare', false)
          .find((b) => String(b.getFieldValue('NAME') || '').trim() === refValue);
  const t = String(block?.getFieldValue('TYPE') || '');
  return t === 'unknown' ? '' : t;
}

/** Ikona „wybierz typ" — ołówek w kolorze bloczka zmiennych. */
const TYPE_PICK_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
      '<path d="M2 11.5V14h2.5l7-7L9 4.5l-7 7z" fill="#13131e"/>' +
      '<path d="M13.7 3.3a1 1 0 0 0 0-1.4l-1.6-1.6a1 1 0 0 0-1.4 0L9.5 1.5 14 6l-.3-2.7z" fill="#13131e"/>' +
      '</svg>'
  );

/* ── Kontrola typów argumentów w wywołaniach funkcji z UML ────────────────── */

/**
 * Ostatnie zdarzenie wskaźnika w oknie. Blockly woła handler `FieldImage` bez
 * zdarzenia, a popup ma pojawić się przy klikniętej ikonie — stąd ten podsłuch.
 */
let _blkLastPointer: MouseEvent | undefined;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      _blkLastPointer = e as unknown as MouseEvent;
    },
    true
  );
}

/** Czy sprawdzanie typów jest włączone (przełącznik nad edytorem slotu). */
let _blkTypeCheckOn = false;
export function setUmlTypeCheck(on: boolean): void {
  _blkTypeCheckOn = on;
}

/**
 * Typ wartości, którą daje bloczek — na tyle, na ile da się to stwierdzić bez
 * kompilatora. `undefined` znaczy „nie wiadomo" i wyłącza kontrolę dla tego
 * argumentu, bo lepiej nic nie powiedzieć niż skłamać.
 */
function inferBlockValueType(block: Blockly.Block | null): string | undefined {
  if (!block) return undefined;
  switch (block.type) {
    case 'math_number':
      return 'number';
    case 'text':
    case 'text_join':
    case 'text_multiline':
      return 'string';
    case 'logic_boolean':
    case 'logic_compare':
    case 'logic_operation':
    case 'logic_negate':
      return 'boolean';
    case 'math_arithmetic':
    case 'math_single':
    case 'math_round':
    case 'math_modulo':
      return 'number';
    case 'text_length':
    case 'text_indexOf':
      return 'number';
    case 'lists_create_with':
      return 'unknown[]';
    case 'minis_var_cast':
    case 'minis_var_ref_cast':
      return String(block.getFieldValue('TYPE') || '') || undefined;
    case 'minis_var_ref': {
      const declared = declaredVarType(String(block.getFieldValue('NAME') || ''));
      return declared || undefined;
    }
    case 'minis_get_param': {
      const n = String(block.getFieldValue('NAME') || 'v');
      const t = _blkSlotCtx.params.find((p) => p.name === n)?.type?.trim();
      return t && t !== 'unknown' ? t : undefined;
    }
    default: {
      // Bloczek wywołania funkcji z UML — bierzemy typ zwracany (po zdjęciu Promise,
      // bo w kodzie jest `await`).
      const fn = _blkUmlCallables.find((c) => blockTypeFor(c) === block.type);
      if (fn?.returnType) return unwrapPromise(fn.returnType);
      return undefined;
    }
  }
}

/**
 * Ostatnio ustawiony tekst ostrzeżenia per bloczek.
 *
 * Blockly przy `setWarningText` odtwarza ikonę ostrzeżenia, co zamyka i od nowa
 * otwiera bąbelek — a walidacja biegnie po KAŻDYM zdarzeniu workspace (także po
 * zamknięciu bąbelka). Bez tej pamięci użytkownik nie mógłby zamknąć chmurki:
 * wracałaby natychmiast.
 */
const _blkWarnCache = new WeakMap<Blockly.Block, string | null>();

/** Ustawia ostrzeżenie tylko wtedy, gdy jego treść faktycznie się zmieniła. */
function setWarningIfChanged(block: Blockly.Block, text: string | null): void {
  const previous = _blkWarnCache.get(block) ?? null;
  if (previous === text) return;
  _blkWarnCache.set(block, text);
  // Zmiana ikony ostrzeżenia sama generuje zdarzenie workspace — bez wyciszenia
  // walidacja wywoływałaby się w kółko.
  Blockly.Events.disable();
  try {
    block.setWarningText(text);
  } finally {
    Blockly.Events.enable();
  }
}

/**
 * Sprawdza wszystkie wywołania funkcji z UML w workspace i oznacza problemy.
 *
 * Ostrzeżenie ląduje na bloczku ARGUMENTU (tam jest źródło błędu) — a gdy
 * argument jest niepodłączony lub to zwykła wartość bez własnego miejsca na
 * chmurkę, na bloczku wywołania. Blockly rysuje przy takim bloczku znak
 * ostrzeżenia z chmurką, więc opis jest dostępny bez dodatkowego UI.
 */
function validateUmlCallTypes(ws: Blockly.Workspace | null): void {
  if (!ws) return;
  const umlTypes = new Map(_blkUmlCallables.map((c) => [blockTypeFor(c), c]));

  for (const block of ws.getAllBlocks(false)) {
    const fn = umlTypes.get(block.type);
    if (!fn) continue;

    const argBlocks = fn.params.map((_, i) => block.getInputTargetBlock(`ARG${i}`));
    const issues = _blkTypeCheckOn
      ? checkCallArgs(fn.callee, fn.params, fn.paramTypes, argBlocks.map(inferBlockValueType))
      : [];

    // Opis przy samym argumencie — najkrótsza droga od ostrzeżenia do przyczyny.
    argBlocks.forEach((argBlock, i) => {
      if (!argBlock) return;
      const issue = issues.find((x) => x.index === i);
      setWarningIfChanged(argBlock, issue ? issue.message : null);
    });
    // Podsumowanie na wywołaniu — problem widać też, gdy argument jest zwinięty
    // albo poza widokiem. Pusta lista czyści ostrzeżenie (np. po wyłączeniu kontroli).
    setWarningIfChanged(block, issues.length ? formatIssues(issues) : null);
  }
}

/** Ikona dokumentacji — „i" w kółku, w kolorze tekstu bloczka. */
const DOC_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
      '<circle cx="8" cy="8" r="7" fill="none" stroke="#13131e" stroke-width="1.6"/>' +
      '<circle cx="8" cy="4.6" r="1" fill="#13131e"/>' +
      '<rect x="7.1" y="6.6" width="1.8" height="5.2" rx="0.9" fill="#13131e"/>' +
      '</svg>'
  );

/**
 * Prosi Reacta o pokazanie opisu funkcji. Przekazujemy pozycję kursora, bo popup
 * ma się pojawić przy klikniętej ikonie — bloczek nie jest elementem DOM, do
 * którego dałoby się zakotwiczyć komponent MUI.
 */
function openDocPopup(callable: UmlCallable, event?: MouseEvent): void {
  globalEventBus.emit(DOC_POPUP_OPEN, {
    title: callable.label,
    subtitle: [callable.project, callable.owner].filter(Boolean).join(' · '),
    file: callable.file ?? '',
    sections: docSections(callable),
    x: event?.clientX ?? window.innerWidth / 2,
    y: event?.clientY ?? window.innerHeight / 2,
  });
}

/** Ikona „wybierz zmienną" — trzy poziome linie (lista) w kolorze bloczka. */
const VAR_PICK_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
      '<rect x="2" y="3" width="12" height="2" rx="1" fill="#13131e"/>' +
      '<rect x="2" y="7" width="12" height="2" rx="1" fill="#13131e"/>' +
      '<rect x="2" y="11" width="8" height="2" rx="1" fill="#13131e"/>' +
      '</svg>'
  );

/** Lista zmiennych zadeklarowanych w tym workspace — dla okna wyboru. */
function declaredVars(): Array<{ name: string; type: string }> {
  const ws = _blkWorkspace;
  if (!ws) return [];
  const out: Array<{ name: string; type: string }> = [];
  const seen = new Set<string>();
  for (const block of ws.getBlocksByType('minis_var_declare', false)) {
    const name = String(block.getFieldValue('NAME') || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const type = String(block.getFieldValue('TYPE') || '');
    out.push({ name, type: type === 'unknown' ? '' : type });
  }
  return out;
}

/** Prosi Reacta o pokazanie okna wyboru zmiennej dla konkretnego bloczka. */
function openVarPicker(block: Blockly.Block): void {
  globalEventBus.emit(VAR_PICKER_OPEN, {
    blockId: block.id,
    current: String(block.getFieldValue('NAME') || ''),
    vars: declaredVars(),
  });
}

/** Podpina nasłuch wyboru zmiennej; odpina się przy usunięciu bloczka. */
function wireVarApplyListener(block: Blockly.Block): void {
  const off = globalEventBus.on<{ blockId: string; name: string }>(VAR_PICKER_APPLY, (p) => {
    if (p.blockId !== block.id) return;
    block.setFieldValue(p.name, 'NAME');
    // Rzutowanie: przy pustym typie podpowiadamy ten z deklaracji.
    if (
      block.type === 'minis_var_ref_cast' &&
      String(block.getFieldValue('TYPE') || 'unknown') === 'unknown'
    ) {
      const declared = declaredVarType(p.name);
      if (declared) block.setFieldValue(declared, 'TYPE');
    }
  });
  const orig = (block as Blockly.Block & { dispose: (...a: unknown[]) => unknown }).dispose;
  (block as Blockly.Block & { dispose: (...a: unknown[]) => unknown }).dispose = function (
    ...a: unknown[]
  ) {
    off();
    return orig.apply(this, a);
  };
}

/** Prosi Reacta o pokazanie okna wyboru typu dla konkretnego bloczka. */
function openTypePicker(block: Blockly.Block): void {
  globalEventBus.emit(TYPE_PICKER_OPEN, {
    blockId: block.id,
    current: String(block.getFieldValue('TYPE') || ''),
  });
}

/** Podpina nasłuch wyboru; odpina się, gdy bloczek jest usuwany. */
function wireTypeApplyListener(block: Blockly.Block): void {
  const off = globalEventBus.on<{ blockId: string; type: string }>(TYPE_PICKER_APPLY, (p) => {
    if (p.blockId !== block.id) return;
    block.setFieldValue(p.type, 'TYPE');
  });
  const orig = (block as Blockly.Block & { dispose: (...a: unknown[]) => unknown }).dispose;
  (block as Blockly.Block & { dispose: (...a: unknown[]) => unknown }).dispose = function (
    ...a: unknown[]
  ) {
    off();
    return orig.apply(this, a);
  };
}

/**
 * Pełna lista typów do okna wyboru: wbudowane TS, typy z tego pliku, z importów,
 * z pakietów zewnętrznych oraz z wybranych projektów UML (te ostatnie grupowane
 * po projekcie, bo bywa ich najwięcej).
 */
function allTypeOptions(): TypeOption[] {
  const extra: TypeOption[] = [
    ..._state.externalClassDefs.map((e) => ({ label: e.className, group: e.packageName })),
    ..._blkUmlTypes.map((t) => ({ label: t.name, group: `UML: ${t.project}` })),
  ];
  return buildTypeOptions(_state.currentCode, extra);
}
/** Funkcje faktycznie wygenerowane do kodu — na tej podstawie dopisujemy importy. */
let _blkUmlUsed = new Set<string>();

/** Aktywny workspace slotu — do odświeżenia toolboxa po zmianie wyboru projektów. */
let _blkWorkspace: Blockly.WorkspaceSvg | null = null;

/** Typy z wybranych projektów UML — do listy typów zmiennej. */
let _blkUmlTypes: UmlType[] = [];

export function setUmlTypes(list: UmlType[]): void {
  _blkUmlTypes = list;
}

export function setUmlCallables(list: UmlCallable[]): void {
  _blkUmlCallables = list;
  registerUmlBlocks(list);
  // Gdy ktoś zmieni projekty przy otwartym edytorze slotu, kategorie mają się
  // pojawić od razu — bez zamykania i ponownego otwierania okna.
  try {
    _blkWorkspace?.updateToolbox(slotToolbox());
  } catch {
    /* workspace zamknięty */
  }
}

/**
 * Rejestruje OSOBNY bloczek dla każdej funkcji z UML.
 *
 * Nie ma tu jednego bloczka z listą rozwijaną, bo w toolboxie mają być widoczne
 * konkretne funkcje pogrupowane w kategorie (klasa / plik) — użytkownik wybiera
 * je jak zwykłe bloczki, a nie przez dropdown wewnątrz jednego klocka.
 *
 * Bloczek dostaje po jednym wejściu na parametr (etykietowanym jego nazwą),
 * a to, czy jest instrukcją, czy wartością, wynika z typu zwracanego.
 */
function registerUmlBlocks(list: UmlCallable[]): void {
  for (const fn of list) {
    const type = blockTypeFor(fn);
    const hasValue = returnsValue(fn);

    Blockly.Blocks[type] = {
      init() {
        const block = this as Blockly.Block;
        const head = `${fn.isAsync ? 'await ' : ''}${fn.callee}`;
        const first = block.appendDummyInput();
        first.appendField(fn.params.length === 0 ? `${head}()` : head);
        // Ikona pojawia się TYLKO przy udokumentowanych funkcjach — przy pozostałych
        // byłaby obietnicą treści, której nie ma.
        if (hasDoc(fn.doc)) {
          first.appendField(
            new Blockly.FieldImage(
              DOC_ICON,
              15,
              15,
              'opis funkcji',
              // Blockly przekazuje do handlera samo pole; pozycję kursora bierzemy
              // z ostatniego zdarzenia wskaźnika (patrz `_blkLastPointer`).
              () => openDocPopup(fn, _blkLastPointer)
            )
          );
        }
        if (fn.params.length > 0) {
          fn.params.forEach((p, i) => {
            block.appendValueInput(`ARG${i}`).setAlign(Blockly.inputs.Align.RIGHT).appendField(p);
          });
        }
        if (hasValue) block.setOutput(true, null);
        else {
          block.setPreviousStatement(true, null);
          block.setNextStatement(true, null);
        }
        block.setColour('#a6e3a1');
        block.setTooltip(
          `${fn.project} · ${fn.ownerKind === 'class' ? 'metoda statyczna' : 'funkcja globalna'}` +
            `${fn.returnType ? ` → ${fn.returnType}` : ''}` +
            `${fn.file ? `\n${fn.file}` : ''}`
        );
      },
    };

    javascriptGenerator.forBlock[type] = (block, gen) => {
      // Zapamiętujemy użycie, żeby po zapisie slotu dopisać import.
      _blkUmlUsed.add(fn.id);
      const args = fn.params.map(
        (_, i) => gen.valueToCode(block, `ARG${i}`, Order.NONE) || 'undefined'
      );
      const code = callExpression(fn, args);
      return hasValue ? [code, Order.FUNCTION_CALL] : `${code};\n`;
    };
  }
}

/** Kategorie toolboxa dla funkcji z UML — nazwa klasy albo nazwa pliku modułu. */
function umlToolboxCategories(list: UmlCallable[]): Blockly.utils.toolbox.ToolboxItemInfo[] {
  return groupByCategory(list).map(({ category, items }) => ({
    kind: 'category',
    name: category,
    colour: '#a6e3a1',
    contents: items.map((fn) => ({ kind: 'block', type: blockTypeFor(fn) })),
  })) as Blockly.utils.toolbox.ToolboxItemInfo[];
}

/** Toolbox slotu = stała część + kategorie z UML (o ile jakieś projekty wybrano). */
function slotToolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  const uml = umlToolboxCategories(_blkUmlCallables);
  if (!uml.length) return MINIS_BLK_TOOLBOX;
  const base = MINIS_BLK_TOOLBOX as {
    kind: string;
    contents: Blockly.utils.toolbox.ToolboxItemInfo[];
  };
  return {
    ...base,
    // Kategorie UML tuż po MinisLib — najczęściej sięga się po nie zaraz po
    // blokach samego frameworka.
    contents: [base.contents[0], ...uml, ...base.contents.slice(1)],
  } as Blockly.utils.toolbox.ToolboxDefinition;
}
export function takeUsedUmlCallables(): UmlCallable[] {
  const used = _blkUmlCallables.filter((c) => _blkUmlUsed.has(c.id));
  _blkUmlUsed = new Set();
  return used;
}

// Dynamic dropdown generators — read _blkSlotCtx at call time so they
// reflect the current entity without re-registering blocks.

type BMenuOpt = [string, string];
const propOpts = (): BMenuOpt[] => {
  const o = _blkSlotCtx.props.map((p) => [p, p] as BMenuOpt);
  return o.length ? o : [['(no props)', '']];
};
const signalOpts = (): BMenuOpt[] => {
  const o = _blkSlotCtx.signals.map((s) => [s, s] as BMenuOpt);
  return o.length ? o : [['(no signals)', '']];
};
const slotOpts = (): BMenuOpt[] => {
  const o = _blkSlotCtx.slots.map((s) => [s, s] as BMenuOpt);
  return o.length ? o : [['(no slots)', '']];
};
const varOpts = (): BMenuOpt[] => {
  const o = _blkSlotCtx.vars.map((v) => [v, v] as BMenuOpt);
  return o.length ? o : [['(no vars)', '']];
};
// Parametry slotu. Fallback `v` — tak nazywał się jedyny parametr, zanim slot
// mógł mieć ich wiele, więc zapisane wcześniej bloczki dalej wskazują na coś.
const paramOpts = (): BMenuOpt[] => {
  const o = _blkSlotCtx.params.map((p) => [p.name, p.name] as BMenuOpt).filter(([n]) => n);
  return o.length ? o : [['v', 'v']];
};

function ensureMinisBlocksRegistered(): void {
  // No early-return — re-registering on every mount keeps newly added blocks
  // alive across HMR reloads (Blockly.Blocks/javascriptGenerator just rebind).

  /* ── minis_get_param ─ wybrany parametr slotu ────────────────────────────── */
  Blockly.Blocks['minis_get_param'] = {
    init() {
      (this as Blockly.Block)
        .appendDummyInput()
        .appendField('param')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .appendField(new Blockly.FieldDropdown(paramOpts as any), 'NAME');
      (this as Blockly.Block).setOutput(true, null);
      (this as Blockly.Block).setColour(200);
      (this as Blockly.Block).setTooltip('Wartość parametru slotu');
    },
  };
  // Bloczki zapisane przed dodaniem pola nie mają `NAME` — wtedy `v`, czyli
  // nazwa jedynego parametru, jaki sloty miały do tej pory.
  javascriptGenerator.forBlock['minis_get_param'] = (block) => [
    String(block.getFieldValue('NAME') || 'v'),
    Order.ATOMIC,
  ];

  /* ── minis_get_prop ─ this.{prop}.value ──────────────────────────────────── */
  Blockly.Blocks['minis_get_prop'] = {
    init() {
      (this as Blockly.Block)
        .appendDummyInput()
        .appendField('this.')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .appendField(new Blockly.FieldDropdown(propOpts as any), 'NAME')
        .appendField('.value');
      (this as Blockly.Block).setOutput(true, null);
      (this as Blockly.Block).setColour(260);
      (this as Blockly.Block).setTooltip('Read an Property value');
    },
  };
  javascriptGenerator.forBlock['minis_get_prop'] = (block) => {
    const name = block.getFieldValue('NAME') || '';
    return name ? [`this.${name}.value`, Order.MEMBER] : ['undefined', Order.ATOMIC];
  };

  /* ── minis_set_prop ─ this.{prop}.value = expr ───────────────────────────── */
  Blockly.Blocks['minis_set_prop'] = {
    init() {
      (this as Blockly.Block)
        .appendValueInput('VALUE')
        .appendField('this.')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .appendField(new Blockly.FieldDropdown(propOpts as any), 'NAME')
        .appendField('.value =');
      (this as Blockly.Block).setPreviousStatement(true, null);
      (this as Blockly.Block).setNextStatement(true, null);
      (this as Blockly.Block).setColour(220);
      (this as Blockly.Block).setTooltip('Set an Property value');
    },
  };
  javascriptGenerator.forBlock['minis_set_prop'] = (block, gen) => {
    const name = block.getFieldValue('NAME') || '';
    const val = gen.valueToCode(block, 'VALUE', Order.ASSIGNMENT) || 'undefined';
    return name ? `this.${name}.value = ${val};\n` : '';
  };

  /* ── minis_emit ─ this.{signal}.emit(a, b, …) ───────────────────────────── */
  defineDynArgsBlock({
    type: 'minis_emit',
    colour: 280,
    tooltip: 'Wyemituj sygnał — tyle argumentów, ile ma jego tupla',
    prefix: 'this.',
    suffix: '.emit(',
    // Pierwsze wejście zachowuje starą nazwę, żeby bloczki zapisane przed
    // wprowadzeniem wielu argumentów wczytały się z podłączoną wartością.
    firstInput: 'VALUE',
    nameOpts: signalOpts,
    argsFor: (n) => _blkSlotCtx.signalArgs[n] ?? [],
    code: (n, args) => `this.${n}.emit(${args.join(', ')});\n`,
  });

  /* ── minis_call ─ this.{slot}(a, b, …) ──────────────────────────────────── */
  defineDynArgsBlock({
    type: 'minis_call',
    colour: 60,
    tooltip: 'Wywołaj slot — tyle argumentów, ile ma jego sygnatura',
    prefix: 'call this.',
    suffix: '(',
    firstInput: 'ARG',
    nameOpts: slotOpts,
    argsFor: (n) => _blkSlotCtx.slotArgs[n] ?? [],
    code: (n, args) => `this.${n}(${args.join(', ')});\n`,
  });

  /* ── minis_var_declare ─ `let name: Type = value;` ──────────────────────── */
  Blockly.Blocks['minis_var_declare'] = {
    init() {
      const block = this as Blockly.Block;
      // Walidator pola (a nie zdarzenie workspace) jest tu jedynym pewnym
      // haczykiem — zdarzenia zmiany pola nie docierają w tym edytorze.
      const nameField = new Blockly.FieldTextInput('zmienna');
      // Walidator to jedyny pewny haczyk — zdarzenia zmiany pola nie docierają
      // w tym edytorze. Stara nazwa jest jeszcze w polu, nowa przychodzi jako
      // argument, więc mamy obie strony przemianowania.
      nameField.setValidator(function (this: Blockly.Field, value: string) {
        const previous = String(this.getValue() || '');
        if (previous && previous !== value) {
          setTimeout(() => renameVarReferences(block.workspace, previous, value), 0);
        }
        return value;
      });
      block
        .appendDummyInput()
        .appendField('let')
        .appendField(nameField, 'NAME')
        .appendField(':')
        // Typ pokazujemy jako etykietę, a wybór odbywa się w oknie z drzewem —
        // przy projektach UML lista bywa na setki pozycji, a płaski dropdown
        // Blockly nie ma ani grupowania, ani filtra.
        .appendField(new Blockly.FieldLabelSerializable('unknown'), 'TYPE')
        .appendField(
          new Blockly.FieldImage(TYPE_PICK_ICON, 16, 16, 'wybierz typ', () => openTypePicker(block))
        );
      block.appendValueInput('VALUE').appendField('=');
      // Bez tego Blockly łamie wiersz przed `=` i deklaracja zajmuje dwie linie.
      block.setInputsInline(true);
      wireTypeApplyListener(block);
      block.setPreviousStatement(true, null);
      block.setNextStatement(true, null);
      block.setColour('#ff8c00');
      block.setTooltip(
        'Deklaruje zmienną z typem. Lista zawiera typy wbudowane TypeScriptu, ' +
          'typy z tego pliku oraz sprowadzone importami.'
      );
    },
  };
  javascriptGenerator.forBlock['minis_var_declare'] = (block, gen) => {
    const raw = String(block.getFieldValue('NAME') || 'zmienna');
    // Nazwa trafia wprost do kodu — sanitacja chroni przed literówką łamiącą plik.
    const name = raw.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^(\d)/, '_$1');
    const type = String(block.getFieldValue('TYPE') || '');
    const value = gen.valueToCode(block, 'VALUE', Order.NONE);
    // Bez wartości zostaje sama deklaracja — TypeScript wymaga wtedy typu,
    // więc `let x: string;` jest poprawne, a `let x;` byłoby `any`.
    return value
      ? `let ${name}${type ? `: ${type}` : ''} = ${value};\n`
      : `let ${name}${type ? `: ${type}` : ''};\n`;
  };

  /* ── minis_var_ref ─ odczyt zadeklarowanej zmiennej (sama nazwa) ────────── */
  Blockly.Blocks['minis_var_ref'] = {
    init() {
      const block = this as Blockly.Block;
      // Nazwa trzymana jako ETYKIETA, nie dropdown: pole z dynamiczną listą
      // odrzucało wartość przy wczytywaniu zapisanego slotu (opcje jeszcze nie
      // istniały) i bloczek pokazywał „(brak zmiennych)".
      block
        .appendDummyInput()
        .appendField(new Blockly.FieldLabelSerializable('(zmienna)'), 'NAME')
        .appendField(
          new Blockly.FieldImage(VAR_PICK_ICON, 16, 16, 'wybierz zmienną', () =>
            openVarPicker(block)
          )
        );
      block.setOutput(true, null);
      block.setColour('#ff8c00');
      block.setTooltip('Wartość zmiennej zadeklarowanej bloczkiem `let` w tym slocie.');
      wireVarApplyListener(block);
    },
  };
  javascriptGenerator.forBlock['minis_var_ref'] = (block) => {
    const name = varRefName(block);
    return [name || 'undefined', Order.ATOMIC];
  };

  /* ── minis_var_ref_cast ─ odczyt zmiennej z rzutowaniem `as Typ` ────────── */
  Blockly.Blocks['minis_var_ref_cast'] = {
    init() {
      const block = this as Blockly.Block;
      block
        .appendDummyInput()
        .appendField(new Blockly.FieldLabelSerializable('(zmienna)'), 'NAME')
        .appendField(
          new Blockly.FieldImage(VAR_PICK_ICON, 16, 16, 'wybierz zmienną', () =>
            openVarPicker(block)
          )
        )
        .appendField('jako')
        .appendField(new Blockly.FieldLabelSerializable('unknown'), 'TYPE')
        .appendField(
          new Blockly.FieldImage(TYPE_PICK_ICON, 16, 16, 'wybierz typ', () => openTypePicker(block))
        );
      block.setInputsInline(true);
      block.setOutput(true, null);
      block.setColour('#ff8c00');
      block.setTooltip(
        'Wartość zmiennej rzutowana na wybrany typ — przydatne, gdy zmienna trzyma ' +
          '`unknown` albo typ ogólniejszy niż potrzebny w tym miejscu.'
      );
      wireTypeApplyListener(block);
      wireVarApplyListener(block);
    },
  };
  javascriptGenerator.forBlock['minis_var_ref_cast'] = (block) => {
    const name = varRefName(block);
    if (!name) return ['undefined', Order.ATOMIC];
    // Gdy typu nie wybrano, bierzemy ten z deklaracji — rzutowanie na własny typ
    // zmiennej to najczęstszy przypadek i nie powinno wymagać klikania.
    const chosen = String(block.getFieldValue('TYPE') || 'unknown');
    const type = chosen !== 'unknown' ? chosen : declaredVarType(name) || 'unknown';
    return [`(${name} as ${type})`, Order.FUNCTION_CALL];
  };

  /* ── minis_var_cast ─ rzutowanie wartości na wybrany typ ────────────────── */
  Blockly.Blocks['minis_var_cast'] = {
    init() {
      const block = this as Blockly.Block;
      block.appendValueInput('VALUE').appendField('wartość');
      block
        .appendDummyInput()
        .appendField('jako')
        .appendField(new Blockly.FieldLabelSerializable('unknown'), 'TYPE')
        .appendField(
          new Blockly.FieldImage(TYPE_PICK_ICON, 16, 16, 'wybierz typ', () => openTypePicker(block))
        );
      block.setInputsInline(true);
      block.setOutput(true, null);
      wireTypeApplyListener(block);
      block.setColour('#ff8c00');
      block.setTooltip('Rzutowanie `as Typ` — przydatne, gdy wartość przychodzi jako unknown.');
    },
  };
  javascriptGenerator.forBlock['minis_var_cast'] = (block, gen) => {
    const value = gen.valueToCode(block, 'VALUE', Order.NONE) || 'undefined';
    const type = String(block.getFieldValue('TYPE') || 'unknown');
    return [`(${value} as ${type})`, Order.FUNCTION_CALL];
  };

  /* ── minis_log ─ console.log(expr) ──────────────────────────────────────── */
  Blockly.Blocks['minis_log'] = {
    init() {
      (this as Blockly.Block).appendValueInput('VALUE').appendField('console.log(');
      (this as Blockly.Block).setPreviousStatement(true, null);
      (this as Blockly.Block).setNextStatement(true, null);
      (this as Blockly.Block).setColour(120);
      (this as Blockly.Block).setTooltip('console.log(value)');
    },
  };
  javascriptGenerator.forBlock['minis_log'] = (block, gen) => {
    const val = gen.valueToCode(block, 'VALUE', Order.NONE) || "''";
    return `console.log(${val});\n`;
  };

  // ── Variable blocks ───────────────────────────────────────────────────────
  // Get/set/call a plain class field — `this.varName` plus an optional PATH
  // suffix. The PATH is a read-only label rendered on the block; clicking
  // the "•••" button opens the React PathBuilderDialog which knows how to
  // enumerate members of the variable's type (file classes, interfaces,
  // external manifests, Array/Map/Set generics, Property/Signal, plus
  // common builtins). The dialog emits an event the block listens for and
  // updates its PATH field.

  /** Find the user-declared TS type of the var currently picked in this block. */
  const lookupVarType = (varName: string): string => {
    if (!varName) return '';
    const cls = _state.entities.find(
      (e) => e.kind === 'class' && e.variables?.some((v) => v.name === varName)
    );
    return cls?.variables?.find((v) => v.name === varName)?.type ?? '';
  };

  /** Fire `pathBuilderOpen` for a specific block — picked up by the React dialog. */
  const openPathBuilder = (block: Blockly.Block) => {
    const varName = block.getFieldValue('NAME') || '';
    const path = block.getFieldValue('PATH') || '';
    globalEventBus.emit(PATH_BUILDER_OPEN, {
      blockId: block.id,
      varName,
      varType: lookupVarType(varName),
      path,
    });
  };

  /** Apply listener used by every var block — picks the matching block by id.
   *  When `tailMethod`+`args` are present, the block reshapes itself with one
   *  value input per argument (and the generator emits `path.method(args…)`). */
  const applyToBlock = (
    block: Blockly.Block,
    path: string,
    tailMethod: string | null,
    args: PathArg[]
  ) => {
    block.setFieldValue(path, 'PATH');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = block as any;
    b.minisTail_ = tailMethod || null;
    b.minisArgs_ = args ?? [];
    if (typeof b.rebuildArgInputs_ === 'function') b.rebuildArgInputs_();
  };

  // Helper: build a clickable image field that opens the dialog. SVG is an
  // inline 16×16 "•••" pictogram styled to match the var block colour.
  const PATH_PICK_ICON =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
        '<circle cx="3" cy="8" r="1.5" fill="#13131e"/>' +
        '<circle cx="8" cy="8" r="1.5" fill="#13131e"/>' +
        '<circle cx="13" cy="8" r="1.5" fill="#13131e"/>' +
        '</svg>'
    );

  // We need to register a per-block apply listener that survives across
  // dialog opens. Using a single global handler keyed by block id keeps
  // the wiring simple. Block also disposes its listener on destroy.
  const wireApplyListener = (block: Blockly.Block) => {
    const off = globalEventBus.on<{
      blockId: string;
      path: string;
      tailMethod?: string | null;
      args?: PathArg[];
    }>(PATH_BUILDER_APPLY, (p) => {
      if (p.blockId === block.id) applyToBlock(block, p.path, p.tailMethod ?? null, p.args ?? []);
    });
    // Blockly's `dispose` is overridable — chain to our cleanup.
    const origDispose = (block as Blockly.Block & { dispose: (...args: unknown[]) => unknown })
      .dispose;
    (block as Blockly.Block & { dispose: (...args: unknown[]) => unknown }).dispose = function (
      ...args: unknown[]
    ) {
      off();
      return origDispose.apply(this, args);
    };
  };

  /** Build the `(arg: value, ...)` portion of a variable-call statement.
   *  Reads each ARG_n input through the JS generator and joins with `, `. */
  const collectArgCode = (
    block: Blockly.Block,
    gen: typeof javascriptGenerator,
    args: PathArg[]
  ): string =>
    args.map((_, i) => gen.valueToCode(block, `ARG${i}`, Order.NONE) || 'undefined').join(', ');

  /**
   * Tear down + recreate input rows for a var block. Used both at init time
   * and whenever the path builder sends back a new `args` list. Lives as a
   * method on the block (rebuildArgInputs_) so the apply handler can call it.
   *
   * Shape:
   *   - Top dummy: `this.NAME PATH [•••]`  (always)
   *   - When `tail`+args: an inline `.tail(` label, then a value input per arg
   *     labelled with the arg name, then a closing `)` dummy.
   *   - When `tail` without args (no-arg method): we just keep `()` in PATH
   *     (existing behaviour) — no tail state needed.
   *   - For var_set, after the path/args section, the VALUE input appears.
   */
  const buildBlockShape = (
    block: Blockly.Block,
    variant: 'get' | 'set' | 'call',
    openHandler: () => void
  ): void => {
    // Remove every existing input — we'll rebuild from scratch. Iterate via a
    // snapshot since removeInput mutates inputList.
    for (const inp of block.inputList.slice()) {
      if (inp.name) block.removeInput(inp.name);
    }

    const header = block
      .appendDummyInput('HEADER')
      .appendField('this.')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .appendField(new Blockly.FieldDropdown(varOpts as any), 'NAME')
      .appendField(new Blockly.FieldLabelSerializable(''), 'PATH')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .appendField(new Blockly.FieldImage(PATH_PICK_ICON, 16, 16, 'pick path', openHandler) as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = block as any;
    const tail: string | null = b.minisTail_ ?? null;
    const args: PathArg[] = b.minisArgs_ ?? [];

    if (tail && args.length > 0) {
      // `.tail(` label sits right after the path picker.
      header.appendField(`.${tail}(`);
      args.forEach((a, i) => {
        block
          .appendValueInput(`ARG${i}`)
          .setAlign(Blockly.inputs.Align.RIGHT)
          .appendField(`${a.name}:`);
      });
      block.appendDummyInput('CLOSE_PAREN').appendField(')');
      block.setInputsInline(false);
    } else {
      block.setInputsInline(true);
    }

    if (variant === 'set') {
      // VALUE input lands at the end so set's `= …` reads naturally.
      block.appendValueInput('VALUE').setAlign(Blockly.inputs.Align.RIGHT).appendField('=');
    }

    if (variant === 'get') {
      block.setOutput(true, null);
    } else {
      block.setPreviousStatement(true, null);
      block.setNextStatement(true, null);
    }
    block.setColour('#f9e2af');
  };

  /** Common factory: install the mutator/serializer plumbing + tooltip per variant. */
  const installVarBlock = (
    block: Blockly.Block,
    variant: 'get' | 'set' | 'call',
    tooltip: string
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = block as any;
    b.minisTail_ = b.minisTail_ ?? null;
    b.minisArgs_ = b.minisArgs_ ?? [];
    b.rebuildArgInputs_ = () => buildBlockShape(block, variant, () => openPathBuilder(block));
    // Blockly's modern serialization API — keep tail+args across save/load.
    b.saveExtraState = () => ({ tail: b.minisTail_, args: b.minisArgs_ });
    b.loadExtraState = (state: { tail?: string | null; args?: PathArg[] }) => {
      b.minisTail_ = state?.tail ?? null;
      b.minisArgs_ = state?.args ?? [];
      b.rebuildArgInputs_();
    };
    buildBlockShape(block, variant, () => openPathBuilder(block));
    block.setTooltip(tooltip);
    wireApplyListener(block);
  };

  /* ── minis_var_get ─ this.{var}{path}[.tail(args…)] ─────────────────── */
  Blockly.Blocks['minis_var_get'] = {
    init() {
      installVarBlock(
        this as Blockly.Block,
        'get',
        'Read a class variable. Click ••• to navigate nested members or pick a method call.'
      );
    },
  };
  javascriptGenerator.forBlock['minis_var_get'] = (block, gen) => {
    const name = block.getFieldValue('NAME') || '';
    const path = block.getFieldValue('PATH') || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tail = (block as any).minisTail_ as string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = (block as any).minisArgs_ as PathArg[] | undefined;
    if (!name) return ['undefined', Order.ATOMIC];
    if (tail && args && args.length) {
      const argCode = collectArgCode(block, gen, args);
      return [`this.${name}${path}.${tail}(${argCode})`, Order.FUNCTION_CALL];
    }
    return [`this.${name}${path}`, Order.MEMBER];
  };

  /* ── minis_var_set ─ this.{var}{path} = expr ─────────────────────────── */
  // Note: var_set with a `tail` method makes no semantic sense (you can't
  // assign to a method call), so the dialog should never emit one. If it
  // does — we ignore tail and just emit the plain field assignment.
  Blockly.Blocks['minis_var_set'] = {
    init() {
      installVarBlock(
        this as Blockly.Block,
        'set',
        'Assign a class variable. Click ••• to navigate nested members.'
      );
    },
  };
  javascriptGenerator.forBlock['minis_var_set'] = (block, gen) => {
    const name = block.getFieldValue('NAME') || '';
    const path = block.getFieldValue('PATH') || '';
    const val = gen.valueToCode(block, 'VALUE', Order.ASSIGNMENT) || 'undefined';
    return name ? `this.${name}${path} = ${val};\n` : '';
  };

  /* ── minis_var_call ─ this.{var}{path}[.tail(args…)] ── (as statement) ─ */
  Blockly.Blocks['minis_var_call'] = {
    init() {
      installVarBlock(
        this as Blockly.Block,
        'call',
        'Invoke a method on a class variable. Click ••• to pick the call; methods with arguments grow value-input rows.'
      );
    },
  };
  javascriptGenerator.forBlock['minis_var_call'] = (block, gen) => {
    const name = block.getFieldValue('NAME') || '';
    const path = block.getFieldValue('PATH') || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tail = (block as any).minisTail_ as string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = (block as any).minisArgs_ as PathArg[] | undefined;
    if (!name) return '';
    if (tail && args && args.length) {
      const argCode = collectArgCode(block, gen, args);
      return `this.${name}${path}.${tail}(${argCode});\n`;
    }
    return `this.${name}${path};\n`;
  };

  // ── Tuple blocks (JS arrays with fixed semantics) ────────────────────────
  Blockly.Blocks['minis_tuple_create'] = {
    init() {
      (this as Blockly.Block).appendValueInput('A').appendField('[');
      (this as Blockly.Block).appendValueInput('B').appendField(',');
      (this as Blockly.Block).appendValueInput('C').appendField(',');
      (this as Blockly.Block).appendDummyInput().appendField(']');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, null);
      (this as Blockly.Block).setColour('#9b5ba5');
      (this as Blockly.Block).setTooltip('Create a tuple (array) of 3 values');
    },
  };
  javascriptGenerator.forBlock['minis_tuple_create'] = (block, gen) => {
    const a = gen.valueToCode(block, 'A', Order.NONE) || 'undefined';
    const b = gen.valueToCode(block, 'B', Order.NONE) || 'undefined';
    const c = gen.valueToCode(block, 'C', Order.NONE) || 'undefined';
    return [`[${a}, ${b}, ${c}]`, Order.ATOMIC];
  };

  Blockly.Blocks['minis_tuple_get'] = {
    init() {
      (this as Blockly.Block).appendValueInput('TUPLE').appendField('tuple');
      (this as Blockly.Block).appendValueInput('IDX').appendField('[');
      (this as Blockly.Block).appendDummyInput().appendField(']');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, null);
      (this as Blockly.Block).setColour('#9b5ba5');
      (this as Blockly.Block).setTooltip('Get element at index');
    },
  };
  javascriptGenerator.forBlock['minis_tuple_get'] = (block, gen) => {
    const arr = gen.valueToCode(block, 'TUPLE', Order.MEMBER) || '[]';
    const idx = gen.valueToCode(block, 'IDX', Order.NONE) || '0';
    return [`${arr}[${idx}]`, Order.MEMBER];
  };

  Blockly.Blocks['minis_tuple_length'] = {
    init() {
      (this as Blockly.Block).appendValueInput('TUPLE').appendField('length of');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, 'Number');
      (this as Blockly.Block).setColour('#9b5ba5');
    },
  };
  javascriptGenerator.forBlock['minis_tuple_length'] = (block, gen) => {
    const arr = gen.valueToCode(block, 'TUPLE', Order.MEMBER) || '[]';
    return [`${arr}.length`, Order.MEMBER];
  };

  Blockly.Blocks['minis_tuple_find'] = {
    init() {
      (this as Blockly.Block).appendValueInput('TUPLE').appendField('tuple');
      (this as Blockly.Block).appendValueInput('ITEM').appendField('.indexOf(');
      (this as Blockly.Block).appendDummyInput().appendField(')');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, 'Number');
      (this as Blockly.Block).setColour('#9b5ba5');
      (this as Blockly.Block).setTooltip('Index of item in tuple (−1 if not found)');
    },
  };
  javascriptGenerator.forBlock['minis_tuple_find'] = (block, gen) => {
    const arr = gen.valueToCode(block, 'TUPLE', Order.MEMBER) || '[]';
    const item = gen.valueToCode(block, 'ITEM', Order.NONE) || 'undefined';
    return [`${arr}.indexOf(${item})`, Order.FUNCTION_CALL];
  };

  // ── Map blocks (JS object literals / Record) ─────────────────────────────
  Blockly.Blocks['minis_map_create'] = {
    init() {
      (this as Blockly.Block).appendValueInput('KEY').appendField('{ key:');
      (this as Blockly.Block).appendValueInput('VAL').appendField('value:');
      (this as Blockly.Block).appendDummyInput().appendField('}');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, null);
      (this as Blockly.Block).setColour('#c4527a');
      (this as Blockly.Block).setTooltip('Create an object { key: value }');
    },
  };
  javascriptGenerator.forBlock['minis_map_create'] = (block, gen) => {
    const key = gen.valueToCode(block, 'KEY', Order.NONE) || "''";
    const val = gen.valueToCode(block, 'VAL', Order.NONE) || 'undefined';
    return [`{ [${key}]: ${val} }`, Order.ATOMIC];
  };

  Blockly.Blocks['minis_map_get'] = {
    init() {
      (this as Blockly.Block).appendValueInput('MAP').appendField('map');
      (this as Blockly.Block).appendValueInput('KEY').appendField('[');
      (this as Blockly.Block).appendDummyInput().appendField(']');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, null);
      (this as Blockly.Block).setColour('#c4527a');
      (this as Blockly.Block).setTooltip('Get value for key');
    },
  };
  javascriptGenerator.forBlock['minis_map_get'] = (block, gen) => {
    const map = gen.valueToCode(block, 'MAP', Order.MEMBER) || '{}';
    const key = gen.valueToCode(block, 'KEY', Order.NONE) || "''";
    return [`${map}[${key}]`, Order.MEMBER];
  };

  Blockly.Blocks['minis_map_set'] = {
    init() {
      (this as Blockly.Block).appendValueInput('MAP').appendField('map');
      (this as Blockly.Block).appendValueInput('KEY').appendField('[');
      (this as Blockly.Block).appendValueInput('VAL').appendField('] =');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setPreviousStatement(true, null);
      (this as Blockly.Block).setNextStatement(true, null);
      (this as Blockly.Block).setColour('#c4527a');
      (this as Blockly.Block).setTooltip('Set value for key');
    },
  };
  javascriptGenerator.forBlock['minis_map_set'] = (block, gen) => {
    const map = gen.valueToCode(block, 'MAP', Order.MEMBER) || '{}';
    const key = gen.valueToCode(block, 'KEY', Order.NONE) || "''";
    const val = gen.valueToCode(block, 'VAL', Order.NONE) || 'undefined';
    return `${map}[${key}] = ${val};\n`;
  };

  Blockly.Blocks['minis_map_has'] = {
    init() {
      (this as Blockly.Block).appendValueInput('KEY').appendField('map has key');
      (this as Blockly.Block).appendValueInput('MAP').appendField('in');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, 'Boolean');
      (this as Blockly.Block).setColour('#c4527a');
      (this as Blockly.Block).setTooltip("'key' in map");
    },
  };
  javascriptGenerator.forBlock['minis_map_has'] = (block, gen) => {
    const key = gen.valueToCode(block, 'KEY', Order.RELATIONAL) || "''";
    const map = gen.valueToCode(block, 'MAP', Order.RELATIONAL) || '{}';
    return [`${key} in ${map}`, Order.RELATIONAL];
  };

  Blockly.Blocks['minis_map_delete'] = {
    init() {
      (this as Blockly.Block).appendValueInput('MAP').appendField('delete from map');
      (this as Blockly.Block).appendValueInput('KEY').appendField('key');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setPreviousStatement(true, null);
      (this as Blockly.Block).setNextStatement(true, null);
      (this as Blockly.Block).setColour('#c4527a');
    },
  };
  javascriptGenerator.forBlock['minis_map_delete'] = (block, gen) => {
    const map = gen.valueToCode(block, 'MAP', Order.MEMBER) || '{}';
    const key = gen.valueToCode(block, 'KEY', Order.NONE) || "''";
    return `delete ${map}[${key}];\n`;
  };

  Blockly.Blocks['minis_map_keys'] = {
    init() {
      (this as Blockly.Block).appendValueInput('MAP').appendField('Object.keys(');
      (this as Blockly.Block).appendDummyInput().appendField(')');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, null);
      (this as Blockly.Block).setColour('#c4527a');
      (this as Blockly.Block).setTooltip('Get all keys of a map as an array');
    },
  };
  javascriptGenerator.forBlock['minis_map_keys'] = (block, gen) => {
    const map = gen.valueToCode(block, 'MAP', Order.NONE) || '{}';
    return [`Object.keys(${map})`, Order.FUNCTION_CALL];
  };

  // ── JSON blocks ───────────────────────────────────────────────────────────
  Blockly.Blocks['minis_json_stringify'] = {
    init() {
      (this as Blockly.Block).appendValueInput('VALUE').appendField('JSON.stringify(');
      (this as Blockly.Block).appendDummyInput().appendField(')');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, 'String');
      (this as Blockly.Block).setColour('#4a7c59');
      (this as Blockly.Block).setTooltip('Serialize value to JSON string');
    },
  };
  javascriptGenerator.forBlock['minis_json_stringify'] = (block, gen) => {
    const val = gen.valueToCode(block, 'VALUE', Order.NONE) || 'undefined';
    return [`JSON.stringify(${val})`, Order.FUNCTION_CALL];
  };

  Blockly.Blocks['minis_json_parse'] = {
    init() {
      (this as Blockly.Block).appendValueInput('TEXT').appendField('JSON.parse(');
      (this as Blockly.Block).appendDummyInput().appendField(')');
      (this as Blockly.Block).setInputsInline(true);
      (this as Blockly.Block).setOutput(true, null);
      (this as Blockly.Block).setColour('#4a7c59');
      (this as Blockly.Block).setTooltip('Parse JSON string to object');
    },
  };
  javascriptGenerator.forBlock['minis_json_parse'] = (block, gen) => {
    const text = gen.valueToCode(block, 'TEXT', Order.NONE) || "'{}'";
    return [`JSON.parse(${text})`, Order.FUNCTION_CALL];
  };
}

const MINIS_BLK_TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    // ── MinisLib ────────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: 'MinisLib',
      colour: '#89dceb',
      contents: [
        { kind: 'block', type: 'minis_get_param' },
        { kind: 'block', type: 'minis_get_prop' },
        { kind: 'block', type: 'minis_set_prop' },
        // Variable blocks — read/write/invoke plain class fields, with PATH
        // text field for drilling into nested members of object-shaped types.
        { kind: 'block', type: 'minis_var_get' },
        { kind: 'block', type: 'minis_var_set' },
        { kind: 'block', type: 'minis_var_call' },
        { kind: 'block', type: 'minis_emit' },
        { kind: 'block', type: 'minis_call' },
        { kind: 'block', type: 'minis_log' },
      ],
    },
    { kind: 'sep' },
    // ── Language categories (flat — Blockly's toolbox does NOT properly
    //    render nested categories; clicking a sub-category inside an
    //    `expanded: true` parent would blank the flyout.) ────────────────
    {
      kind: 'category',
      name: 'Logic',
      categorystyle: 'logic_category',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
        { kind: 'block', type: 'logic_null' },
        { kind: 'block', type: 'logic_ternary' },
      ],
    },
    {
      kind: 'category',
      name: 'Loops',
      categorystyle: 'loop_category',
      contents: [
        {
          kind: 'block',
          type: 'controls_repeat_ext',
          inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } },
        },
        { kind: 'block', type: 'controls_whileUntil' },
        {
          kind: 'block',
          type: 'controls_for',
          inputs: {
            FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            TO: { shadow: { type: 'math_number', fields: { NUM: 9 } } },
            BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          },
        },
        { kind: 'block', type: 'controls_forEach' },
        { kind: 'block', type: 'controls_flow_statements' },
      ],
    },
    {
      kind: 'category',
      name: 'Math',
      categorystyle: 'math_category',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'math_single' },
        { kind: 'block', type: 'math_trig' },
        { kind: 'block', type: 'math_constant' },
        { kind: 'block', type: 'math_number_property' },
        {
          kind: 'block',
          type: 'math_change',
          inputs: { DELTA: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
        },
        { kind: 'block', type: 'math_round' },
        { kind: 'block', type: 'math_modulo' },
        {
          kind: 'block',
          type: 'math_constrain',
          inputs: {
            LOW: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            HIGH: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
        {
          kind: 'block',
          type: 'math_random_int',
          inputs: {
            FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
        { kind: 'block', type: 'math_random_float' },
      ],
    },
    {
      kind: 'category',
      name: 'Text',
      categorystyle: 'text_category',
      // Trimmed to the subset that works without surprises in Blockly v12.
      // The dropped blocks (text_indexOf, text_charAt, text_getSubstring,
      // text_trim, text_print) carry mutators/extensions that crashed the
      // flyout in our bundle — other plugins (upython, ardublockly2) use
      // the same reduced set successfully.
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
        { kind: 'block', type: 'text_append', inputs: { TEXT: { shadow: { type: 'text' } } } },
        { kind: 'block', type: 'text_length' },
        { kind: 'block', type: 'text_isEmpty' },
        { kind: 'block', type: 'text_changeCase' },
      ],
    },
    {
      kind: 'category',
      name: 'Lists',
      colour: '#5ba5a5',
      // Trimmed to the subset that works in Blockly v12 without surprises.
      // The dropped blocks (`lists_indexOf`, `lists_getIndex`,
      // `lists_setIndex`, `lists_getSublist`, `lists_split`, `lists_sort`)
      // depend on mutators/extensions that the toolbox flyout failed to
      // instantiate in our bundle — same pattern as the Text trim.
      contents: [
        { kind: 'block', type: 'lists_create_with' },
        {
          kind: 'block',
          type: 'lists_repeat',
          inputs: {
            ITEM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            NUM: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
          },
        },
        { kind: 'block', type: 'lists_length' },
        { kind: 'block', type: 'lists_isEmpty' },
        { kind: 'block', type: 'lists_reverse' },
      ],
    },
    {
      kind: 'category',
      name: 'Tuples',
      colour: '#9b5ba5',
      contents: [
        {
          kind: 'block',
          type: 'minis_tuple_create',
          inputs: {
            A: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            B: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            C: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
        {
          kind: 'block',
          type: 'minis_tuple_get',
          inputs: { IDX: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
        },
        { kind: 'block', type: 'minis_tuple_length' },
        {
          kind: 'block',
          type: 'minis_tuple_find',
          inputs: { ITEM: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Map',
      colour: '#c4527a',
      contents: [
        {
          kind: 'block',
          type: 'minis_map_create',
          inputs: {
            KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } },
            VAL: { shadow: { type: 'text', fields: { TEXT: 'value' } } },
          },
        },
        {
          kind: 'block',
          type: 'minis_map_get',
          inputs: { KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } } },
        },
        {
          kind: 'block',
          type: 'minis_map_set',
          inputs: { KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } } },
        },
        {
          kind: 'block',
          type: 'minis_map_has',
          inputs: { KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } } },
        },
        {
          kind: 'block',
          type: 'minis_map_delete',
          inputs: { KEY: { shadow: { type: 'text', fields: { TEXT: 'key' } } } },
        },
        { kind: 'block', type: 'minis_map_keys' },
      ],
    },
    {
      kind: 'category',
      name: 'JSON',
      colour: '#4a7c59',
      contents: [
        { kind: 'block', type: 'minis_json_stringify' },
        {
          kind: 'block',
          type: 'minis_json_parse',
          inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: '{"key":"value"}' } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: 'Variables',
      colour: '#ff8c00',
      contents: [
        // Deklaracja z typem — pierwsza, bo zwykle od niej zaczyna się praca
        // ze zmienną; `variables_get/set` operują na już istniejącej.
        { kind: 'block', type: 'minis_var_declare' },
        { kind: 'block', type: 'minis_var_ref' },
        { kind: 'block', type: 'minis_var_ref_cast' },
        { kind: 'block', type: 'minis_var_cast' },
        { kind: 'block', type: 'variables_get' },
        { kind: 'block', type: 'variables_set' },
      ],
    },
    {
      kind: 'category',
      name: 'Functions',
      categorystyle: 'procedure_category',
      custom: 'PROCEDURE',
    },
  ],
};

/* ── Path Builder dialog ─────────────────────────────────────────────────────
 * IntelliSense-style picker for variable access paths. Opened from
 * `minis_var_get/set/call` blocks via a small "•••" button. Built as a stack
 * of segments — each segment shows the current type and a member picker.
 * Clicking a member appends to the path; clicking the breadcrumb pops back.
 */

interface PathBuilderState {
  open: boolean;
  blockId: string | null;
  varName: string;
  varType: string;
  path: string;
}

const DOC_POPUP_OPEN = 'minislib:docPopupOpen';

const VAR_PICKER_OPEN = 'minislib:varPickerOpen';
const VAR_PICKER_APPLY = 'minislib:varPickerApply';

const TYPE_PICKER_OPEN = 'minislib:typePickerOpen';
const TYPE_PICKER_APPLY = 'minislib:typePickerApply';

const PATH_BUILDER_OPEN = 'minislib:pathBuilderOpen';
const PATH_BUILDER_APPLY = 'minislib:pathBuilderApply';

/**
 * Popup z opisem funkcji z UML — treść pochodzi z metadanych TSDoc projektu.
 *
 * Nie jest to dialog: ma nie blokować pracy i znikać przy pierwszym kliknięciu
 * gdziekolwiek (także w pole bloczka), więc zamykamy go na `pointerdown`
 * przechwytywanym w fazie łapania — inaczej kliknięcie w Blockly zdążyłoby
 * zostać obsłużone, a popup zostałby otwarty.
 */
function DocPopup() {
  const [state, setState] = useState<{
    title: string;
    subtitle: string;
    file: string;
    sections: DocSection[];
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    return globalEventBus.on<{
      title: string;
      subtitle: string;
      file: string;
      sections: DocSection[];
      x: number;
      y: number;
    }>(DOC_POPUP_OPEN, (payload) => setState(payload));
  }, []);

  useEffect(() => {
    if (!state) return;
    // Pomijamy zdarzenie, które właśnie otworzyło popup (ten sam gest kliknięcia).
    let armed = false;
    const arm = () => {
      armed = true;
    };
    const close = () => {
      if (armed) setState(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(null);
    };

    const id = window.setTimeout(arm, 0);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [state]);

  if (!state) return null;

  // Trzymamy popup w granicach okna — ikona bywa przy prawej krawędzi panelu.
  const width = 380;
  const left = Math.min(Math.max(8, state.x + 12), Math.max(8, window.innerWidth - width - 8));
  const top = Math.min(Math.max(8, state.y + 12), Math.max(8, window.innerHeight - 240));

  return createPortal(
    <Box
      // `pointerdown` na samym popupie nie zamyka go od razu — inaczej nie dałoby
      // się zaznaczyć fragmentu przykładu kodu.
      onPointerDown={(e) => e.stopPropagation()}
      sx={{
        position: 'fixed',
        left,
        top,
        width,
        zIndex: 2000,
        maxHeight: '60vh',
        overflow: 'auto',
        background: '#13131e',
        color: '#cdd6f4',
        border: '1px solid #45475a',
        borderRadius: 1,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        p: 1.25,
        fontSize: 12,
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#a6e3a1' }}>
        {state.title}
      </Typography>
      {(state.subtitle || state.file) && (
        <Typography sx={{ fontSize: 10, color: '#6c7086', mb: 0.75 }}>
          {[state.subtitle, state.file].filter(Boolean).join(' · ')}
        </Typography>
      )}

      {state.sections.length === 0 && (
        <Typography sx={{ fontSize: 11, color: '#6c7086' }}>Brak opisu w projekcie UML.</Typography>
      )}

      {state.sections.map((section, i) => (
        <Box key={`${section.title}-${i}`} sx={{ mt: section.title ? 1 : 0.25 }}>
          {section.title && (
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: section.title.startsWith('⚠') ? '#f38ba8' : '#89b4fa',
              }}
            >
              {section.title}
            </Typography>
          )}
          {section.lines.map((line, j) => (
            <Typography
              key={j}
              sx={{
                fontSize: section.code ? 11 : 12,
                fontFamily: section.code ? 'monospace' : 'inherit',
                whiteSpace: 'pre-wrap',
                color: section.code ? '#f9e2af' : '#cdd6f4',
                // Argumenty czytają się lepiej jako lista z wcięciem.
                pl: section.title === 'Argumenty' ? 1 : 0,
              }}
            >
              {section.title === 'Argumenty' ? `• ${line}` : line}
            </Typography>
          ))}
        </Box>
      ))}

      <Typography sx={{ fontSize: 9, color: '#45475a', mt: 1 }}>
        Kliknij gdziekolwiek albo Esc, aby zamknąć
      </Typography>
    </Box>,
    document.body
  );
}

/**
 * Okno wyboru zmiennej — lista deklaracji `let` z tego slotu, z filtrem.
 *
 * Osobne okno, a nie lista rozwijana na bloczku: dropdown z dynamicznymi
 * opcjami odrzucał zapisaną wartość przy wczytywaniu slotu, więc referencja
 * do zmiennej ginęła po zapisaniu pliku.
 */
function VarPickerDialog() {
  const [open, setOpen] = useState(false);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [vars, setVars] = useState<Array<{ name: string; type: string }>>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    return globalEventBus.on<{
      blockId: string;
      current: string;
      vars: Array<{ name: string; type: string }>;
    }>(VAR_PICKER_OPEN, (p) => {
      setBlockId(p.blockId);
      setVars(p.vars);
      setFilter('');
      setOpen(true);
    });
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? vars.filter((v) => v.name.toLowerCase().includes(q)) : vars;
  }, [vars, filter]);

  const pick = (name: string) => {
    if (blockId) globalEventBus.emit(VAR_PICKER_APPLY, { blockId, name });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { background: '#13131e', color: '#cdd6f4' } } }}
    >
      <DialogTitle sx={{ py: 1.25, borderBottom: '1px solid #313244', fontSize: 14 }}>
        Wybierz zmienną
      </DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        {vars.length === 0 ? (
          <Typography sx={{ fontSize: 12, color: '#6c7086', py: 1 }}>
            W tym slocie nie ma jeszcze deklaracji — dodaj bloczek <code>let</code>.
          </Typography>
        ) : (
          <>
            <TextField
              autoFocus
              fullWidth
              size="small"
              placeholder="filtruj po nazwie…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && shown.length) pick(shown[0].name);
              }}
              inputProps={{ style: { fontSize: 12, fontFamily: 'monospace' } }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: '#1e1e2e',
                  color: '#cdd6f4',
                  '& fieldset': { borderColor: '#45475a' },
                  '&:hover fieldset': { borderColor: '#585b70' },
                  '&.Mui-focused fieldset': { borderColor: '#89b4fa' },
                },
                '& input::placeholder': { color: '#7f849c', opacity: 1 },
              }}
            />
            <Box
              sx={{
                mt: 1,
                maxHeight: 300,
                overflow: 'auto',
                border: '1px solid #313244',
                borderRadius: 1,
              }}
            >
              {shown.length === 0 && (
                <Typography sx={{ fontSize: 12, color: '#6c7086', p: 1.5 }}>
                  Brak zmiennych pasujących do filtra.
                </Typography>
              )}
              {shown.map((v) => (
                <Box
                  key={v.name}
                  onClick={() => pick(v.name)}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 1,
                    '&:hover': { background: '#1e1e2e', color: '#a6e3a1' },
                  }}
                >
                  <span>{v.name}</span>
                  {v.type && <span style={{ color: '#7f849c' }}>: {v.type}</span>}
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Okno wyboru typu — drzewo grup z rozwijaniem i filtrem po nazwie.
 *
 * Płaska lista nie wystarcza, bo po dodaniu projektów UML typów bywa kilkaset;
 * grupy (TypeScript / Ten plik / import: … / UML: projekt) pozwalają szybko
 * zawęzić obszar, a filtr działa na wszystkich naraz. Wpisany tekst może też
 * zostać użyty wprost — typy generyczne (`Map<string, Sensor>`) i tak trzeba
 * czasem napisać ręcznie.
 */
function TypePickerDialog() {
  const [open, setOpen] = useState(false);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState<TypeOption[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    return globalEventBus.on<{ blockId: string; current: string }>(TYPE_PICKER_OPEN, (p) => {
      setBlockId(p.blockId);
      setFilter(p.current && p.current !== 'unknown' ? p.current : '');
      const opts = allTypeOptions();
      setOptions(opts);
      // Domyślnie rozwinięta tylko pierwsza grupa — przy kilkuset typach
      // rozwinięcie wszystkiego dawałoby ścianę tekstu.
      setExpanded(new Set(opts.length ? [opts[0].group] : []));
      setOpen(true);
    });
  }, []);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const map = new Map<string, string[]>();
    for (const o of options) {
      if (q && !o.label.toLowerCase().includes(q)) continue;
      if (!map.has(o.group)) map.set(o.group, []);
      map.get(o.group)!.push(o.label);
    }
    return [...map.entries()];
  }, [options, filter]);

  // Filtrowanie samo rozwija grupy z trafieniami — inaczej trzeba by klikać
  // w każdą, żeby zobaczyć, gdzie wpadł szukany typ.
  const isExpanded = (group: string) => (filter.trim() ? true : expanded.has(group));
  const toggle = (group: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const pick = (label: string) => {
    if (blockId) globalEventBus.emit(TYPE_PICKER_APPLY, { blockId, type: label });
    setOpen(false);
  };

  const total = groups.reduce((n, [, items]) => n + items.length, 0);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { background: '#13131e', color: '#cdd6f4' } } }}
    >
      <DialogTitle sx={{ py: 1.25, borderBottom: '1px solid #313244', fontSize: 14 }}>
        Wybierz typ
      </DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="filtruj po nazwie…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filter.trim()) pick(filter.trim());
          }}
          inputProps={{ style: { fontSize: 12, fontFamily: 'monospace' } }}
          // Okno ma własne ciemne tło, więc domyślne kolory MUI (ciemny tekst,
          // ledwie widoczna ramka) zlewałyby pole z tłem.
          sx={{
            '& .MuiOutlinedInput-root': {
              background: '#1e1e2e',
              color: '#cdd6f4',
              '& fieldset': { borderColor: '#45475a' },
              '&:hover fieldset': { borderColor: '#585b70' },
              '&.Mui-focused fieldset': { borderColor: '#89b4fa' },
            },
            '& input::placeholder': { color: '#7f849c', opacity: 1 },
          }}
        />
        <Typography sx={{ fontSize: 10, color: '#6c7086', mt: 0.5, mb: 1 }}>
          {total} typów · Enter wpisuje własny (np. <code>Map&lt;string, Sensor&gt;</code>)
        </Typography>

        <Box
          sx={{ maxHeight: 340, overflow: 'auto', border: '1px solid #313244', borderRadius: 1 }}
        >
          {groups.length === 0 && (
            <Typography sx={{ fontSize: 12, color: '#6c7086', p: 1.5 }}>
              Brak typów pasujących do filtra.
            </Typography>
          )}
          {groups.map(([group, items]) => (
            <Box key={group}>
              <Box
                onClick={() => toggle(group)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  py: 0.5,
                  cursor: 'pointer',
                  background: '#181825',
                  borderBottom: '1px solid #313244',
                  position: 'sticky',
                  top: 0,
                }}
              >
                <Typography sx={{ fontSize: 11, color: '#89b4fa', fontWeight: 700, flex: 1 }}>
                  {isExpanded(group) ? '▾' : '▸'} {group}
                </Typography>
                <Typography sx={{ fontSize: 10, color: '#6c7086' }}>{items.length}</Typography>
              </Box>
              {isExpanded(group) &&
                items.map((label) => (
                  <Box
                    key={`${group}:${label}`}
                    onClick={() => pick(label)}
                    sx={{
                      px: 2,
                      py: 0.4,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      '&:hover': { background: '#1e1e2e', color: '#a6e3a1' },
                    }}
                  >
                    {label}
                  </Box>
                ))}
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        {filter.trim() && (
          <Button onClick={() => pick(filter.trim())}>Użyj „{filter.trim()}"</Button>
        )}
        <Button onClick={() => setOpen(false)}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

function PathBuilderDialog() {
  const state = usePluginState();
  const [open, setOpen] = useState(false);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [varName, setVarName] = useState('');
  const [baseType, setBaseType] = useState('');
  // Segments are kept as objects so we know each step's display name,
  // accumulated code suffix, and the type it produced.
  interface PathSeg {
    display: string;
    code: string;
    resultType: string;
  }
  const [segs, setSegs] = useState<PathSeg[]>([]);
  const [filter, setFilter] = useState('');

  // Listen for open requests dispatched by the Blockly "•••" button.
  useEffect(() => {
    const unsub = globalEventBus.on<PathBuilderState>(PATH_BUILDER_OPEN, (p) => {
      setBlockId(p.blockId);
      setVarName(p.varName);
      setBaseType(p.varType);
      // Try to reconstruct existing segments from the incoming path string.
      // Best-effort — anything we can't recognise stays as the initial raw
      // text so the user doesn't lose work.
      const seeded: PathSeg[] = [];
      let typeCursor = p.varType;
      let remaining = p.path;
      while (remaining) {
        const members = resolveTypeMembers(typeCursor, state);
        // Match `.name` or `.name(…)` or `[idx]`
        const dotMatch = /^\.(\w+)(\(\))?/.exec(remaining);
        const idxMatch = /^\[[^\]]*\]/.exec(remaining);
        if (dotMatch) {
          const name = dotMatch[1];
          const isCall = !!dotMatch[2];
          const member = members.find(
            (mm) =>
              mm.name === name &&
              ((isCall && (mm.kind === 'method' || mm.kind === 'slot')) ||
                (!isCall && mm.kind === 'field'))
          );
          if (!member) break;
          seeded.push({
            display: name + (isCall ? '()' : ''),
            code: dotMatch[0],
            resultType: member.resultType ?? 'unknown',
          });
          typeCursor = member.resultType ?? 'unknown';
          remaining = remaining.slice(dotMatch[0].length);
        } else if (idxMatch) {
          const indexMember = members.find((mm) => mm.kind === 'index');
          if (!indexMember) break;
          seeded.push({
            display: idxMatch[0],
            code: idxMatch[0],
            resultType: indexMember.resultType ?? 'unknown',
          });
          typeCursor = indexMember.resultType ?? 'unknown';
          remaining = remaining.slice(idxMatch[0].length);
        } else break;
      }
      setSegs(seeded);
      setFilter('');
      setOpen(true);
    });
    return unsub;
  }, [state]);

  const currentType = segs.length ? segs[segs.length - 1].resultType : baseType;
  const members = useMemo(() => resolveTypeMembers(currentType, state), [currentType, state]);
  const filteredMembers = useMemo(
    () =>
      filter ? members.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase())) : members,
    [members, filter]
  );

  const fullPath = segs.map((s) => s.code).join('');

  const handlePickMember = (m: PathMember) => {
    // For methods/slots with arguments: don't bake `()` into the path string.
    // Instead, end navigation here and apply the path + a "tail method call"
    // descriptor — the block then sprouts value inputs (one per argument).
    if (m.kind === 'method' || m.kind === 'slot') {
      const args = parseMethodArgs(m.signature);
      if (args.length > 0) {
        const pathWithoutTail = segs.map((s) => s.code).join('');
        if (blockId) {
          globalEventBus.emit(PATH_BUILDER_APPLY, {
            blockId,
            path: pathWithoutTail,
            tailMethod: m.name,
            args,
          });
        }
        setOpen(false);
        return;
      }
    }
    setSegs((prev) => [
      ...prev,
      {
        display:
          m.kind === 'method' || m.kind === 'slot'
            ? `${m.name}()`
            : m.kind === 'index'
              ? '[0]'
              : m.name,
        code: memberToPathSegment(m),
        resultType: m.resultType ?? 'unknown',
      },
    ]);
    setFilter('');
  };

  const handleBackTo = (idx: number) => {
    setSegs((prev) => prev.slice(0, idx));
    setFilter('');
  };

  // Plain apply — no method args trail. Clears any previously-stored tail
  // call on the block so we don't leak stale ARG inputs from a prior path.
  const handleApply = () => {
    if (blockId)
      globalEventBus.emit(PATH_BUILDER_APPLY, {
        blockId,
        path: fullPath,
        tailMethod: null,
        args: [],
      });
    setOpen(false);
  };
  const handleCancel = () => setOpen(false);
  const handleClearAll = () => {
    setSegs([]);
    setFilter('');
  };

  // Color/icon per kind for visual scan.
  const kindStyles: Record<PathMember['kind'], { icon: string; bg: string; fg: string }> = {
    field: { icon: '◆', bg: '#1e2e3e', fg: '#89dceb' },
    method: { icon: 'ƒ', bg: '#2a1e3e', fg: '#cba6f7' },
    signal: { icon: '⚡', bg: '#2e1e2e', fg: '#f5c2e7' },
    slot: { icon: '↩', bg: '#1e2e2a', fg: '#94e2d5' },
    index: { icon: '[]', bg: '#2a2e1e', fg: '#f9e2af' },
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { background: '#13131e', color: '#cdd6f4' } } }}
    >
      <DialogTitle sx={{ borderBottom: '1px solid #313244', background: '#181825', py: 1.25 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={{ fontSize: 18, color: '#89dceb' }}>↳</Box>
          <Box sx={{ fontSize: 14, color: '#cdd6f4' }}>Build path access</Box>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Reset path">
            <IconButton size="small" onClick={handleClearAll} sx={{ color: '#6c7086' }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>
        {/* Breadcrumb */}
        <Box
          sx={{
            mt: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            flexWrap: 'wrap',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
        >
          <Box
            component="span"
            sx={{ color: '#89dceb', cursor: 'pointer' }}
            onClick={() => handleBackTo(0)}
            title={`Reset to: this.${varName} (${baseType})`}
          >
            this.{varName}
          </Box>
          {segs.map((s, i) => (
            <React.Fragment key={i}>
              <Box
                component="span"
                sx={{
                  color: i === segs.length - 1 ? '#a6e3a1' : '#cdd6f4',
                  cursor: i < segs.length - 1 ? 'pointer' : 'default',
                  px: 0.25,
                  borderRadius: 0.5,
                  '&:hover': i < segs.length - 1 ? { background: '#313244' } : undefined,
                }}
                onClick={() => i < segs.length - 1 && handleBackTo(i + 1)}
              >
                {s.code}
              </Box>
            </React.Fragment>
          ))}
        </Box>
        <Box sx={{ mt: 0.5, fontSize: 10, color: '#6c7086', fontFamily: 'monospace' }}>
          type: {currentType || '—'}
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {/* Filter */}
        <Box sx={{ p: 1.25, borderBottom: '1px solid #313244' }}>
          <TextField
            fullWidth
            size="small"
            autoFocus
            placeholder={`Filter members of ${currentType}…`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                background: '#1e1e2e',
                color: '#cdd6f4',
                '& fieldset': { borderColor: '#313244' },
                '&:hover fieldset': { borderColor: '#585b70' },
                '&.Mui-focused fieldset': { borderColor: '#89dceb' },
              },
              '& input::placeholder': { color: '#6c7086' },
            }}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
          />
        </Box>
        {/* Member grid */}
        <Box sx={{ maxHeight: '50vh', overflow: 'auto', p: 1 }}>
          {filteredMembers.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', color: '#6c7086', fontSize: 12 }}>
              {members.length === 0
                ? `No introspection for type "${currentType}". Click "Type custom suffix" to enter the rest manually.`
                : `No members matching "${filter}".`}
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 0.75,
              }}
            >
              {filteredMembers.map((m, i) => {
                const style = kindStyles[m.kind];
                return (
                  <Box
                    key={`${m.name}-${i}`}
                    onClick={() => handlePickMember(m)}
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      background: style.bg,
                      border: '1px solid #313244',
                      '&:hover': { borderColor: style.fg, background: '#1e1e3e' },
                    }}
                  >
                    <Stack direction="row" alignItems="center" gap={0.75}>
                      <Box
                        sx={{ width: 18, textAlign: 'center', color: style.fg, fontWeight: 700 }}
                      >
                        {style.icon}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: 13,
                            color: style.fg,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.name}
                          {m.signature ?? (m.resultType ? `: ${m.resultType}` : '')}
                        </Box>
                        {m.source && (
                          <Box
                            sx={{
                              fontSize: 9,
                              color: '#6c7086',
                              mt: 0.1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {m.source}
                          </Box>
                        )}
                      </Box>
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
        {/* Manual fallback */}
        <Box sx={{ borderTop: '1px solid #313244', p: 1.25, background: '#181825' }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Box sx={{ fontSize: 10, color: '#6c7086', whiteSpace: 'nowrap' }}>Or type:</Box>
            <TextField
              size="small"
              fullWidth
              placeholder=".customField  or  .foo(1, 2)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) {
                    setSegs((prev) => [
                      ...prev,
                      { display: val, code: val, resultType: 'unknown' },
                    ]);
                    (e.target as HTMLInputElement).value = '';
                  }
                }
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: '#13131e',
                  color: '#cdd6f4',
                  '& fieldset': { borderColor: '#313244' },
                },
              }}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 12, padding: '4px 6px' } }}
            />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ borderTop: '1px solid #313244', background: '#181825' }}>
        <Box
          sx={{
            flex: 1,
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#6c7086',
            px: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          result: this.{varName}
          {fullPath || '  (no path)'}
        </Box>
        <Button
          onClick={handleCancel}
          sx={{
            fontSize: 11,
            color: '#cdd6f4',
            textTransform: 'none',
            border: '1px solid #45475a',
            bgcolor: '#1e1e2e',
            '&:hover': { bgcolor: '#313244' },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          variant="contained"
          sx={{
            fontSize: 11,
            fontWeight: 600,
            bgcolor: '#a6e3a1',
            color: '#13131e',
            textTransform: 'none',
            '&:hover': { bgcolor: '#94d18f' },
          }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SlotBlocklyEditor({
  ctx,
  onCodeChange,
  onStateChange,
  initialState,
}: {
  ctx: SlotCtx;
  onCodeChange: (code: string) => void;
  /** Fires alongside onCodeChange with the workspace's full block JSON.
   *  Persist this so Edit Slot can re-hydrate the same blocks next time. */
  onStateChange?: (state: object | null) => void;
  /** When provided, load this state into the workspace on mount — used by
   *  Edit Slot to bring back the user's blocks instead of starting empty. */
  initialState?: object | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onCodeChange);
  cbRef.current = onCodeChange;
  const stateCbRef = useRef(onStateChange);
  stateCbRef.current = onStateChange;
  // Snapshot the initial state so the effect's empty-deps invariant holds
  // even if a parent re-renders with a different value (we never reload).
  const initialStateRef = useRef(initialState);

  // Keep the global `_blkSlotCtx` (consumed lazily by FieldDropdown generator
  // functions) in sync with the latest ctx from the parent. Without this, the
  // mount-time snapshot would be the only thing the dropdowns ever see, so
  // properties/signals added or renamed mid-session never appear.
  useEffect(() => {
    _blkSlotCtx = ctx;
  }, [ctx]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    ensureMinisBlocksRegistered();
    _blkSlotCtx = ctx; // set before inject so dropdown options are ready
    const workspace = Blockly.inject(container, {
      toolbox: slotToolbox(),
      scrollbars: true,
      trashcan: true,
      zoom: { controls: true, startScale: 0.85, maxScale: 2, minScale: 0.4 },
    });
    // Rehydrate from saved state if Edit Slot supplied one. Wrapped in try/catch
    // because a corrupt state should not break the editor entirely — fall back
    // to an empty workspace + warning in console.
    if (initialStateRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Blockly as any).serialization.workspaces.load(initialStateRef.current, workspace);
      } catch (err) {
        console.warn('[MinisLib] failed to restore Blockly workspace state:', err);
      }
    }
    _blkWorkspace = workspace;
    // Resize after first paint so Blockly measures the real container dimensions
    requestAnimationFrame(() => Blockly.svgResize(workspace));
    setTimeout(() => Blockly.svgResize(workspace), 200);
    const listener = (e?: Blockly.Events.Abstract) => {
      // Ten listener demonstracyjnie działa (odświeża podgląd kodu), więc to on
      // — a nie walidator pola — jest pewnym miejscem na propagację nazwy:
      // zmiana pola NAME w deklaracji przepisuje ją w bloczkach odczytu.
      if (e && e.type === Blockly.Events.BLOCK_CHANGE) {
        const ev = e as Blockly.Events.BlockChange;
        if (ev.name === 'NAME' && ev.blockId) {
          const changed = workspace.getBlockById(ev.blockId);
          if (changed?.type === 'minis_var_declare') {
            renameVarReferences(workspace, String(ev.oldValue ?? ''), String(ev.newValue ?? ''));
          }
        }
      }
      validateUmlCallTypes(workspace);
      cbRef.current(javascriptGenerator.workspaceToCode(workspace));
      if (stateCbRef.current) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const state = (Blockly as any).serialization.workspaces.save(workspace);
          // Empty workspace serialises to `{}` — normalise to null so the
          // parent can tell "no blocks" from "didn't save yet".
          stateCbRef.current(state && Object.keys(state).length ? state : null);
        } catch {
          /* ignore serialisation errors */
        }
      }
    };
    workspace.addChangeListener(listener);
    const ro = new ResizeObserver(() => Blockly.svgResize(workspace));
    ro.observe(container);
    return () => {
      ro.disconnect();
      // Zwalniamy referencję tylko jeśli to nadal NASZ workspace — inaczej
      // przemontowanie edytora skasowałoby uchwyt do świeżo utworzonego.
      if (_blkWorkspace === workspace) _blkWorkspace = null;
      workspace.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 240 }}>
      <div
        ref={containerRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
    </Box>
  );
}

function indentBody(raw: string): string {
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  return lines.length > 0 ? lines.map((l) => '    ' + l).join('\n') : '    // empty';
}

/** Context carrying the plugin root element so portals can anchor to it. */
const MinisContainerCtx = createContext<React.RefObject<HTMLDivElement | null> | null>(null);

/**
 * Slot editor — Blockly only, rendered as a full-canvas overlay portal.
 *
 * Visual mode was removed: it duplicated functionality already covered by
 * Blockly and the toggle between them made the Blockly workspace remount on
 * every switch, losing all blocks. This single-editor variant keeps the
 * workspace alive for the entire lifetime of the slot builder.
 *
 * All slot metadata (name, parameter type, code) is edited inside this overlay
 * — there's no separate parent panel competing for the same data.
 */
/**
 * Przełącznik kontroli typów argumentów w wywołaniach funkcji z UML.
 *
 * Domyślnie wyłączony: bez kompilatora porównanie typów jest przybliżone, więc
 * decyzję o tym, czy chcieć takich podpowiedzi, zostawiamy użytkownikowi.
 * Ustawienie zostaje między sesjami — to nawyk pracy, nie treść dokumentu.
 */
function TypeCheckToggle() {
  const KEY = 'minislib.umlTypeCheck';
  const [on, setOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  // Stan globalny czyta walidator w listenerze workspace, więc trzeba go ustawić
  // także przy montowaniu — nie tylko przy kliknięciu.
  useEffect(() => {
    setUmlTypeCheck(on);
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* tryb prywatny */
    }
    // Natychmiastowe przeliczenie: włączenie ma od razu pokazać problemy,
    // a wyłączenie — zdjąć wszystkie chmurki.
    validateUmlCallTypes(_blkWorkspace);
  }, [on]);

  return (
    <Tooltip title="Sprawdzaj typy argumentów w wywołaniach funkcji z UML (ostrzeżenie na bloczku)">
      <FormControlLabel
        sx={{ mr: 0.5, ml: 0 }}
        control={
          <Checkbox
            size="small"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
            sx={{ p: 0.25, color: '#585b70', '&.Mui-checked': { color: '#a6e3a1' } }}
          />
        }
        label={
          <Typography sx={{ fontSize: 10, color: on ? '#a6e3a1' : '#6c7086' }}>Typy</Typography>
        }
      />
    </Tooltip>
  );
}

function SlotBlkOverlay({
  slotName,
  onSlotNameChange,
  params,
  onParamsChange,
  blkCode,
  ctx,
  onCodeChange,
  onStateChange,
  initialState,
  onCancel,
  onCommit,
  isEdit,
  existingBody,
}: {
  slotName: string;
  onSlotNameChange: (v: string) => void;
  params: SignalArg[];
  onParamsChange: (p: SignalArg[]) => void;
  blkCode: string;
  ctx: SlotCtx;
  onCodeChange: (code: string) => void;
  /** Workspace JSON for round-tripping Edit Slot. */
  onStateChange?: (state: object | null) => void;
  initialState?: object | null;
  onCancel: () => void;
  onCommit: () => void;
  /** When true, the form is editing an existing slot — button label changes
   *  to "Update Slot" and a hint shows the previous body for reference. */
  isEdit?: boolean;
  /** Previous TS body shown as a read-only reference during edit. Falls back
   *  to a "rebuild from scratch" panel only when no Blockly state was saved
   *  with the slot. */
  existingBody?: string;
}) {
  const ctxRef = useContext(MinisContainerCtx);
  // Capture the DOM element once — never let it change so the portal is stable
  const elRef = useRef<HTMLDivElement | null>(null);
  if (!elRef.current && ctxRef?.current) elRef.current = ctxRef.current;
  const el = elRef.current;
  if (!el) return null;
  const body = indentBody(blkCode);
  const preview = `${slotName || '_'}(${formatParamList(params)}): void {\n${body}\n  }`;
  return createPortal(
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        background: '#13131e',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header: title + Cancel + Add/Update Slot */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.25,
          py: 0.5,
          gap: 0.75,
          borderBottom: '1px solid #313244',
          flexShrink: 0,
          background: '#181825',
        }}
      >
        <Typography sx={{ fontSize: 11, color: '#89dceb', fontWeight: 600 }}>
          {isEdit ? `Edit Slot — ${slotName || '_'}` : 'New Slot'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <TypeCheckToggle />
        <Button
          size="small"
          onClick={onCancel}
          sx={{
            fontSize: 11,
            color: '#cdd6f4',
            textTransform: 'none',
            py: 0.4,
            px: 1,
            minWidth: 0,
            border: '1px solid #45475a',
            bgcolor: '#1e1e2e',
            '&:hover': { bgcolor: '#313244', borderColor: '#6c7086' },
          }}
        >
          Cancel
        </Button>
        <Button
          size="small"
          onClick={onCommit}
          disabled={!slotName.trim()}
          variant="contained"
          sx={{
            fontSize: 11,
            fontWeight: 600,
            bgcolor: '#a6e3a1',
            color: '#13131e',
            textTransform: 'none',
            py: 0.4,
            px: 1.25,
            minWidth: 0,
            flexShrink: 0,
            boxShadow: 'none',
            '&:hover': { bgcolor: '#94d18f', boxShadow: 'none' },
            '&.Mui-disabled': { bgcolor: '#2a3a2a', color: '#6c7086' },
          }}
        >
          {isEdit ? 'Update Slot' : 'Add Slot'}
        </Button>
      </Box>

      {/* Sygnatura — nazwa slotu i lista parametrów. Parametrów bywa kilka
          (sygnał woła slot tyloma wartościami, ile ma jego tupla), więc lista
          rozwija się w pionie zamiast mieścić w jednym wierszu. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          px: 1.25,
          py: 0.5,
          borderBottom: '1px solid #313244',
          flexShrink: 0,
          minWidth: 0,
          maxHeight: 180,
          overflowY: 'auto',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <TextField
            autoFocus
            size="small"
            placeholder="name"
            value={slotName}
            onChange={(e) => {
              const v = e.target.value;
              onSlotNameChange(v ? v[0].toLowerCase() + v.slice(1) : v);
            }}
            inputProps={{
              style: {
                fontSize: 11,
                padding: '2px 6px',
                fontFamily: 'monospace',
                color: '#cdd6f4',
              },
            }}
            sx={{
              width: 130,
              flexShrink: 0,
              '& .MuiOutlinedInput-root': {
                background: '#1e1e2e',
                '& fieldset': { borderColor: '#313244' },
              },
            }}
          />
          <Typography
            sx={{
              fontSize: 10,
              color: '#45475a',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            ({formatParamList(params)}): void
          </Typography>
        </Box>
        <ArgsEditor
          label="Parametry"
          args={params}
          onChange={onParamsChange}
          addLabel="+ parametr"
        />
      </Box>

      {/* Code preview (read-only) */}
      <Box
        sx={{
          px: 1,
          py: 0.4,
          background: '#0d0d1a',
          borderBottom: '1px solid #313244',
          flexShrink: 0,
          maxHeight: 72,
          overflowY: 'auto',
        }}
      >
        <Typography
          component="pre"
          sx={{
            m: 0,
            fontSize: 9,
            color: '#6c7086',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.4,
          }}
        >
          {preview}
        </Typography>
      </Box>

      {/* When editing without saved Blockly state, the old TS body is the
          only thing the user has. Show it so they can rebuild manually.
          When state IS available the workspace rehydrates automatically, so
          this banner is hidden — no need for the warning. */}
      {isEdit && existingBody && !initialState && (
        <Box
          sx={{
            px: 1,
            py: 0.4,
            background: '#181825',
            borderBottom: '1px solid #313244',
            flexShrink: 0,
            maxHeight: 100,
            overflowY: 'auto',
          }}
        >
          <Typography sx={{ fontSize: 9, color: '#f9e2af', fontWeight: 600, mb: 0.25 }}>
            ⚠ Previous body (no saved Blockly state — rebuild required)
          </Typography>
          <Typography
            component="pre"
            sx={{
              m: 0,
              fontSize: 9,
              color: '#a6adc8',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              lineHeight: 1.4,
            }}
          >
            {existingBody}
          </Typography>
        </Box>
      )}

      {/* Blockly workspace — fills the rest of the overlay */}
      <SlotBlocklyEditor
        ctx={ctx}
        onCodeChange={onCodeChange}
        onStateChange={onStateChange}
        initialState={initialState}
      />

      {/* Path builder dialog — single instance per slot overlay; listens to
          globalEventBus so any variable block can pop it open. */}
      <PathBuilderDialog />
      <TypePickerDialog />
      <VarPickerDialog />
      <DocPopup />
    </Box>,
    el
  );
}

/**
 * Thin state shell for the slot builder. All UI lives in SlotBlkOverlay so the
 * Blockly workspace stays mounted as long as the slot builder is open — no
 * mode toggle, no remount.
 */
function SlotBuilder({
  entity,
  onCancel,
  onCommit,
  editSlot,
}: {
  entity: MinisEntity;
  onCancel: () => void;
  onCommit: (
    name: string,
    params: SignalArg[],
    body: string,
    state: object | null,
    originalName: string | null
  ) => void;
  /** If set, the builder opens in edit mode with these initial values and
   *  emits the original name on commit so the caller can replace the slot
   *  in the source instead of inserting a new one. `state` is the Blockly
   *  workspace JSON pulled from the saved `@blockly-state` marker. */
  editSlot?: { name: string; params: SignalArg[]; body: string; state?: object | null };
}) {
  const [slotName, setSlotName] = useState(editSlot?.name ?? '');
  // Nowy slot zaczyna od jednego parametru `v` — tak wyglądały wszystkie
  // sloty przed tą zmianą, więc bloczki `param` działają jak dotąd.
  const [params, setParams] = useState<SignalArg[]>(
    editSlot?.params?.length ? editSlot.params : [{ name: 'v', type: 'unknown' }]
  );
  const [blkCode, setBlkCode] = useState('');
  // Latest Blockly workspace JSON. `null` means user emptied the workspace;
  // distinct from `undefined` (no state yet — fresh mount).
  const [blkState, setBlkState] = useState<object | null>(editSlot?.state ?? null);
  // Depend on the whole entity (not just varName) so that adding a new property
  // or signal while the slot editor is open re-runs buildSlotCtx — otherwise
  // the dropdowns inside Blockly keep an outdated list.
  const ctx = useMemo(() => buildSlotCtx(entity, params), [entity, params]);

  // Zmiana nazwy parametru ma pociągnąć bloczki, które go czytają. Robimy to
  // w efekcie (a nie w handlerze), bo dropdown waliduje wartość względem listy
  // opcji, a ta powstaje z `_blkSlotCtx` ustawianego dopiero w efekcie edytora
  // bloczków — czyli po tym renderze, ale przed tym efektem.
  const prevParamsRef = useRef(params);
  useEffect(() => {
    const prev = prevParamsRef.current;
    prevParamsRef.current = params;
    params.forEach((p, i) => {
      const before = prev[i]?.name?.trim();
      const after = p.name.trim();
      if (before && after && before !== after) renameParamReferences(_blkWorkspace, before, after);
    });
  }, [params]);

  return (
    <SlotBlkOverlay
      slotName={slotName}
      onSlotNameChange={setSlotName}
      params={params}
      onParamsChange={setParams}
      blkCode={blkCode}
      ctx={ctx}
      onCodeChange={setBlkCode}
      onStateChange={setBlkState}
      initialState={editSlot?.state ?? null}
      onCancel={onCancel}
      onCommit={() =>
        onCommit(slotName, params, indentBody(blkCode), blkState, editSlot?.name ?? null)
      }
      isEdit={!!editSlot}
      existingBody={editSlot?.body}
    />
  );
}

/* ── Edytor istniejącej składowej klasy ─────────────────────────────────────*/

/** Rodzaje składowych, które da się wyklikać w listingu klasy. */
type MemberKind = 'signal' | 'property' | 'variable';

const MEMBER_COLOR: Record<MemberKind, string> = {
  signal: '#cba6f7',
  property: '#ce93d8',
  variable: '#f9e2af',
};

const MEMBER_ICON: Record<MemberKind, string> = { signal: '⚡', property: '🔵', variable: '🔸' };

interface MemberSelection {
  kind: MemberKind;
  name: string;
}

/**
 * Lista argumentów — jedna dla sygnału (tupla `Signal<[…]>`) i dla parametrów
 * slotu. Obie strony połączenia są wieloargumentowe, więc panel pokazuje to
 * wprost, zamiast udawać, że argument jest jeden (tak wyglądał stary formularz
 * „New signal" i wiersz sygnatury slotu, na sztywno `(v: T)`).
 */
function ArgsEditor({
  args,
  onChange,
  label = 'Argumenty',
  addLabel = '+ argument',
  emptyHint,
}: {
  args: SignalArg[];
  onChange: (a: SignalArg[]) => void;
  label?: string;
  addLabel?: string;
  emptyHint?: string;
}) {
  const patch = (i: number, p: Partial<SignalArg>) =>
    onChange(args.map((a, k) => (k === i ? { ...a, ...p } : a)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= args.length) return;
    const next = [...args];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const iconBtn = { p: 0.25, color: '#45475a', '&.Mui-disabled': { color: '#25253a' } };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography sx={{ fontSize: 10, color: '#a6adc8' }}>
        {label} ({args.length})
      </Typography>
      {args.length === 0 && (
        <Typography sx={{ fontSize: 10, color: '#585b70', fontStyle: 'italic' }}>
          {emptyHint ?? 'bez argumentów'}
        </Typography>
      )}
      {args.map((a, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder={`arg${i + 1}`}
            value={a.name}
            onChange={(e) => patch(i, { name: e.target.value })}
            inputProps={{ style: { fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' } }}
            sx={{ ...COMBO_INPUT_SX, width: 80 }}
          />
          <Box sx={{ flex: 1, minWidth: 60 }}>
            <TypeComboBox
              value={a.type}
              onChange={(v) => patch(i, { type: v })}
              placeholder="typ"
              fullWidth
            />
          </Box>
          <Tooltip title="W górę">
            <span>
              <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)} sx={iconBtn}>
                <ArrowUpwardIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="W dół">
            <span>
              <IconButton
                size="small"
                disabled={i === args.length - 1}
                onClick={() => move(i, 1)}
                sx={iconBtn}
              >
                <ArrowDownwardIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Usuń argument">
            <IconButton
              size="small"
              onClick={() => onChange(args.filter((_, k) => k !== i))}
              sx={iconBtn}
            >
              <CloseIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
      <Button
        size="small"
        onClick={() => onChange([...args, { name: '', type: 'number' }])}
        sx={{
          fontSize: 10,
          textTransform: 'none',
          py: 0.25,
          px: 0.75,
          minWidth: 0,
          alignSelf: 'flex-start',
          color: '#a6e3a1',
          border: '1px solid #a6e3a144',
        }}
      >
        {addLabel}
      </Button>
    </Box>
  );
}

/**
 * Panel edycji zaznaczonej składowej: nazwa, typ (a dla sygnału — cała lista
 * argumentów), wartość domyślna i usunięcie. Zmiana nazwy przenosi też
 * użycia (`this.x`, `instancja.x`), bo inaczej `connect()` zostałby przy
 * nazwie, której już nie ma.
 */
function MemberEditor({
  entity,
  sel,
  onClose,
}: {
  entity: MinisEntity;
  sel: MemberSelection;
  onClose: () => void;
}) {
  const color = MEMBER_COLOR[sel.kind];

  const initial = useMemo(() => {
    if (sel.kind === 'signal') {
      const port = entity.signals.find((p) => p.name === sel.name);
      return { type: '', value: '', args: parseSignalArgs(port?.type ?? '') };
    }
    if (sel.kind === 'property') {
      const def = entity.properties.find((p) => p.name === sel.name);
      return { type: def?.type ?? '', value: def?.default ?? '', args: [] as SignalArg[] };
    }
    const v = entity.variables?.find((p) => p.name === sel.name);
    return { type: v?.type ?? '', value: v?.value ?? '', args: [] as SignalArg[] };
  }, [entity, sel]);

  const [name, setName] = useState(sel.name);
  const [type, setType] = useState(initial.type);
  const [value, setValue] = useState(initial.value);
  const [args, setArgs] = useState<SignalArg[]>(initial.args);
  const [error, setError] = useState<string | null>(null);

  // Składowa z klasy bazowej albo z manifestu nie ma w tym pliku deklaracji,
  // którą dałoby się podmienić — pokazujemy ją, ale bez zapisu.
  const declared = hasFieldInCode(_state.currentCode, entity.varName, sel.name);

  const buildMember = useCallback(
    (n: string): string => {
      if (sel.kind === 'signal') return buildSignalMember(n, args);
      if (sel.kind === 'property') return buildPropertyMember(n, type, value);
      return buildVariableMember(n, type, value);
    },
    [sel.kind, args, type, value]
  );

  const run = useCallback(
    (newMember: string | null, newName: string) => {
      const { uri } = _state;
      if (!uri) return;
      const ok = applyMemberEdit({
        className: entity.varName,
        oldName: sel.name,
        newName,
        newMember,
        instanceVars: instanceVarsOfClass(entity.varName),
        targetUri: uri,
      });
      if (!ok) {
        // Deklaracji nie udało się znaleźć — plik zmieniono poza grafem albo
        // składowa pochodzi z klasy bazowej. Mówimy to wprost, zamiast po cichu
        // nic nie robić.
        setError('Nie znaleziono deklaracji w tej klasie — mogła zostać zmieniona poza edytorem.');
        return;
      }
      onClose();
    },
    [entity.varName, sel.name, onClose]
  );

  const commit = useCallback(() => {
    const n = name.trim();
    if (!n) return;
    run(buildMember(n), n);
  }, [name, buildMember, run]);

  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.75,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        borderTop: `1px solid ${color}33`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: 10, color, flex: 1 }}>
          {MEMBER_ICON[sel.kind]} {sel.kind} · {sel.name}
        </Typography>
        <Tooltip title="Usuń składową">
          <span>
            <IconButton
              size="small"
              disabled={!declared}
              onClick={() => run(null, sel.name)}
              sx={{ p: 0.25, color: '#f38ba8', '&.Mui-disabled': { color: '#45475a' } }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Zamknij">
          <IconButton size="small" onClick={onClose} sx={{ p: 0.25, color: '#45475a' }}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <TextField
        size="small"
        placeholder="nazwa"
        value={name}
        onChange={(e) => {
          const v = e.target.value;
          setName(v ? v[0].toLowerCase() + v.slice(1) : v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onClose();
        }}
        inputProps={{ style: { fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' } }}
        sx={COMBO_INPUT_SX}
      />

      {sel.kind === 'signal' ? (
        <ArgsEditor args={args} onChange={setArgs} emptyHint="sygnał bez argumentów — emit()" />
      ) : (
        <>
          <TypeComboBox
            value={type}
            onChange={setType}
            placeholder="typ"
            onCommit={commit}
            onCancel={onClose}
          />
          <DefaultComboBox
            typeVal={type}
            value={value}
            onChange={setValue}
            onCommit={commit}
            onCancel={onClose}
          />
        </>
      )}

      {!declared && (
        <Typography sx={{ fontSize: 10, color: '#f9e2af' }}>
          Ta składowa nie jest zadeklarowana w klasie {entity.varName} — pochodzi z klasy bazowej
          albo z manifestu. Edytuj ją tam, gdzie powstała.
        </Typography>
      )}
      {error && <Typography sx={{ fontSize: 10, color: '#f38ba8' }}>{error}</Typography>}

      <Typography
        sx={{
          fontSize: 9,
          color: '#585b70',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {buildMember(name.trim() || sel.name)}
      </Typography>

      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Button
          size="small"
          onClick={commit}
          disabled={!name.trim() || !declared}
          sx={{
            fontSize: 10,
            color: '#a6e3a1',
            textTransform: 'none',
            py: 0.25,
            px: 0.75,
            minWidth: 0,
            border: '1px solid #a6e3a144',
          }}
        >
          Zapisz
        </Button>
        <Button
          size="small"
          onClick={onClose}
          sx={{
            fontSize: 10,
            color: '#6c7086',
            textTransform: 'none',
            py: 0.25,
            px: 0.75,
            minWidth: 0,
          }}
        >
          Anuluj
        </Button>
      </Box>
    </Box>
  );
}

/** Jeden wiersz listingu: ikona + klikalne nazwy składowych danego rodzaju. */
function MemberChipRow({
  kind,
  items,
  selected,
  onSelect,
  editable,
}: {
  kind: MemberKind;
  items: Array<{ name: string; label: string }>;
  selected: string | null;
  onSelect: (name: string) => void;
  /** Nazwy, których deklaracja jest w tej klasie — reszta otwiera się tylko do odczytu. */
  editable: (name: string) => boolean;
}) {
  if (items.length === 0) return null;
  const color = MEMBER_COLOR[kind];
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, flexWrap: 'wrap', py: 0.25 }}>
      <Typography sx={{ fontSize: 10, color, lineHeight: 1.6 }}>{MEMBER_ICON[kind]}</Typography>
      {items.map((it) => {
        const can = editable(it.name);
        const isSel = selected === it.name;
        return (
          <Box
            key={it.name}
            component="span"
            // Klikalne jest każde — także to bez deklaracji w pliku. Wyszarzony
            // wpis, który nic nie robi po kliknięciu, wygląda jak zepsuty panel;
            // powód mówi dopiero edytor, który się otwiera.
            onClick={() => onSelect(it.name)}
            title={
              can
                ? 'Kliknij, aby edytować'
                : 'Odziedziczone lub z manifestu — otworzy się tylko do odczytu'
            }
            sx={{
              fontSize: 10,
              lineHeight: 1.6,
              fontFamily: 'monospace',
              px: 0.5,
              borderRadius: 0.5,
              color: can ? color : '#7f849c',
              cursor: 'pointer',
              background: isSel ? `${color}33` : `${color}11`,
              border: `1px solid ${isSel ? color : `${color}33`}`,
              '&:hover': { background: `${color}22`, borderColor: color },
            }}
          >
            {it.label}
          </Box>
        );
      })}
    </Box>
  );
}

/* ── Class builder panel (shown when a class entity is selected) ─────────────*/

// `variable` is a plain TypeScript class field — `name: T = default;`.
// Distinct from `property` (which wraps the value in `Property<T>` for
// observability). Use this when the value doesn't need a `.changed` signal.
type ClassMemberMode = 'signal' | 'property' | 'variable' | 'slot';

function ClassBuilderPanel({
  entity,
  onClose,
  pendingEditSlotName,
  onPendingConsumed,
}: {
  entity: MinisEntity;
  onClose: () => void;
  /** Set by the parent when a `minislib:editSlot` event matches this class.
   *  We open Edit Slot for that slot then call onPendingConsumed to clear. */
  pendingEditSlotName?: string;
  onPendingConsumed?: () => void;
}) {
  const color = KIND_COLOR['class'];
  const [mode, setMode] = useState<ClassMemberMode | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [defaultVal, setDefaultVal] = useState('');
  // When set, SlotBuilder opens in edit mode pre-populated with these values.
  // Distinct from `null` (closed) and `undefined` (new slot, fresh state).
  const [editSlot, setEditSlot] = useState<{
    name: string;
    params: SignalArg[];
    body: string;
    state?: object | null;
  } | null>(null);
  /** Zaznaczona składowa listingu — jej edytor rozwija się pod listą. */
  const [selected, setSelected] = useState<MemberSelection | null>(null);
  /** Argumenty nowego sygnału — `Signal<[…]>` przyjmuje ich dowolnie wiele. */
  const [newArgs, setNewArgs] = useState<SignalArg[]>([]);

  const reset = () => {
    setMode(null);
    setName('');
    setType('');
    setDefaultVal('');
    setEditSlot(null);
    setNewArgs([]);
  };

  // Zaznaczenie należy do konkretnej klasy — przy przeskoku na inny węzeł
  // zostałoby wskazanie na składową, której tam nie ma.
  useEffect(() => {
    setSelected(null);
  }, [entity.varName]);

  // Sygnały wystawiane przez Property (`x.changed`) mają swój wiersz jako
  // property — w listingu sygnałów byłyby tą samą rzeczą opisaną dwa razy.
  const ownSignals = useMemo(
    () => entity.signals.filter((p) => !p.name.includes('.')),
    [entity.signals]
  );

  // Edytować da się tylko to, co ma deklarację w tej klasie: sygnały z klasy
  // bazowej (childAdded…) i te z manifestu nie mają w pliku czego podmienić.
  const isEditable = useCallback(
    (memberName: string) => hasFieldInCode(_state.currentCode, entity.varName, memberName),
    [entity.varName, _state.currentCode]
  );

  const pick = useCallback((kind: MemberKind, memberName: string) => {
    setMode(null);
    setSelected((prev) =>
      prev && prev.kind === kind && prev.name === memberName ? null : { kind, name: memberName }
    );
  }, []);

  // React to pending Edit Slot requests from the parent. Pulling the slot
  // freshly from `entity.slots` each time means we always have the up-to-date
  // body/params even after a re-parse swapped the entity object identity.
  useEffect(() => {
    if (!pendingEditSlotName) return;
    const slot = entity.slots.find((s) => s.name === pendingEditSlotName);
    if (!slot) return; // entity may have just been re-parsed without this slot yet — wait
    if (slot.params === undefined || slot.body === undefined) {
      onPendingConsumed?.();
      return;
    }
    setEditSlot({
      name: slot.name,
      params: slot.params,
      body: slot.body,
      state: slot.state ?? null,
    });
    setMode('slot');
    onPendingConsumed?.();
  }, [pendingEditSlotName, entity, onPendingConsumed]);

  // When type changes, auto-populate defaultVal with first suggestion (if still empty / was auto-set)
  const handleTypeChange = useCallback(
    (newType: string) => {
      setType(newType);
      if (mode === 'property' || mode === 'variable') {
        const suggestions = defaultsForType(newType);
        if (suggestions.length > 0) setDefaultVal(suggestions[0]);
      }
    },
    [mode]
  );

  const commit = useCallback(() => {
    const { uri } = _state;
    if (!uri || !name.trim()) return;
    const n = name.trim();
    const t = type.trim() || 'unknown';
    let memberCode = '';
    if (mode === 'signal') memberCode = buildSignalMember(n, newArgs);
    else if (mode === 'property') memberCode = buildPropertyMember(n, t, defaultVal);
    else if (mode === 'variable') memberCode = buildVariableMember(n, t, defaultVal);
    else if (mode === 'slot') memberCode = `${n}(v: ${t}): void {}`; // zaślepka — pełną sygnaturę ustawia SlotBuilder
    if (memberCode) insertMemberIntoClass(memberCode, entity.varName, uri);
    reset();
  }, [mode, name, type, defaultVal, newArgs, entity.varName]);

  return (
    <Box sx={{ borderTop: '1px solid #313244', background: '#13131e' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, gap: 1 }}>
        <span style={{ fontSize: 14 }}>🏛</span>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entity.varName}
        </Typography>
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose} sx={{ color: '#45475a', p: 0.25 }}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider sx={{ borderColor: '#313244' }} />

      {(entity.signals.length > 0 ||
        entity.slots.length > 0 ||
        entity.properties.length > 0 ||
        (entity.variables?.length ?? 0) > 0) && (
        <Box sx={{ px: 1.5, py: 0.5 }}>
          <MemberChipRow
            kind="signal"
            items={ownSignals.map((p) => ({
              name: p.name,
              label: `${p.name}(${parseSignalArgs(p.type).length})`,
            }))}
            selected={selected?.kind === 'signal' ? selected.name : null}
            onSelect={(n) => pick('signal', n)}
            editable={isEditable}
          />
          <MemberChipRow
            kind="property"
            items={entity.properties.map((p) => ({ name: p.name, label: `${p.name}: ${p.type}` }))}
            selected={selected?.kind === 'property' ? selected.name : null}
            onSelect={(n) => pick('property', n)}
            editable={isEditable}
          />
          <MemberChipRow
            kind="variable"
            items={(entity.variables ?? []).map((v) => ({
              name: v.name,
              label: `${v.name}: ${v.type}`,
            }))}
            selected={selected?.kind === 'variable' ? selected.name : null}
            onSelect={(n) => pick('variable', n)}
            editable={isEditable}
          />
          {entity.slots.length > 0 && (
            <Typography sx={{ fontSize: 10, color: '#89dceb', lineHeight: 1.8 }}>
              ↩ {entity.slots.map((s) => s.name).join('  ·  ')}
            </Typography>
          )}
        </Box>
      )}

      {selected && (
        <MemberEditor
          key={`${selected.kind}:${selected.name}`}
          entity={entity}
          sel={selected}
          onClose={() => setSelected(null)}
        />
      )}

      <Divider sx={{ borderColor: '#313244' }} />

      {!mode ? (
        <Box sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {(['signal', 'property', 'variable', 'slot'] as ClassMemberMode[]).map((m) => {
            // Variable = warm yellow to set it apart from `property` (lavender)
            // — both edit a stored value, but `property` is observable and
            // `variable` isn't.
            const c =
              m === 'signal'
                ? '#cba6f7'
                : m === 'property'
                  ? '#ce93d8'
                  : m === 'variable'
                    ? '#f9e2af'
                    : '#89dceb';
            return (
              <Button
                key={m}
                size="small"
                onClick={() => setMode(m)}
                sx={{
                  fontSize: 10,
                  textTransform: 'none',
                  py: 0.25,
                  px: 0.75,
                  minWidth: 0,
                  color: c,
                  border: `1px solid ${c}44`,
                }}
              >
                + {m.charAt(0).toUpperCase() + m.slice(1)}
              </Button>
            );
          })}
        </Box>
      ) : mode === 'slot' ? (
        <SlotBuilder
          entity={entity}
          onCancel={reset}
          editSlot={editSlot ?? undefined}
          onCommit={(slotName, slotParams, body, state, originalName) => {
            const { uri } = _state;
            if (!uri || !slotName.trim()) return;
            // Prepend the @blockly-state marker so Edit Slot can rehydrate
            // the same blocks next time. Marker lives in a regular `//`
            // comment — invisible to the runtime, ignored by TypeScript.
            const stateLine = state
              ? `    // ${BLOCKLY_STATE_MARKER} ${encodeBlocklyState(state)}\n`
              : '';
            const memberCode = `${slotName}(${formatParamList(slotParams)}): void {\n${stateLine}${body}\n  }`;
            if (originalName) {
              // Edit existing slot — replace its definition in the source
              if (!replaceSlotInClass(originalName, memberCode, entity.varName, uri)) {
                // Fallback: original slot couldn't be located (file was modified
                // outside the graph). Insert as new so user's work isn't lost.
                insertMemberIntoClass(memberCode, entity.varName, uri);
              }
            } else {
              insertMemberIntoClass(memberCode, entity.varName, uri);
            }
            // Slot mógł wywołać funkcje z projektów UML — dopisujemy dla nich
            // importy, żeby zapisany kod od razu się kompilował.
            ensureUmlImports(uri);
            reset();
          }}
        />
      ) : (
        <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography sx={{ fontSize: 10, color: '#a6adc8' }}>New {mode}</Typography>
          {/* name — plain text, no suggestions; first char forced lowercase */}
          <TextField
            size="small"
            autoFocus
            placeholder="name"
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              setName(v ? v[0].toLowerCase() + v.slice(1) : v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') reset();
            }}
            inputProps={{ style: { fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' } }}
            sx={COMBO_INPUT_SX}
          />
          {/* Sygnał opisuje lista argumentów (tupla), reszta — jeden typ. */}
          {mode === 'signal' ? (
            <ArgsEditor
              args={newArgs}
              onChange={setNewArgs}
              emptyHint="sygnał bez argumentów — emit()"
            />
          ) : (
            <TypeComboBox
              value={type}
              onChange={handleTypeChange}
              placeholder="type"
              onCommit={commit}
              onCancel={reset}
            />
          )}
          {/* default value — shown for property AND variable (both store a value).
              Signal has no default; slot uses BlocklySlotBuilder, not this form. */}
          {(mode === 'property' || mode === 'variable') && (
            <DefaultComboBox
              typeVal={type}
              value={defaultVal}
              onChange={setDefaultVal}
              onCommit={commit}
              onCancel={reset}
            />
          )}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button
              size="small"
              onClick={commit}
              disabled={!name.trim()}
              sx={{
                fontSize: 10,
                color: '#a6e3a1',
                textTransform: 'none',
                py: 0.25,
                px: 0.75,
                minWidth: 0,
                border: '1px solid #a6e3a144',
              }}
            >
              Add
            </Button>
            <Button
              size="small"
              onClick={reset}
              sx={{
                fontSize: 10,
                color: '#6c7086',
                textTransform: 'none',
                py: 0.25,
                px: 0.75,
                minWidth: 0,
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ── New-class button ────────────────────────────────────────────────────────*/

function NewClassButton({ uri, onCreated }: { uri: string; onCreated: (varName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [baseIdx, setBaseIdx] = useState(0); // 0 = Node (default), 1 = CoreObject
  const anchorRef = useRef<HTMLButtonElement>(null);

  const handleCreate = useCallback(() => {
    if (!name.trim() || !uri) return;
    const varName = name.trim();
    const { value, pkg } = BASE_CLASS_OPTIONS[baseIdx];
    insertNewClass(varName, value, pkg, uri);
    onCreated(varName);
    setName('');
    setOpen(false);
  }, [name, uri, baseIdx, onCreated]);

  return (
    <>
      <Tooltip title="Define a new CoreObject subclass">
        <Button
          ref={anchorRef}
          size="small"
          onClick={() => setOpen((v) => !v)}
          sx={{
            fontSize: 10,
            color: '#cba6f7',
            textTransform: 'none',
            py: 0,
            px: 1,
            minWidth: 0,
            borderLeft: '1px solid #313244',
            borderRadius: 0,
            '&:hover': { background: '#1e1e3e' },
          }}
        >
          + Class
        </Button>
      </Tooltip>
      <Menu
        anchorEl={anchorRef.current}
        open={open}
        onClose={() => {
          setOpen(false);
          setName('');
        }}
        PaperProps={{
          sx: {
            background: '#1e1e2e',
            border: '1px solid #313244',
            p: 1,
            minWidth: 220,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box
          sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Base class toggle */}
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            {BASE_CLASS_OPTIONS.map((opt, i) => (
              <Button
                key={opt.value}
                size="small"
                onClick={() => setBaseIdx(i)}
                sx={{
                  fontSize: 10,
                  textTransform: 'none',
                  py: 0.2,
                  px: 0.75,
                  minWidth: 0,
                  flex: 1,
                  color: baseIdx === i ? '#cba6f7' : '#45475a',
                  background: baseIdx === i ? '#2d2040' : 'transparent',
                  border: `1px solid ${baseIdx === i ? '#cba6f7' : '#313244'}`,
                }}
              >
                {opt.label}
              </Button>
            ))}
          </Box>
          {/* Name + Create */}
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <TextField
              autoFocus
              size="small"
              placeholder="ClassName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setOpen(false);
                  setName('');
                }
              }}
              inputProps={{
                style: {
                  fontSize: 11,
                  padding: '3px 8px',
                  fontFamily: 'monospace',
                  color: '#cdd6f4',
                },
              }}
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  background: '#181825',
                  color: '#cdd6f4',
                  '& fieldset': { borderColor: '#313244' },
                },
              }}
            />
            <Button
              size="small"
              onClick={handleCreate}
              disabled={!name.trim()}
              sx={{
                fontSize: 10,
                color: '#a6e3a1',
                textTransform: 'none',
                py: 0.25,
                px: 0.75,
                minWidth: 0,
                border: '1px solid #a6e3a144',
              }}
            >
              Create
            </Button>
          </Box>
        </Box>
      </Menu>
    </>
  );
}

/* ── Add-node toolbar ────────────────────────────────────────────────────────*/

interface FlatEntry {
  packageName: string;
  className: string;
  paramDefs?: ParamDef[];
}

const BUILTIN_MINISLIB_ENTRIES: FlatEntry[] = [
  { packageName: '@hestia/core', className: 'CoreObject' },
  { packageName: '@hestia/core', className: 'Timer', paramDefs: BUILTIN_PARAM_DEFS['timer'] },
  { packageName: '@hestia/core', className: 'Property', paramDefs: BUILTIN_PARAM_DEFS['property'] },
  { packageName: '@hestia/core', className: 'StateMachine' },
  { packageName: '@hestia/core', className: 'EventBus' },
  {
    packageName: '@hestia/core',
    className: 'CommandStack',
    paramDefs: BUILTIN_PARAM_DEFS['commandstack'],
  },
  { packageName: '@hestia/core', className: 'ListModel' },
  { packageName: '@hestia/core', className: 'Logger', paramDefs: BUILTIN_PARAM_DEFS['logger'] },
  { packageName: '@hestia/core', className: 'Signal' },
];

function AddNodeMenu({
  uri: _uri,
  externalClassDefs,
  importedClasses,
  entities,
}: {
  uri: string;
  externalClassDefs: ExternalClassEntry[];
  importedClasses: ImportedClass[];
  entities: MinisEntity[];
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (anchorEl) setTimeout(() => filterRef.current?.focus(), 50);
    else setFilter('');
  }, [anchorEl]);

  // Build flat list: builtins, then manifest entries, then in-file classes,
  // then plain imports (deduplicated). The in-file branch picks up
  // `class X extends Node {}` declared next to the wiring code — without it
  // user-defined classes never showed up in Add Instance.
  const allEntries: FlatEntry[] = useMemo(() => {
    const manifestNames = new Set(externalClassDefs.map((e) => e.className));
    const fromManifest: FlatEntry[] = externalClassDefs.map((e) => ({
      packageName: e.packageName,
      className: e.className,
      paramDefs: e.def.paramDefs,
    }));
    const fromLocal: FlatEntry[] = entities
      .filter((e) => e.kind === 'class' && !manifestNames.has(e.varName))
      .map((e) => ({ packageName: '__project__', className: e.varName, paramDefs: e.paramDefs }));
    const localNames = new Set(fromLocal.map((e) => e.className));
    const fromImports: FlatEntry[] = importedClasses
      .filter(({ className }) => !manifestNames.has(className) && !localNames.has(className))
      .map(({ packageName, className }) => ({ packageName, className }));
    return [...BUILTIN_MINISLIB_ENTRIES, ...fromManifest, ...fromLocal, ...fromImports];
  }, [externalClassDefs, importedClasses, entities]);

  const q = filter.toLowerCase();
  const visible = q
    ? allEntries.filter(
        (e) => e.className.toLowerCase().includes(q) || e.packageName.toLowerCase().includes(q)
      )
    : allEntries;

  // Group entries by package, preserving first-seen order (builtins → manifest → imports).
  // While filtering, force groups expanded so users always see what matched.
  const groups = useMemo(() => {
    const map = new Map<string, FlatEntry[]>();
    for (const e of visible) {
      const arr = map.get(e.packageName);
      if (arr) arr.push(e);
      else map.set(e.packageName, [e]);
    }
    return Array.from(map.entries());
  }, [visible]);

  const toggleGroup = (pkg: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  };

  const handleInsert = (entry: FlatEntry) => {
    setAnchorEl(null);
    const targetUri = _state.uri;
    if (!targetUri || targetUri.startsWith('virtual://')) return;
    const taken = new Set(_state.entities.map((e) => e.varName));
    const base = entry.className.charAt(0).toLowerCase() + entry.className.slice(1);
    const varName = generateVarName(base, taken);
    // Timer.create(ms) is the correct API — new Timer() sets no interval.
    let snippet: string;
    if (entry.className === 'Timer') {
      snippet = `const ${varName} = Timer.create(1000);\n`;
    } else if (entry.paramDefs) {
      snippet = generateExternalSnippet(entry.className, entry.paramDefs).replace(
        /^const \w+/,
        `const ${varName}`
      );
    } else {
      snippet = `const ${varName} = new ${entry.className}();\n`;
    }

    // Patch import for npm packages (manifest entries + bare imports). Skip
    // pseudo-packages like '__project__' (local class in same file) and any
    // unknown source — those need no import line.
    const pkg = entry.packageName;
    const needsImport = pkg && pkg !== '__project__' && !pkg.startsWith('virtual://');
    if (needsImport) {
      const model = findModel(targetUri);
      if (model) {
        const patched = patchImportsInCode(model.getValue(), [{ pkg, name: entry.className }], []);
        replaceModelContent(model, patched);
      }
    }

    const inserted = insertAtEnd(snippet, targetUri);
    addSnippet(snippet, inserted);
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.5,
          gap: 0.75,
          borderBottom: '1px solid #313244',
          background: '#13131e',
          flexWrap: 'wrap',
        }}
      >
        <Button
          size="small"
          startIcon={<AddCircleOutlineIcon sx={{ fontSize: 13 }} />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            fontSize: 11,
            color: '#cba6f7',
            textTransform: 'none',
            py: 0.25,
            px: 1,
            minWidth: 0,
            '&:hover': { background: '#2d2040' },
          }}
        >
          Add instance
        </Button>
        <ExportManifestButton uri={_uri} entities={entities} />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        PaperProps={{
          sx: { background: '#1e1e2e', border: '1px solid #313244', minWidth: 260, py: 0 },
        }}
      >
        {/* Filter input */}
        <Box sx={{ px: 1, pt: 1, pb: 0.5 }} onKeyDown={(e) => e.stopPropagation()}>
          <TextField
            inputRef={filterRef}
            size="small"
            placeholder="Filter classes…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            fullWidth
            sx={{
              '& .MuiInputBase-root': {
                fontSize: 12,
                background: '#13131e',
                color: '#cdd6f4',
                height: 28,
              },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
              '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#cba6f7',
              },
              '& input': { py: 0, px: 1 },
            }}
          />
        </Box>
        <Divider sx={{ borderColor: '#313244' }} />

        {visible.length === 0 && (
          <Typography sx={{ fontSize: 11, color: '#45475a', px: 2, py: 1 }}>No matches</Typography>
        )}
        <Box sx={{ maxHeight: 480, overflowY: 'auto' }}>
          {groups.map(([pkg, items]) => {
            // While filtering, force expanded so user sees every hit.
            const isCollapsed = !q && collapsed.has(pkg);
            const isBuiltin = pkg === '@hestia/core';
            const isLocal = pkg === '__project__';
            const headerIcon = isBuiltin ? '⚡' : isLocal ? '🏛' : '🧩';
            const headerLabel = isLocal ? 'this file' : pkg;
            const headerColor = isLocal ? '#a6e3a1' : '#cba6f7';
            return (
              <Box key={pkg}>
                <Box
                  onClick={() => toggleGroup(pkg)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.25,
                    py: 0.5,
                    cursor: 'pointer',
                    background: '#181825',
                    borderTop: '1px solid #313244',
                    '&:hover': { background: '#202030' },
                  }}
                >
                  <span style={{ fontSize: 9, width: 10, color: '#6c7086' }}>
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                  <span style={{ fontSize: 13 }}>{headerIcon}</span>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: headerColor,
                      fontWeight: 600,
                      flex: 1,
                      fontFamily: 'monospace',
                    }}
                  >
                    {headerLabel}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: '#6c7086' }}>{items.length}</Typography>
                </Box>
                {!isCollapsed &&
                  items.map((entry) => (
                    <MenuItem
                      key={`${entry.packageName}:${entry.className}`}
                      onClick={() => handleInsert(entry)}
                      sx={{
                        fontSize: 12,
                        color: '#cdd6f4',
                        py: 0.4,
                        pl: 4,
                        gap: 0.75,
                        '&:hover': { background: '#313244' },
                      }}
                    >
                      <Typography sx={{ fontSize: 12, color: '#81c784', fontWeight: 500 }}>
                        {entry.className}
                      </Typography>
                    </MenuItem>
                  ))}
              </Box>
            );
          })}
        </Box>
      </Menu>
    </>
  );
}

/* ── Save source button ──────────────────────────────────────────────────────*/

/**
 * Dopisuje importy dla funkcji UML użytych w ostatnio wygenerowanym slocie.
 *
 * Ścieżkę liczymy względem edytowanego pliku, a symbolem jest klasa (dla metod
 * statycznych) albo sama funkcja (dla globalnych). Importy już obecne w pliku
 * `patchImportsInCode` pomija, więc powtórne zapisy slotu niczego nie duplikują.
 */
function ensureUmlImports(uri: string): void {
  const used = takeUsedUmlCallables();
  if (!used.length) return;
  const model = findModel(uri);
  if (!model) return;

  // URI edytora bywa poprzedzone nazwą mountu (`/user/drive/...`) — do policzenia
  // ścieżki względnej liczy się tylko część wspólna z `linkedFile` z UML.
  const currentFile = uri.replace(/^\/+/, '').replace(/^user\//, '');
  const add: { pkg: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const fn of used) {
    const spec = importSpecifierFor(fn, currentFile);
    if (!spec) continue;
    const key = `${spec}::${fn.importName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    add.push({ pkg: spec, name: fn.importName });
  }
  if (!add.length) return;
  replaceModelContent(model, patchImportsInCode(_state.currentCode, add, []));
}

/* ── Tryb samodzielny — sam edytor bloczków dla pliku bez minislib ────────── */

/** Pusty kontekst slotu: w tym trybie nie ma klasy, więc nie ma jej pól ani sygnałów. */
const EMPTY_SLOT_CTX: SlotCtx = {
  props: [],
  signals: [],
  slots: [],
  vars: [],
  params: [],
  signalArgs: {},
  slotArgs: {},
  exprOpts: [],
  condOpts: [],
};

/**
 * Widok dla pliku, który nie importuje `@hestia/core`.
 *
 * Nie ma tu grafu (brak encji do pokazania), ale sam edytor bloczków bywa
 * potrzebny — choćby do złożenia kodu z funkcji opisanych w projektach UML.
 * Dlatego pokazujemy wyłącznie edytor z toolboxem i jedną ikonę ustawień;
 * cały pasek narzędzi grafu byłby tu bez sensu.
 *
 * Bloczki żyją w pamięci karty, więc jest jeszcze druga ikona: wstawienie
 * wygenerowanego kodu do pliku. Bez niej z tego, co się ułoży, nic nie wynika.
 */
function StandaloneBlocklyView({ uri }: { uri: string }) {
  const [code, setCode] = useState('');
  const [inserted, setInserted] = useState(false);

  const insertIntoFile = useCallback(() => {
    const model = findModel(uri);
    if (!model || !code.trim()) return;
    const current = model.getValue();
    // Dopisujemy na końcu pliku — pozycja kursora bywa gdziekolwiek, a wstawianie
    // w środek istniejącej deklaracji rozjechałoby kod.
    const next = `${current.replace(/\s*$/, '')}\n\n${code.replace(/\s*$/, '')}\n`;
    replaceModelContent(model, next);
    // Funkcje z UML użyte w bloczkach potrzebują importów.
    ensureUmlImports(uri);
    setInserted(true);
    setTimeout(() => setInserted(false), 2000);
  }, [uri, code]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#181825' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          borderBottom: '1px solid #313244',
        }}
      >
        <Typography sx={{ flex: 1, minWidth: 0, px: 1, fontSize: 10, color: '#6c7086' }} noWrap>
          Edytor bloczków — plik bez <code>@hestia/core</code>
        </Typography>
        <Tooltip
          title={
            code.trim()
              ? 'Wstaw wygenerowany kod na końcu pliku'
              : 'Ułóż bloczki, aby był kod do wstawienia'
          }
        >
          <span>
            <IconButton
              size="small"
              disabled={!code.trim()}
              onClick={insertIntoFile}
              sx={{
                px: 1,
                borderLeft: '1px solid #313244',
                borderRadius: 0,
                color: inserted ? '#a6e3a1' : '#585b70',
                '&:hover': { color: '#cdd6f4', background: '#1e1e2e' },
              }}
            >
              {inserted ? <CheckIcon sx={{ fontSize: 16 }} /> : <SaveIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </span>
        </Tooltip>
        <OptionsButton uri={uri} />
      </Box>
      {/* `SlotBlocklyEditor` rozciąga się przez `flex: 1`, więc kontener MUSI być
          flex-column — inaczej edytor zostaje na swojej minimalnej wysokości. */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <SlotBlocklyEditor ctx={EMPTY_SLOT_CTX} onCodeChange={setCode} />
      </Box>
    </Box>
  );
}

/* ── Options — ustawienia pluginu (zakładka Blockly: projekty UML) ────────── */

function OptionsButton({ uri }: { uri: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'blockly'>('blockly');
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(() => readUmlPref(uri));
  const [loading, setLoading] = useState(false);
  const [callables, setCallables] = useState<UmlCallable[]>([]);
  const [typeCount, setTypeCount] = useState(0);
  // Źródło projektów: ten serwer albo zdalny MyCastle (adres + użytkownik + token).
  const [source, setSource] = useState<UmlSourceConfig>(() => readUmlSource());
  const [password, setPassword] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);

  // Wybór z poprzedniej sesji zasila bloczki od razu po otwarciu pliku — bez tego
  // dropdown byłby pusty do czasu, aż ktoś zajrzy w Options.
  useEffect(() => {
    const pref = readUmlPref(uri);
    setSelected(pref);
    if (!pref.length) {
      setUmlCallables([]);
      setUmlTypes([]);
      return;
    }
    void loadUmlProjectData(pref).then(({ callables: fns, types }) => {
      setUmlCallables(fns);
      setUmlTypes(types);
      setCallables(fns);
      setTypeCount(types.length);
    });
  }, [uri]);

  const refreshFiles = useCallback(async (cfg: UmlSourceConfig) => {
    setLoading(true);
    setSourceError(null);
    try {
      setFiles(await listUmlProjects(cfg));
    } catch (e) {
      setFiles([]);
      setSourceError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = useCallback(async () => {
    setOpen(true);
    const cfg = readUmlSource();
    setSource(cfg);
    await refreshFiles(cfg);
  }, [refreshFiles]);

  /** Zapisuje źródło i odświeża listę — jedna droga dla każdej zmiany pola. */
  const applySource = useCallback(
    async (patch: Partial<UmlSourceConfig>, reload = true) => {
      const next = { ...source, ...patch };
      setSource(next);
      writeUmlSource(next);
      if (reload) await refreshFiles(next);
    },
    [source, refreshFiles]
  );

  const handleConnect = useCallback(async () => {
    setSourceBusy(true);
    setSourceError(null);
    try {
      const token = await loginForToken(source.baseUrl, source.userName, password);
      setPassword('');
      await applySource({ token });
    } catch (e) {
      setSourceError((e as Error).message);
    } finally {
      setSourceBusy(false);
    }
  }, [source.baseUrl, source.userName, password, applySource]);

  const toggle = useCallback(
    async (file: string) => {
      const next = selected.includes(file)
        ? selected.filter((f) => f !== file)
        : [...selected, file];
      setSelected(next);
      writeUmlPref(uri, next);
      const { callables: fns, types } = await loadUmlProjectData(next, source);
      setUmlCallables(fns);
      setUmlTypes(types);
      setCallables(fns);
      setTypeCount(types.length);
    },
    [selected, uri, source]
  );

  return (
    <>
      <Tooltip title="Options">
        <IconButton
          size="small"
          onClick={handleOpen}
          sx={{
            px: 1,
            borderLeft: '1px solid #313244',
            borderRadius: 0,
            color: '#585b70',
            '&:hover': { color: '#cdd6f4', background: '#1e1e2e' },
          }}
        >
          <SettingsIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 0 }}>Options</DialogTitle>
        <DialogContent>
          <Tabs
            value={tab}
            onChange={(_, v: 'blockly') => setTab(v)}
            sx={{
              mb: 1,
              minHeight: 34,
              '& .MuiTab-root': { minHeight: 34, textTransform: 'none' },
            }}
          >
            <Tab value="blockly" label="Blockly" />
          </Tabs>

          <Typography sx={{ fontSize: 12, color: '#9399b2', mb: 1 }}>
            Wybierz projekty UML (Programming/UML). Funkcje globalne i metody statyczne pojawią się
            w edytorze slotu jako bloczki w kategoriach nazwanych klasą lub plikiem; funkcje `async`
            dostają <code>await</code>, a import dopisuje się przy zapisie slotu. Klasy i interfejsy
            z projektów trafiają do okna wyboru typu zmiennej.
          </Typography>

          {/* ── Serwer projektów UML ─────────────────────────────── */}
          <Box sx={{ border: '1px solid #313244', borderRadius: 1, p: 1, mb: 1.5 }}>
            <Typography
              sx={{
                fontSize: 11,
                color: '#9399b2',
                mb: 0.5,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Serwer projektów UML
            </Typography>
            <RadioGroup
              row
              value={source.mode}
              onChange={(e) => void applySource({ mode: e.target.value as UmlSourceMode })}
              sx={{ mb: source.mode === 'remote' ? 1 : 0 }}
            >
              <FormControlLabel
                value="local"
                control={<Radio size="small" />}
                label={<Typography sx={{ fontSize: 12 }}>Ten serwer</Typography>}
              />
              <FormControlLabel
                value="remote"
                control={<Radio size="small" />}
                label={<Typography sx={{ fontSize: 12 }}>Zdalny (web API VFS)</Typography>}
              />
            </RadioGroup>

            {source.mode === 'remote' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <TextField
                  size="small"
                  label="Adres serwera"
                  value={source.baseUrl}
                  onChange={(e) => setSource((s) => ({ ...s, baseUrl: e.target.value }))}
                  onBlur={() => void applySource({ baseUrl: source.baseUrl })}
                  placeholder={DEFAULT_UML_SERVER}
                  slotProps={{
                    inputLabel: { sx: { fontSize: 12 } },
                    input: { sx: { fontSize: 12 } },
                  }}
                />
                {/* Gotowe adresy — najczęściej to produkcja albo backend na localhost. */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {[DEFAULT_UML_SERVER, 'http://localhost:1894', window.location.origin].map(
                    (preset) => (
                      <Chip
                        key={preset}
                        size="small"
                        label={preset.replace(/^https?:\/\//, '')}
                        onClick={() => void applySource({ baseUrl: preset })}
                        variant={
                          normalizeBaseUrl(source.baseUrl) === normalizeBaseUrl(preset)
                            ? 'filled'
                            : 'outlined'
                        }
                        sx={{ fontSize: 10, height: 22 }}
                      />
                    )
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    label="Użytkownik"
                    value={source.userName}
                    onChange={(e) => setSource((s) => ({ ...s, userName: e.target.value }))}
                    onBlur={() => void applySource({ userName: source.userName })}
                    sx={{ flex: 1 }}
                    slotProps={{
                      inputLabel: { sx: { fontSize: 12 } },
                      input: { sx: { fontSize: 12 } },
                    }}
                  />
                  <TextField
                    size="small"
                    label="Token (JWT / minis_…)"
                    value={source.token}
                    onChange={(e) => setSource((s) => ({ ...s, token: e.target.value }))}
                    onBlur={() => void applySource({ token: source.token })}
                    sx={{ flex: 1.4 }}
                    slotProps={{
                      inputLabel: { sx: { fontSize: 12 } },
                      input: { sx: { fontSize: 12 } },
                    }}
                  />
                </Box>
                {/* Hasło służy tylko do wymiany na token — nie jest nigdzie zapisywane. */}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    type="password"
                    label="Hasło (opcjonalnie)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    sx={{ flex: 1 }}
                    slotProps={{
                      inputLabel: { sx: { fontSize: 12 } },
                      input: { sx: { fontSize: 12 } },
                    }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => void handleConnect()}
                    disabled={sourceBusy || !password || !source.userName}
                    sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                  >
                    {sourceBusy ? 'Łączę…' : 'Połącz'}
                  </Button>
                </Box>
                <Typography sx={{ fontSize: 11, color: '#6c7086' }}>
                  Czytane przez web API:{' '}
                  <code>
                    {'{serwer}'}/api/users/{'{użytkownik}'}/vfs/readdir
                  </code>{' '}
                  →<code> {UML_DIR}</code>. Hasło wymieniamy na token (zapisywany lokalnie), samo
                  hasło nie jest przechowywane.
                </Typography>
              </Box>
            )}

            <Typography sx={{ fontSize: 11, color: sourceError ? '#f38ba8' : '#a6adc8', mt: 1 }}>
              {sourceError ?? `Źródło: ${describeUmlSource(source)}`}
            </Typography>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : files.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: '#6c7086', py: 2 }}>
              Brak projektów w <code>drive/uml</code>
              {source.mode === 'remote'
                ? ' na wskazanym serwerze.'
                : '. Utwórz projekt na stronie Programming → UML.'}
            </Typography>
          ) : (
            <List
              dense
              disablePadding
              sx={{
                maxHeight: 260,
                overflow: 'auto',
                border: '1px solid #313244',
                borderRadius: 1,
              }}
            >
              {files.map((f) => (
                <ListItemButton key={f} onClick={() => void toggle(f)} dense>
                  <Checkbox
                    edge="start"
                    size="small"
                    checked={selected.includes(f)}
                    tabIndex={-1}
                    disableRipple
                  />
                  <ListItemText primary={f.replace(UML_EXT, '')} secondary={f} />
                </ListItemButton>
              ))}
            </List>
          )}

          {selected.length > 0 && (
            <Typography sx={{ fontSize: 11, color: '#a6e3a1', mt: 1 }}>
              Dostępnych funkcji: {callables.length}
              {callables.filter((c) => c.isAsync).length > 0
                ? ` (w tym ${callables.filter((c) => c.isAsync).length} async)`
                : ''}
              {typeCount > 0 ? ` · typów do wyboru w zmiennych: ${typeCount}` : ''}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Zamknij</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function SaveSourceButton({ uri }: { uri: string }) {
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const u1 = globalEventBus.on('system:editor:markDirty', (payload: unknown) => {
      const p = payload as { path?: string };
      if (p?.path && (p.path === uri || p.path.endsWith(uri) || uri.endsWith(p.path))) {
        setDirty(true);
      }
    });
    const u2 = globalEventBus.on('system:editor:didSave', (payload: unknown) => {
      const p = payload as { uri?: string };
      if (p?.uri && (p.uri === uri || p.uri.endsWith(uri) || uri.endsWith(p.uri))) {
        setDirty(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    });
    return () => {
      u1();
      u2();
    };
  }, [uri]);

  const handleSave = useCallback(() => {
    // Delegate to MonacoMultiEditor's saver — it owns the provider, knows
    // which tab is open and clears the modified flag synchronously. Going
    // straight to VFS the old way left the tab dot stuck because
    // MonacoMultiEditor's state didn't see the change.
    const model = findModel(uri);
    if (!model) return;
    const vfsPath = model.uri.path;
    globalEventBus.emit('system:editor:requestSave', { path: vfsPath, uri });
  }, [uri]);

  const color = saved ? '#a6e3a1' : dirty ? '#f9e2af' : '#585b70';
  const tip = saved
    ? 'Saved!'
    : dirty
      ? 'Unsaved changes — click to save (Ctrl+S)'
      : 'Save source file (Ctrl+S)';

  return (
    <Tooltip title={tip}>
      <IconButton
        size="small"
        onClick={handleSave}
        sx={{
          px: 1,
          color,
          borderLeft: '1px solid #313244',
          borderRadius: 0,
          '&:hover': { color: '#cdd6f4', background: '#1e1e2e' },
        }}
      >
        {saved ? <CheckIcon sx={{ fontSize: 16 }} /> : <SaveIcon sx={{ fontSize: 16 }} />}
      </IconButton>
    </Tooltip>
  );
}

/* ── Scene tree helpers ─────────────────────────────────────────────────────*/

interface NodeTreeItem {
  id: string;
  varName: string;
  label: string;
  kind: EntityKind;
  children: NodeTreeItem[];
}

/** Build parent-child tree from entities + constructor first-arg heuristic + addChild() calls. */
function buildNodeTree(entities: MinisEntity[], code: string): NodeTreeItem[] {
  // Scene tree shows only object instances — skip class definitions
  const objects = entities.filter((e) => e.kind !== 'class');
  const byVar = new Map(entities.map((e) => [e.varName, e]));
  const parentOf = new Map<string, string | null>();

  for (const e of objects) {
    let parent: string | null = null;
    if (e.constructorArgs.length > 0) {
      const arg = e.constructorArgs[0].trim();
      if (arg && arg !== 'null' && arg !== 'undefined' && arg !== 'this' && byVar.has(arg))
        parent = arg;
    }
    parentOf.set(e.varName, parent);
  }

  // Also capture explicit addChild() calls
  const addChildRe = /(\w+)\.addChild\s*\(\s*(\w+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = addChildRe.exec(code)) !== null) {
    if (byVar.has(m[1]) && byVar.has(m[2])) parentOf.set(m[2], m[1]);
  }

  const items = new Map<string, NodeTreeItem>();
  for (const e of objects)
    items.set(e.varName, {
      id: e.id,
      varName: e.varName,
      label: e.label,
      kind: e.kind,
      children: [],
    });

  const roots: NodeTreeItem[] = [];
  for (const item of items.values()) {
    const par = parentOf.get(item.varName);
    if (par && items.has(par)) items.get(par)!.children.push(item);
    else roots.push(item);
  }
  return roots;
}

/** Compute the relative import path from `fromFile` to `toFile` (strips .ts extension). */
function toRelativeImportPath(fromFile: string, toFile: string): string {
  const fromDir = fromFile.split('/').slice(0, -1);
  const toParts = toFile.split('/');
  let i = 0;
  while (i < fromDir.length && i < toParts.length && fromDir[i] === toParts[i]) i++;
  const up = fromDir.length - i;
  const rel = [...Array(up).fill('..'), ...toParts.slice(i)].join('/');
  const withoutExt = rel.replace(/\.(ts|tsx)$/, '');
  return withoutExt.startsWith('.') ? withoutExt : './' + withoutExt;
}

/** Read VFS directory contents. Returns [] on error. */
async function vfsReadDir(path: string): Promise<{ name: string; isDir: boolean }[]> {
  try {
    const res = await fetch(vfsApiUrl(path, 'readdir'), { headers: vfsAuthHeader() });
    if (!res.ok) return [];
    const { entries } = (await res.json()) as { entries: { name: string; type: number }[] };
    return entries.map(({ name, type }) => ({ name, isDir: type === 2 }));
  } catch {
    return [];
  }
}

/** Read a VFS file and return its text content. Returns null on error. */
async function vfsReadFileText(path: string): Promise<string | null> {
  try {
    const res = await fetch(vfsApiUrl(path, 'readFile'), { headers: vfsAuthHeader() });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: string };
    return atob(data);
  } catch {
    return null;
  }
}

/* ── Funkcje z projektów UML (Programming/UML) ───────────────────────────────
   Slot może wołać funkcje globalne i metody statyczne opisane w projektach UML.
   Wybór projektów jest per plik (Options → Blockly) i trzymany w localStorage —
   to ustawienie warsztatowe, nie treść pliku, więc nie zaśmieca kodu. */

const UML_DIR = 'drive/uml';
const UML_EXT = '.umlproj.json';
const UML_PREF_KEY = 'minislib.umlProjects';

/**
 * Lista plików projektów UML — z tego serwera albo ze wskazanego zdalnego
 * (Options → Blockly → Serwer projektów UML).
 *
 * Rzuca wyjątkiem tylko przy trybie zdalnym: tam błąd (zły token, brak katalogu)
 * musi być widoczny w dialogu, bo inaczej pusta lista wygląda jak „brak projektów".
 */
async function listUmlProjects(source: UmlSourceConfig = readUmlSource()): Promise<string[]> {
  const { url, headers } = umlEndpoint(source, 'readdir');
  const where = source.mode === 'remote' ? ` z ${normalizeBaseUrl(source.baseUrl)}` : '';
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    throw new Error(`Nie udało się połączyć${where || ' z serwerem'}: ${(e as Error).message}`, {
      cause: e,
    });
  }
  if (!res.ok) {
    const detail =
      res.status === 401 || res.status === 403
        ? 'brak dostępu — sprawdź użytkownika i token'
        : res.status === 404
          ? 'katalog nie istnieje'
          : `HTTP ${res.status}`;
    throw new Error(`Nie udało się odczytać ${UML_DIR}${where}: ${detail}`);
  }
  const { entries } = (await res.json()) as { entries?: Array<{ name: string; type: number }> };
  return filterUmlEntries(entries);
}

/** Treść pliku projektu UML z aktywnego źródła. */
async function readUmlProjectText(file: string, source: UmlSourceConfig): Promise<string | null> {
  try {
    const { url, headers } = umlEndpoint(source, 'readFile', file);
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: string };
    return base64ToUtf8(data);
  } catch {
    return null;
  }
}

/**
 * Wczytuje wybrane projekty: funkcje do bloczków i typy do okna wyboru typu.
 * Jedno przejście po plikach, bo obie listy pochodzą z tego samego JSON-a.
 */
async function loadUmlProjectData(
  files: string[],
  source: UmlSourceConfig = readUmlSource()
): Promise<{ callables: UmlCallable[]; types: UmlType[] }> {
  const callables: UmlCallable[] = [];
  const types: UmlType[] = [];
  for (const file of files) {
    const text = await readUmlProjectText(file, source);
    if (!text) continue;
    try {
      const project = JSON.parse(text) as UmlProjectLike;
      callables.push(...extractCallables(project, file));
      types.push(...extractTypes(project, file));
    } catch {
      // Uszkodzony projekt pomijamy — jeden zły plik nie może odciąć pozostałych.
    }
  }
  return { callables, types };
}

/** Wybrane projekty UML dla danego pliku (klucz = URI, bo różne pliki mają różny kontekst). */
function readUmlPref(uri: string): string[] {
  try {
    const raw = localStorage.getItem(`${UML_PREF_KEY}:${uri}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeUmlPref(uri: string, files: string[]): void {
  try {
    localStorage.setItem(`${UML_PREF_KEY}:${uri}`, JSON.stringify(files));
  } catch {
    /* tryb prywatny */
  }
}

/** Extract the class name from a MinisEntity (label = "varName:ClassName" for instances). */
function getEntityClassName(entity: MinisEntity): string {
  if (entity.kind === 'class') return entity.varName;
  const idx = entity.label.indexOf(':');
  return idx >= 0 ? entity.label.slice(idx + 1) : entity.varName;
}

/** Remove a variable declaration (const/let/var x = ...) from source code. */
function deleteEntityFromCode(code: string, varName: string): string {
  const entity = _state.entities.find((e) => e.varName === varName);

  // Classes: brace-counted block removal (the variable regex below only handles
  // `const foo = ...` style declarations, so without this user couldn't delete
  // a class from the graph — × button would do nothing).
  if (entity?.kind === 'class') {
    const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:export\\s+)?(?:abstract\\s+)?class\\s+${esc}\\b[^{]*\\{`);
    const m = re.exec(code);
    if (m) {
      const openIdx = m.index + m[0].length - 1;
      let depth = 1;
      let i = openIdx + 1;
      while (i < code.length && depth > 0) {
        const c = code[i];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
      }
      if (depth === 0) {
        // Eat one trailing newline so we don't leave a blank line behind.
        const endIdx = code[i] === '\n' ? i + 1 : i;
        return code.slice(0, m.index) + code.slice(endIdx);
      }
    }
    // Regex failed to find the class — fall through to the variable-style
    // removal below so we at least try; better than silent no-op.
  }

  const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match full declaration line including trailing newline
  return code.replace(
    new RegExp(`^(?:const|let|var)\\s+${esc}(?::[^=\\n;]+)?\\s*=\\s*[^\\n]+;?\\r?\\n?`, 'gm'),
    ''
  );
}

/* ── Import manager helpers ─────────────────────────────────────────────────*/

/** Parse ALL named imports (including relative paths) from TypeScript source. */
function parseAllImports(code: string): { packageName: string; names: string[] }[] {
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  const result: { packageName: string; names: string[] }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const names = m[1]
      .split(',')
      .map((n) =>
        n
          .trim()
          .split(/\s+as\s+/)[0]
          .trim()
      )
      .filter(Boolean);
    if (names.length > 0) result.push({ packageName: m[2], names });
  }
  return result;
}

/** Read package.json dependencies from VFS. */
async function readPackageJsonDeps(projectRoot: string): Promise<string[]> {
  try {
    const path = `${projectRoot}/package.json`;
    const res = await fetch(vfsApiUrl(path, 'readFile'), { headers: vfsAuthHeader() });
    if (!res.ok) return [];
    const { data } = (await res.json()) as { data: string };
    const pkg = JSON.parse(atob(data)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
  } catch {
    return [];
  }
}

const _SCAN_SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  '__tests__',
  '.cache',
]);

/**
 * Recursively collect .ts/.tsx file paths under rootDir, skipping common non-source dirs.
 * Excludes the current file (currentUri) and .d.ts files.
 */
/**
 * Find all exported class names in a TypeScript file.
 * Catches both `export class Foo` and `export default class Foo`.
 * Used when scanning project files that may not import minislib directly.
 */
function parseExportedClassNames(code: string): string[] {
  const names: string[] = [];
  const re = /export\s+(?:default\s+)?class\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) names.push(m[1]);
  return names;
}

async function scanProjectTsFiles(
  rootDir: string,
  currentUri: string,
  maxDepth = 4
): Promise<string[]> {
  const results: string[] = [];
  async function scan(dir: string, depth: number) {
    if (depth > maxDepth) return;
    const entries = await vfsReadDir(dir);
    await Promise.all(
      entries.map(async ({ name, isDir }) => {
        if (isDir) {
          if (!_SCAN_SKIP.has(name)) await scan(`${dir}/${name}`, depth + 1);
        } else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.d.ts')) {
          const fullPath = `${dir}/${name}`;
          if (fullPath !== currentUri) results.push(fullPath);
        }
      })
    );
  }
  await scan(rootDir, 0);
  return results;
}

/**
 * Patch named import statements in TypeScript source.
 * add: [{pkg, name}] — names to add to import { ... } from 'pkg'
 * remove: [{pkg, name}] — names to remove (removes whole line if empty)
 */
function patchImportsInCode(
  code: string,
  add: { pkg: string; name: string }[],
  remove: { pkg: string; name: string }[]
): string {
  const addByPkg = new Map<string, Set<string>>();
  for (const { pkg, name } of add) {
    if (!addByPkg.has(pkg)) addByPkg.set(pkg, new Set());
    addByPkg.get(pkg)!.add(name);
  }
  const removeByPkg = new Map<string, Set<string>>();
  for (const { pkg, name } of remove) {
    if (!removeByPkg.has(pkg)) removeByPkg.set(pkg, new Set());
    removeByPkg.get(pkg)!.add(name);
  }

  let result = code;
  const allPkgs = new Set([...addByPkg.keys(), ...removeByPkg.keys()]);

  // Process packages in reverse-index order so splice offsets stay valid
  const matchedRanges: { pkg: string; start: number; end: number; match: string }[] = [];
  for (const pkg of allPkgs) {
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escaped}['"]`);
    const m = re.exec(result);
    if (m) matchedRanges.push({ pkg, start: m.index, end: m.index + m[0].length, match: m[0] });
  }
  // Sort descending by start so we can splice without shifting earlier indices
  matchedRanges.sort((a, b) => b.start - a.start);

  for (const { pkg, start, end, match } of matchedRanges) {
    const toAdd = addByPkg.get(pkg) ?? new Set<string>();
    const toRemove = removeByPkg.get(pkg) ?? new Set<string>();
    const inner = /\{([^}]*)\}/.exec(match)?.[1] ?? '';
    let names = inner
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    names = names.filter((n) => !toRemove.has(n));
    for (const n of toAdd) {
      if (!names.includes(n)) names.push(n);
    }

    if (names.length === 0) {
      // Remove the whole import line (including trailing newline)
      const lineStart = result.lastIndexOf('\n', start) + 1;
      const lineEnd = result.indexOf('\n', end);
      result = result.slice(0, lineStart) + (lineEnd >= 0 ? result.slice(lineEnd + 1) : '');
    } else {
      const newImport = `import { ${names.join(', ')} } from '${pkg}'`;
      result = result.slice(0, start) + newImport + result.slice(end);
    }
    addByPkg.delete(pkg); // mark as handled
  }

  // Insert new import lines for packages that had no existing import.
  // `insertImportLine` szuka końca OSTATNIEJ deklaracji importu — także
  // wieloliniowej; wcześniejszy wzorzec „linia zaczynająca się od import"
  // trafiał w `import {` i wstawiał nowy import w środek listy nazw.
  for (const [pkg, names] of addByPkg) {
    if (names.size === 0) continue;
    result = insertImportLine(result, `import { ${[...names].join(', ')} } from '${pkg}';`);
  }

  return result;
}

/* ── ImportButton — manage import { ... } from '...' in the source file ──────*/

/** All relevant named exports from @hestia/core. */
const MINISLIB_EXPORTS = [
  'Node',
  'CoreObject',
  'Signal',
  'Property',
  'Timer',
  'StateMachine',
  'State',
  'EventBus',
  'CommandStack',
  'ListModel',
  'Logger',
];

interface ImportCandidate {
  pkg: string; // '__project__' = defined in this file (no import needed)
  name: string;
  kind?: EntityKind;
}

function ImportButton({ uri, entities }: { uri: string; entities: MinisEntity[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);

  const handleOpen = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setFilter('');
    setCandidates([]);

    const code = _state.currentCode;

    // Build initial checked set from current imports
    const allImports = parseAllImports(code);
    const initSelected = new Set<string>();
    for (const { packageName, names } of allImports) {
      for (const name of names) initSelected.add(`${packageName}::${name}`);
    }
    setSelected(new Set(initSelected));
    setInitial(new Set(initSelected));

    const seen = new Set<string>();
    const all: ImportCandidate[] = [];

    // 1. Minislib builtins (always show)
    for (const name of MINISLIB_EXPORTS) {
      const key = `@hestia/core::${name}`;
      seen.add(key);
      all.push({ pkg: '@hestia/core', name });
    }

    // 2. Local project classes (defined in this file — no import needed)
    for (const e of entities) {
      if (e.kind !== 'class') continue;
      const key = `__project__::${e.varName}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push({ pkg: '__project__', name: e.varName, kind: 'class' });
      }
    }

    // 3. Other .ts files in the same project
    if (uri && !uri.startsWith('virtual://')) {
      const projectRoot = deriveProjectRoot(uri);
      const tsFiles = await scanProjectTsFiles(projectRoot, uri);
      await Promise.all(
        tsFiles.map(async (filePath) => {
          const code = await vfsReadFileText(filePath);
          if (!code) return;
          const relPath = toRelativeImportPath(uri, filePath);

          // Collect class names: first try full minislib parse, then fall back to exported classes
          const classNames = new Set<string>();
          const { entities: fileEntities } = parseMinisEntities(code);
          for (const e of fileEntities) {
            if (e.kind === 'class') classNames.add(e.varName);
          }
          // Always also pick up plain `export class Foo` — catches non-minislib classes
          for (const name of parseExportedClassNames(code)) classNames.add(name);

          for (const name of classNames) {
            const key = `${relPath}::${name}`;
            if (!seen.has(key)) {
              seen.add(key);
              all.push({ pkg: relPath, name, kind: 'class' });
            }
          }
        })
      );
    }

    // 4. Classes from npm packages that have minislib-plugin.json
    if (uri && !uri.startsWith('virtual://')) {
      const projectRoot = deriveProjectRoot(uri);
      const pkgNames = await readPackageJsonDeps(projectRoot);
      await Promise.all(
        pkgNames
          .filter((p) => p !== '@hestia/core')
          .map(async (pkgName) => {
            const defs = await fetchManifest(projectRoot, pkgName);
            for (const [className, def] of Object.entries(defs)) {
              const key = `${pkgName}::${className}`;
              if (!seen.has(key)) {
                seen.add(key);
                all.push({ pkg: pkgName, name: className, kind: def.kind });
              }
            }
          })
      );
    }

    // 4. Any currently-imported names not yet in candidates (relative paths + unknown packages)
    for (const { packageName, names } of allImports) {
      for (const name of names) {
        const key = `${packageName}::${name}`;
        if (!seen.has(key)) {
          seen.add(key);
          all.push({ pkg: packageName, name });
        }
      }
    }

    setCandidates(all);
    setLoading(false);
    setTimeout(() => filterRef.current?.focus(), 60);
  }, [uri, entities]);

  const toggleKey = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    const model = findModel(uri);
    if (!model) {
      setOpen(false);
      return;
    }
    const add: { pkg: string; name: string }[] = [];
    const remove: { pkg: string; name: string }[] = [];
    for (const c of candidates) {
      if (c.pkg === '__project__') continue;
      const key = `${c.pkg}::${c.name}`;
      const was = initial.has(key);
      const now = selected.has(key);
      if (now && !was) add.push({ pkg: c.pkg, name: c.name });
      if (!now && was) remove.push({ pkg: c.pkg, name: c.name });
    }
    if (add.length > 0 || remove.length > 0)
      replaceModelContent(model, patchImportsInCode(_state.currentCode, add, remove));
    setOpen(false);
  }, [uri, candidates, selected, initial]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return q
      ? candidates.filter(
          (c) => c.name.toLowerCase().includes(q) || c.pkg.toLowerCase().includes(q)
        )
      : candidates;
  }, [candidates, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, ImportCandidate[]>();
    for (const c of filtered) {
      if (!map.has(c.pkg)) map.set(c.pkg, []);
      map.get(c.pkg)!.push(c);
    }
    return map;
  }, [filtered]);

  const groupOrder = useMemo(() => {
    const order: string[] = [];
    if (groups.has('__project__')) order.push('__project__');
    // Relative paths = other project files (e.g. ./sensor, ../shared/types)
    for (const k of groups.keys()) {
      if (k.startsWith('.')) order.push(k);
    }
    if (groups.has('@hestia/core')) order.push('@hestia/core');
    // npm packages last
    for (const k of groups.keys()) {
      if (k !== '__project__' && !k.startsWith('.') && k !== '@hestia/core') order.push(k);
    }
    return order;
  }, [groups]);

  const hasChanges = useMemo(() => {
    for (const c of candidates) {
      if (c.pkg === '__project__') continue;
      const key = `${c.pkg}::${c.name}`;
      if (initial.has(key) !== selected.has(key)) return true;
    }
    return false;
  }, [candidates, selected, initial]);

  const selectedCount = candidates.filter(
    (c) => c.pkg !== '__project__' && selected.has(`${c.pkg}::${c.name}`)
  ).length;

  return (
    <>
      <Tooltip title="Manage imports — add/remove CoreObject / Node subclasses">
        <Button
          size="small"
          onClick={handleOpen}
          sx={{
            fontSize: 10,
            color: '#89dceb',
            textTransform: 'none',
            py: 0,
            px: 1,
            minWidth: 0,
            borderLeft: '1px solid #313244',
            borderRadius: 0,
            '&:hover': { background: '#1a2e2e' },
          }}
        >
          + Import
        </Button>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { background: '#1e1e2e', border: '1px solid #313244', color: '#cdd6f4', m: 2 },
        }}
      >
        <DialogTitle
          sx={{
            fontSize: 13,
            fontWeight: 600,
            py: 1,
            px: 2,
            borderBottom: '1px solid #313244',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <span style={{ fontSize: 16 }}>📦</span>
          Manage Imports
          <Box sx={{ flex: 1 }} />
          <IconButton
            size="small"
            onClick={() => setOpen(false)}
            sx={{ color: '#585b70', p: 0.25 }}
          >
            <CloseIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </DialogTitle>

        <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }} onKeyDown={(e) => e.stopPropagation()}>
          <TextField
            inputRef={filterRef}
            size="small"
            placeholder="Filter classes or packages…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            fullWidth
            sx={{
              '& .MuiInputBase-root': {
                fontSize: 12,
                background: '#13131e',
                color: '#cdd6f4',
                height: 28,
              },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
              '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#89dceb',
              },
              '& input': { py: 0, px: 1 },
            }}
          />
        </Box>

        <DialogContent sx={{ p: 0, maxHeight: 400, overflowY: 'auto' }}>
          {loading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                py: 4,
                gap: 1.5,
              }}
            >
              <CircularProgress size={20} sx={{ color: '#89dceb' }} />
              <Typography sx={{ fontSize: 12, color: '#585b70' }}>
                Scanning project files and packages…
              </Typography>
            </Box>
          ) : filtered.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: '#45475a', px: 2, py: 2 }}>
              No matches. Add another <code style={{ color: '#89dceb' }}>.ts</code> file to the
              project, or a package with a{' '}
              <code style={{ color: '#89dceb' }}>minislib-plugin.json</code> manifest.
            </Typography>
          ) : (
            groupOrder.map((pkg) => {
              const items = groups.get(pkg) ?? [];
              const isProject = pkg === '__project__';
              const pkgLabel = isProject
                ? '📁 This file'
                : pkg.startsWith('.')
                  ? `📄 ${pkg}`
                  : pkg === '@hestia/core'
                    ? '⚡ @hestia/core'
                    : `🧩 ${pkg}`;
              return (
                <Box key={pkg}>
                  {/* Group header */}
                  <Box
                    sx={{
                      px: 2,
                      py: 0.4,
                      background: '#181825',
                      borderBottom: '1px solid #313244',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    <Typography
                      sx={{ fontSize: 10, color: '#585b70', fontWeight: 600, letterSpacing: 0.4 }}
                    >
                      {pkgLabel}
                    </Typography>
                  </Box>
                  {items.map((c) => {
                    const key = `${c.pkg}::${c.name}`;
                    const checked = selected.has(key);
                    const kindColor = c.kind ? (KIND_COLOR[c.kind] ?? '#cdd6f4') : '#cdd6f4';
                    return (
                      <Box
                        key={key}
                        onClick={() => !isProject && toggleKey(key)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          px: 1.5,
                          py: 0.25,
                          cursor: isProject ? 'default' : 'pointer',
                          borderBottom: '1px solid #1e1e2e22',
                          '&:hover': { background: isProject ? 'transparent' : '#2a2a3e' },
                        }}
                      >
                        {isProject ? (
                          <Box sx={{ width: 30, display: 'flex', justifyContent: 'center' }}>
                            <Typography sx={{ fontSize: 9, color: '#45475a' }}>—</Typography>
                          </Box>
                        ) : (
                          <Checkbox
                            size="small"
                            checked={checked}
                            onChange={() => toggleKey(key)}
                            onClick={(e) => e.stopPropagation()}
                            sx={{
                              p: 0.25,
                              color: '#45475a',
                              '&.Mui-checked': { color: '#89dceb' },
                            }}
                          />
                        )}
                        <Typography
                          sx={{
                            fontSize: 12,
                            fontFamily: 'monospace',
                            ml: 0.5,
                            flex: 1,
                            color: '#cdd6f4',
                          }}
                        >
                          {c.name}
                        </Typography>
                        {c.kind && (
                          <Chip
                            label={c.kind}
                            size="small"
                            sx={{
                              fontSize: 9,
                              height: 15,
                              ml: 1,
                              color: kindColor,
                              border: `1px solid ${kindColor}44`,
                              background: `${kindColor}11`,
                            }}
                          />
                        )}
                        {isProject && (
                          <Chip
                            label="this file"
                            size="small"
                            sx={{
                              fontSize: 9,
                              height: 15,
                              ml: 1,
                              color: '#45475a',
                              border: '1px solid #31324444',
                              background: 'transparent',
                            }}
                          />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              );
            })
          )}
        </DialogContent>

        <DialogActions sx={{ borderTop: '1px solid #313244', px: 2, py: 0.75, gap: 1 }}>
          <Typography sx={{ fontSize: 10, color: '#45475a', flex: 1 }}>
            {selectedCount} selected
          </Typography>
          <Button
            size="small"
            onClick={() => setOpen(false)}
            sx={{ fontSize: 11, color: '#585b70', textTransform: 'none', py: 0.25, px: 1 }}
          >
            Cancel
          </Button>
          <Button
            size="small"
            onClick={handleApply}
            disabled={!hasChanges}
            sx={{
              fontSize: 11,
              color: '#a6e3a1',
              textTransform: 'none',
              py: 0.25,
              px: 1,
              border: '1px solid #a6e3a144',
              '&.Mui-disabled': { color: '#45475a44', borderColor: '#31324444' },
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ── VfsFilePicker ───────────────────────────────────────────────────────────*/

function VfsFilePicker({
  rootPath,
  onSelect,
  onClose,
}: {
  rootPath: string;
  onSelect: (path: string, code: string) => void;
  onClose: () => void;
}) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<{ name: string; isDir: boolean }[]>([]);
  const [loadingDir, setLoadingDir] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setLoadingDir(true);
    setSelectedPath(null);
    vfsReadDir(currentPath).then((es) => {
      setEntries(es.filter((e) => e.isDir || /\.(ts|tsx)$/.test(e.name)));
      setLoadingDir(false);
    });
  }, [currentPath]);

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  const handleNavigate = (name: string) => {
    setCurrentPath((prev) => (prev.endsWith('/') ? prev + name : `${prev}/${name}`));
  };

  const handleConfirm = async () => {
    if (!selectedPath) return;
    setImporting(true);
    const code = await vfsReadFileText(selectedPath);
    setImporting(false);
    if (code !== null) onSelect(selectedPath, code);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { background: '#1e1e2e', border: '1px solid #313244', color: '#cdd6f4', m: 2 },
      }}
    >
      <DialogTitle
        sx={{
          fontSize: 13,
          fontWeight: 600,
          py: 1,
          px: 2,
          borderBottom: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <span style={{ fontSize: 15 }}>📂</span> Import Source File
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose} sx={{ color: '#585b70', p: 0.25 }}>
          <CloseIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </DialogTitle>

      {/* Breadcrumbs */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          px: 1.5,
          py: 0.5,
          background: '#13131e',
          borderBottom: '1px solid #313244',
          flexWrap: 'wrap',
          minHeight: 30,
        }}
      >
        <Button
          size="small"
          onClick={() => setCurrentPath('/')}
          sx={{
            fontSize: 10,
            color: '#585b70',
            textTransform: 'none',
            py: 0,
            px: 0.5,
            minWidth: 0,
          }}
        >
          /
        </Button>
        {breadcrumbs.map((part, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#45475a', marginRight: 2 }}>/</span>
            <Button
              size="small"
              onClick={() => setCurrentPath('/' + breadcrumbs.slice(0, i + 1).join('/'))}
              sx={{
                fontSize: 10,
                color: i === breadcrumbs.length - 1 ? '#89dceb' : '#585b70',
                textTransform: 'none',
                py: 0,
                px: 0.5,
                minWidth: 0,
              }}
            >
              {part}
            </Button>
          </span>
        ))}
      </Box>

      <DialogContent sx={{ p: 0, maxHeight: 340, overflowY: 'auto' }}>
        {loadingDir ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={18} sx={{ color: '#89dceb' }} />
          </Box>
        ) : entries.length === 0 ? (
          <Typography sx={{ fontSize: 12, color: '#45475a', p: 2 }}>Empty directory</Typography>
        ) : (
          [...entries]
            .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
            .map((e) => {
              const fullPath = `${currentPath}/${e.name}`.replace(/\/+/g, '/');
              const isSel = selectedPath === fullPath;
              return (
                <Box
                  key={e.name}
                  onClick={() =>
                    e.isDir ? handleNavigate(e.name) : setSelectedPath(isSel ? null : fullPath)
                  }
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 2,
                    py: 0.4,
                    cursor: 'pointer',
                    background: isSel ? '#2a2a3e' : 'transparent',
                    borderBottom: '1px solid #1e1e2e33',
                    '&:hover': { background: e.isDir ? '#1e1e3e' : '#2a2a3e' },
                  }}
                >
                  <span style={{ fontSize: 12 }}>{e.isDir ? '📁' : '📄'}</span>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontFamily: 'monospace',
                      flex: 1,
                      color: e.isDir ? '#89b4fa' : '#cdd6f4',
                    }}
                  >
                    {e.name}
                  </Typography>
                  {e.isDir && <Typography sx={{ fontSize: 10, color: '#45475a' }}>›</Typography>}
                </Box>
              );
            })
        )}
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid #313244', px: 2, py: 0.75, gap: 1 }}>
        {selectedPath && (
          <Typography
            sx={{
              fontSize: 10,
              color: '#585b70',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedPath.split('/').pop()}
          </Typography>
        )}
        <Button
          size="small"
          onClick={onClose}
          sx={{ fontSize: 11, color: '#585b70', textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          size="small"
          onClick={handleConfirm}
          disabled={!selectedPath || importing}
          sx={{
            fontSize: 11,
            color: '#a6e3a1',
            textTransform: 'none',
            border: '1px solid #a6e3a144',
            '&.Mui-disabled': { color: '#45475a44', borderColor: '#31324444' },
          }}
        >
          {importing ? 'Loading…' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ── Scene tree components ───────────────────────────────────────────────────*/

function NodeTreeRow({
  item,
  depth,
  selectedId,
  onSelect,
  expandedIds,
  onToggleExpand,
  onContextMenu,
  cutVarName,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  dragOverId,
}: {
  item: NodeTreeItem;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: NodeTreeItem) => void;
  cutVarName?: string | null;
  onDragStart?: (varName: string) => void;
  onDragEnd?: () => void;
  onDragOver?: (id: string) => void;
  onDragLeave?: () => void;
  onDrop?: (targetVarName: string) => void;
  dragOverId?: string | null;
}) {
  const hasChildren = item.children.length > 0;
  const expanded = expandedIds.has(item.id);
  const isSel = selectedId === item.id;
  const isCut = cutVarName === item.varName;
  const isDragOver = dragOverId === item.id;
  const color = KIND_COLOR[item.kind] ?? '#cdd6f4';
  const icon = KIND_ICON[item.kind] ?? '📦';

  return (
    <>
      <Box
        data-treeid={item.id}
        draggable
        onClick={() => onSelect(item.id)}
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart?.(item.varName);
        }}
        onDragEnd={() => onDragEnd?.()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOver?.(item.id);
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          onDragLeave?.();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop?.(item.varName);
        }}
        title={item.label}
        sx={{
          display: 'flex',
          alignItems: 'center',
          pl: `${6 + depth * 12}px`,
          pr: 0.5,
          py: '2px',
          cursor: 'grab',
          opacity: isCut ? 0.4 : 1,
          background: isDragOver ? '#2a1a50' : isSel ? '#2a2040' : 'transparent',
          borderLeft: isDragOver
            ? '2px solid #cba6f7'
            : isSel
              ? `2px solid ${color}`
              : '2px solid transparent',
          outline: isDragOver ? '1px dashed #cba6f766' : 'none',
          '&:hover': { background: isDragOver ? '#2a1a50' : isSel ? '#2a2040' : '#1e1e3e' },
        }}
      >
        <Box
          component="span"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(item.id);
          }}
          sx={{
            width: 14,
            fontSize: 8,
            color: '#45475a',
            mr: 0.25,
            flexShrink: 0,
            cursor: hasChildren ? 'pointer' : 'default',
            userSelect: 'none',
          }}
        >
          {hasChildren ? (expanded ? '▼' : '▶') : '·'}
        </Box>
        <span style={{ fontSize: 11, marginRight: 3, flexShrink: 0 }}>{icon}</span>
        <Typography
          sx={{
            fontSize: 11,
            fontFamily: 'monospace',
            flex: 1,
            color: '#cdd6f4',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: '18px',
          }}
        >
          {item.varName}
        </Typography>
      </Box>
      {hasChildren &&
        expanded &&
        item.children.map((child) => (
          <NodeTreeRow
            key={child.id}
            item={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            onContextMenu={onContextMenu}
            cutVarName={cutVarName}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            dragOverId={dragOverId}
          />
        ))}
    </>
  );
}

/** Single imported-file section inside the tree panel. */
function ImportedFileSection({
  filePath,
  extEntities,
  localEntities,
  uri,
  status,
  onRemove,
}: {
  filePath: string;
  extEntities: MinisEntity[];
  localEntities: MinisEntity[];
  uri: string;
  status?: { ok: boolean; message: string };
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<MinisEntity | null>(null);
  const [parentVarName, setParentVarName] = useState('');

  const tree = useMemo(() => buildNodeTree(extEntities, ''), [extEntities]);
  const classes = useMemo(() => extEntities.filter((e) => e.kind === 'class'), [extEntities]);
  const fileName = filePath.split('/').pop() ?? filePath;

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const handleAdd = (entity: MinisEntity) => {
    setPending(entity);
    setParentVarName('');
  };

  const handleConfirm = useCallback(() => {
    if (!pending) return;
    const model = findModel(uri);
    if (!model) return;

    const taken = new Set(_state.entities.map((e) => e.varName));
    const base = pending.varName.charAt(0).toLowerCase() + pending.varName.slice(1);
    const varName = generateVarName(base, taken);
    const relPath = toRelativeImportPath(uri, filePath);
    const arg = parentVarName.trim();
    const snippet = `const ${varName} = new ${pending.varName}(${arg});\n`;

    let code = model.getValue();
    code = patchImportsInCode(code, [{ pkg: relPath, name: pending.varName }], []);
    code = code.trimEnd() + '\n' + snippet;
    replaceModelContent(model, code);
    setPending(null);
  }, [pending, uri, filePath, parentVarName]);

  const parentOptions = useMemo(
    () => localEntities.filter((e) => e.kind === 'class' || e.kind === 'instance'),
    [localEntities]
  );

  return (
    <Box sx={{ borderTop: '1px solid #313244' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.4,
          background: '#181825',
          cursor: 'pointer',
          '&:hover': { background: '#1e1e2e' },
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ fontSize: 9, color: '#45475a', marginRight: 4 }}>
          {expanded ? '▼' : '▶'}
        </span>
        <span style={{ fontSize: 11, marginRight: 4 }}>📎</span>
        <Typography
          sx={{
            fontSize: 10,
            fontFamily: 'monospace',
            flex: 1,
            color: '#89dceb',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={filePath}
        >
          {fileName}
        </Typography>
        <Tooltip title="Remove import">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            sx={{ p: 0.2, color: '#585b70', '&:hover': { color: '#f38ba8' } }}
          >
            <CloseIcon sx={{ fontSize: 11 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {expanded && (
        <>
          {/* Outcome banner — tells the user exactly what was/wasn't written. */}
          {status && (
            <Box
              sx={{
                mx: 1,
                my: 0.5,
                px: 1,
                py: 0.5,
                fontSize: 10,
                borderRadius: 0.5,
                background: status.ok ? '#1e3a2e' : '#3a1e22',
                color: status.ok ? '#a6e3a1' : '#f38ba8',
                border: `1px solid ${status.ok ? '#a6e3a144' : '#f38ba844'}`,
                fontFamily: status.ok ? 'monospace' : 'inherit',
                wordBreak: 'break-all',
              }}
            >
              {status.ok ? `✓ Added to active file: ${status.message}` : `⚠ ${status.message}`}
            </Box>
          )}

          {classes.length === 0 ? (
            <Typography sx={{ fontSize: 10, color: '#45475a', px: 2, py: 0.5 }}>
              No <code>extends Node/CoreObject</code> classes — only plain{' '}
              <code>export class X</code> were imported (no graph entities to add).
            </Typography>
          ) : (
            <>
              {/* Flat class list with "Add" buttons */}
              {classes.map((cls) => (
                <Box
                  key={cls.varName}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    pl: 2,
                    pr: 0.5,
                    py: '2px',
                    '&:hover': { background: '#1e1e2e' },
                  }}
                >
                  <span style={{ fontSize: 11, marginRight: 3 }}>{KIND_ICON['class']}</span>
                  <Typography
                    sx={{ fontSize: 11, fontFamily: 'monospace', flex: 1, color: '#4fc3f7' }}
                  >
                    {cls.varName}
                  </Typography>
                  <Tooltip title="Add to current file">
                    <Button
                      size="small"
                      onClick={() => handleAdd(cls)}
                      sx={{
                        fontSize: 9,
                        color: '#a6e3a1',
                        textTransform: 'none',
                        py: 0,
                        px: 0.5,
                        minWidth: 0,
                        '&:hover': { background: '#1e3e1e' },
                      }}
                    >
                      + Add
                    </Button>
                  </Tooltip>
                </Box>
              ))}

              {/* Inline form when a class is being added */}
              {pending && (
                <Box
                  sx={{
                    mx: 1,
                    mb: 0.5,
                    p: 1,
                    background: '#13131e',
                    border: '1px solid #313244',
                    borderRadius: 1,
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Typography sx={{ fontSize: 10, color: '#89dceb', mb: 0.5 }}>
                    Add <strong>{pending.varName}</strong> to code
                  </Typography>
                  <Autocomplete
                    size="small"
                    freeSolo
                    options={parentOptions.map((e) => e.varName)}
                    value={parentVarName}
                    onInputChange={(_, v) => setParentVarName(v)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Parent (optional)"
                        sx={{
                          '& .MuiInputBase-root': {
                            fontSize: 11,
                            background: '#1e1e2e',
                            color: '#cdd6f4',
                            height: 26,
                          },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
                          '& input': { py: 0, px: 0.5 },
                        }}
                      />
                    )}
                  />
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      onClick={() => setPending(null)}
                      sx={{ fontSize: 9, color: '#585b70', textTransform: 'none', py: 0, px: 0.75 }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      onClick={handleConfirm}
                      sx={{
                        fontSize: 9,
                        color: '#a6e3a1',
                        textTransform: 'none',
                        py: 0,
                        px: 0.75,
                        border: '1px solid #a6e3a144',
                      }}
                    >
                      Confirm
                    </Button>
                  </Box>
                </Box>
              )}

              {/* Entity hierarchy from the file */}
              {extEntities.some((e) => e.kind !== 'class') && (
                <Box sx={{ opacity: 0.6 }}>
                  {tree.map((item) => (
                    <NodeTreeRow
                      key={item.id}
                      item={item}
                      depth={1}
                      selectedId={null}
                      onSelect={() => {}}
                      expandedIds={expandedIds}
                      onToggleExpand={toggleExpand}
                      onContextMenu={() => {}}
                    />
                  ))}
                </Box>
              )}
            </>
          )}
        </>
      )}
    </Box>
  );
}

type ClipboardOp = 'copy' | 'cut';
interface TreeClipboard {
  op: ClipboardOp;
  entity: MinisEntity;
}

/** Collapsible left panel showing the Node/CoreObject hierarchy tree. */
function NodeTreePanel({
  entities,
  currentCode,
  uri,
  selectedEntityId,
  onSelectEntity,
  importedClasses,
}: {
  entities: MinisEntity[];
  currentCode: string;
  uri: string;
  selectedEntityId: string | null;
  onSelectEntity: (id: string) => void;
  importedClasses: ImportedClass[];
}) {
  const [open, setOpen] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [importedFiles, setImportedFiles] = useState<
    {
      path: string;
      entities: MinisEntity[];
      status: { ok: boolean; message: string };
    }[]
  >([]);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    mouseX: number;
    mouseY: number;
    item: NodeTreeItem | null;
  } | null>(null);
  const closeCtx = () => setCtxMenu(null);

  // Clipboard
  const [clipboard, setClipboard] = useState<TreeClipboard | null>(null);

  const tree = useMemo(() => buildNodeTree(entities, currentCode), [entities, currentCode]);

  // Native contextmenu listener on the scroll container — bypasses React synthetic event issues
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const treeDataRef = useRef(tree);
  useEffect(() => {
    treeDataRef.current = tree;
  }, [tree]);

  useEffect(() => {
    const el = treeScrollRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      // Walk up from click target to find [data-treeid]
      let target: HTMLElement | null = e.target as HTMLElement;
      let found: NodeTreeItem | null = null;
      while (target && target !== el) {
        const id = target.getAttribute('data-treeid');
        if (id) {
          const findItem = (items: NodeTreeItem[]): NodeTreeItem | null => {
            for (const it of items) {
              if (it.id === id) return it;
              const f = findItem(it.children);
              if (f) return f;
            }
            return null;
          };
          found = findItem(treeDataRef.current);
          break;
        }
        target = target.parentElement;
      }
      // Always show context menu — item=null means "no parent" (root-level new)
      setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, item: found });
    };
    el.addEventListener('contextmenu', handler);
    return () => el.removeEventListener('contextmenu', handler);
  }, []);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const handleFileImport = (path: string, code: string) => {
    setFilePickerOpen(false);
    const { entities: extEntities } = parseMinisEntities(code);

    // Pick class names that should land in the import:
    //   1. Strict pass — `class X extends Node/CoreObject/...` recognised by parseMinisEntities
    //   2. Fallback — `export class X` regardless of base class (handles modules that
    //      don't import minislib themselves but still export usable classes)
    const strictClassNames = extEntities.filter((e) => e.kind === 'class').map((e) => e.varName);
    const classNames =
      strictClassNames.length > 0 ? strictClassNames : parseExportedClassNames(code);

    let status: { ok: boolean; message: string };
    if (!uri) {
      status = { ok: false, message: 'No active source file — open a .ts file first.' };
    } else if (classNames.length === 0) {
      status = { ok: false, message: `No exported classes found in ${path.split('/').pop()}.` };
    } else {
      const model = findModel(uri);
      if (!model) {
        status = {
          ok: false,
          message: 'Active editor model not found — try clicking inside the source tab first.',
        };
      } else {
        const relPath = toRelativeImportPath(uri, path);
        const patched = patchImportsInCode(
          model.getValue(),
          classNames.map((name) => ({ pkg: relPath, name })),
          []
        );
        replaceModelContent(model, patched);
        status = { ok: true, message: `import { ${classNames.join(', ')} } from '${relPath}'` };
      }
    }
    console.log('[MinisLib] Import file:', path, '→', status.message);

    if (importedFiles.find((f) => f.path === path)) return;
    setImportedFiles((prev) => [...prev, { path, entities: extEntities, status }]);
  };

  const removeImport = (path: string) =>
    setImportedFiles((prev) => prev.filter((f) => f.path !== path));

  const projectRoot = uri ? deriveProjectRoot(uri) : '/';

  // Drag-and-drop reparenting
  const dragVarRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((varName: string) => {
    dragVarRef.current = varName;
  }, []);

  const handleDragEnd = useCallback(() => {
    dragVarRef.current = null;
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((id: string) => {
    setDragOverId(id);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (targetVarName: string) => {
      const dragVar = dragVarRef.current;
      if (!dragVar || dragVar === targetVarName) {
        setDragOverId(null);
        return;
      }
      const model = findModel(uri);
      if (!model) {
        setDragOverId(null);
        return;
      }
      const patched = patchConstructorArg(model.getValue(), dragVar, 0, targetVarName);
      if (patched) replaceModelContent(model, patched);
      dragVarRef.current = null;
      setDragOverId(null);
    },
    [uri]
  );

  // All class names available for instantiation: local classes + imported classes
  const availableClasses = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of entities) {
      if (e.kind === 'class' && !seen.has(e.varName)) {
        seen.add(e.varName);
        result.push(e.varName);
      }
    }
    for (const ic of importedClasses) {
      if (!seen.has(ic.className)) {
        seen.add(ic.className);
        result.push(ic.className);
      }
    }
    return result;
  }, [entities, importedClasses]);

  // ── Context menu handlers ────────────────────────────────────────────────

  const resolveEntity = (item: NodeTreeItem | null) =>
    item ? (entities.find((e) => e.id === item.id) ?? null) : null;

  const handleCtxNewClass = useCallback(
    (className: string) => {
      if (!ctxMenu) return;
      closeCtx();
      const entity = ctxMenu.item ? resolveEntity(ctxMenu.item) : null;
      const taken = new Set(_state.entities.map((e) => e.varName));
      const base = className.charAt(0).toLowerCase() + className.slice(1);
      const newVar = generateVarName(base, taken);
      // If parent entity exists, pass it as first constructor arg; otherwise create root object
      const snippet = entity
        ? `const ${newVar} = new ${className}(${entity.varName});\n`
        : `const ${newVar} = new ${className}();\n`;
      insertAtEnd(snippet, uri);
      addSnippet(snippet, true);
    },
    [ctxMenu, uri]
  );

  const handleCtxCut = useCallback(() => {
    if (!ctxMenu) return;
    const entity = resolveEntity(ctxMenu.item);
    if (entity) setClipboard({ op: 'cut', entity });
    closeCtx();
  }, [ctxMenu]);

  const handleCtxCopy = useCallback(() => {
    if (!ctxMenu) return;
    const entity = resolveEntity(ctxMenu.item);
    if (entity) setClipboard({ op: 'copy', entity });
    closeCtx();
  }, [ctxMenu]);

  const handleCtxPaste = useCallback(() => {
    if (!ctxMenu || !clipboard) return;
    closeCtx();
    const target = resolveEntity(ctxMenu.item);
    const model = findModel(uri);
    if (!target || !model) return;

    if (clipboard.op === 'cut') {
      // Move: reparent by patching first constructor arg
      const patched = patchConstructorArg(
        model.getValue(),
        clipboard.entity.varName,
        0,
        target.varName
      );
      if (patched) replaceModelContent(model, patched);
      setClipboard(null);
    } else {
      // Copy: duplicate instance with target as parent
      const className = getEntityClassName(clipboard.entity);
      const taken = new Set(_state.entities.map((e) => e.varName));
      const base = className.charAt(0).toLowerCase() + className.slice(1);
      const newVar = generateVarName(base, taken);
      const snippet = `const ${newVar} = new ${className}(${target.varName});\n`;
      const newCode = model.getValue().trimEnd() + '\n' + snippet;
      replaceModelContent(model, newCode);
      addSnippet(snippet, true);
    }
  }, [ctxMenu, clipboard, uri]);

  const handleCtxDelete = useCallback(() => {
    if (!ctxMenu) return;
    closeCtx();
    const entity = resolveEntity(ctxMenu.item);
    const model = findModel(uri);
    if (!entity || !model) return;
    replaceModelContent(model, deleteEntityFromCode(model.getValue(), entity.varName));
  }, [ctxMenu, uri]);

  const cutVarName = clipboard?.op === 'cut' ? clipboard.entity.varName : null;
  const PANEL_W = 200;

  return (
    <>
      {/* Toggle strip / full panel */}
      <Box
        onContextMenu={(e) => e.preventDefault()}
        sx={{
          width: open ? PANEL_W : 24,
          minWidth: open ? PANEL_W : 24,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #313244',
          background: '#13131e',
          transition: 'width 0.15s, min-width 0.15s',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Header row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid #313244',
            background: '#181825',
            flexShrink: 0,
            height: 28,
          }}
        >
          {open && (
            <Typography
              sx={{
                fontSize: 10,
                color: '#585b70',
                fontWeight: 600,
                letterSpacing: 0.5,
                pl: 1,
                flex: 1,
                whiteSpace: 'nowrap',
              }}
            >
              SCENE TREE
            </Typography>
          )}
          <Tooltip title={open ? 'Collapse tree' : 'Expand tree'}>
            <IconButton
              size="small"
              onClick={() => setOpen((v) => !v)}
              sx={{
                p: 0.25,
                color: '#45475a',
                borderRadius: 0,
                width: 24,
                '&:hover': { color: '#cdd6f4', background: '#1e1e2e' },
              }}
            >
              <Typography sx={{ fontSize: 11, lineHeight: 1 }}>{open ? '‹' : '›'}</Typography>
            </IconButton>
          </Tooltip>
        </Box>

        {open && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Local entity tree — ref here for native contextmenu listener */}
            <Box ref={treeScrollRef} sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {tree.length === 0 ? (
                <Typography sx={{ fontSize: 10, color: '#45475a', p: 1, textAlign: 'center' }}>
                  No entities
                </Typography>
              ) : (
                tree.map((item) => (
                  <NodeTreeRow
                    key={item.id}
                    item={item}
                    depth={0}
                    selectedId={selectedEntityId}
                    onSelect={onSelectEntity}
                    expandedIds={expandedIds}
                    onToggleExpand={toggleExpand}
                    onContextMenu={(e, it) =>
                      setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, item: it })
                    }
                    cutVarName={cutVarName}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    dragOverId={dragOverId}
                  />
                ))
              )}

              {/* Imported file sections */}
              {importedFiles.map((f) => (
                <ImportedFileSection
                  key={f.path}
                  filePath={f.path}
                  extEntities={f.entities}
                  localEntities={entities}
                  uri={uri}
                  status={f.status}
                  onRemove={() => removeImport(f.path)}
                />
              ))}
            </Box>

            {/* "Import file" button at bottom */}
            <Box sx={{ borderTop: '1px solid #313244', flexShrink: 0 }}>
              <Button
                size="small"
                fullWidth
                onClick={() => setFilePickerOpen(true)}
                sx={{
                  fontSize: 10,
                  color: '#89dceb',
                  textTransform: 'none',
                  py: 0.4,
                  borderRadius: 0,
                  '&:hover': { background: '#1a2e2e' },
                }}
              >
                + Import file
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Context menu */}
      <Menu
        open={ctxMenu !== null}
        onClose={closeCtx}
        anchorReference="anchorPosition"
        anchorPosition={ctxMenu ? { top: ctxMenu.mouseY, left: ctxMenu.mouseX } : undefined}
        PaperProps={{
          sx: { background: '#1e1e2e', border: '1px solid #313244', py: 0.25, minWidth: 180 },
        }}
      >
        {/* New object — one item per available class */}
        {availableClasses.length === 0 ? (
          <MenuItem disabled sx={{ fontSize: 11, color: '#45475a', py: 0.4 }}>
            No classes to instantiate — define a class or use + Import
          </MenuItem>
        ) : (
          <>
            <Box sx={{ px: 1.5, py: 0.3 }}>
              <Typography
                sx={{ fontSize: 9, color: '#45475a', fontWeight: 600, letterSpacing: 0.5 }}
              >
                {ctxMenu?.item ? `NEW CHILD OF ${ctxMenu.item.varName}` : 'NEW OBJECT'}
              </Typography>
            </Box>
            {availableClasses.map((cls) => (
              <MenuItem
                key={cls}
                onClick={() => handleCtxNewClass(cls)}
                sx={{
                  fontSize: 12,
                  color: '#a6e3a1',
                  py: 0.4,
                  pl: 2,
                  gap: 1,
                  '&:hover': { background: '#1a3a1e' },
                }}
              >
                <span style={{ fontSize: 11 }}>📦</span>
                <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {cls}
                </Typography>
              </MenuItem>
            ))}
          </>
        )}
        <Divider sx={{ borderColor: '#313244', my: 0.25 }} />
        <MenuItem
          onClick={handleCtxCut}
          sx={{
            fontSize: 12,
            color: '#cdd6f4',
            py: 0.5,
            gap: 1.25,
            '&:hover': { background: '#313244' },
          }}
        >
          <span style={{ fontSize: 13 }}>✂️</span> Cut
        </MenuItem>
        <MenuItem
          onClick={handleCtxCopy}
          sx={{
            fontSize: 12,
            color: '#cdd6f4',
            py: 0.5,
            gap: 1.25,
            '&:hover': { background: '#313244' },
          }}
        >
          <span style={{ fontSize: 13 }}>📋</span> Copy
        </MenuItem>
        <MenuItem
          onClick={handleCtxPaste}
          disabled={clipboard === null}
          sx={{
            fontSize: 12,
            color: '#cdd6f4',
            py: 0.5,
            gap: 1.25,
            '&:hover': { background: '#313244' },
            '&.Mui-disabled': { color: '#45475a' },
          }}
        >
          <span style={{ fontSize: 13 }}>📌</span> Paste as child
          {clipboard && (
            <Typography sx={{ fontSize: 9, color: '#585b70', ml: 'auto', pl: 1 }}>
              {clipboard.op === 'cut' ? '(move)' : '(copy)'} {clipboard.entity.varName}
            </Typography>
          )}
        </MenuItem>
        <Divider sx={{ borderColor: '#313244', my: 0.25 }} />
        <MenuItem
          onClick={handleCtxDelete}
          sx={{
            fontSize: 12,
            color: '#f38ba8',
            py: 0.5,
            gap: 1.25,
            '&:hover': { background: '#3e1e1e' },
          }}
        >
          <span style={{ fontSize: 13 }}>🗑</span> Delete
        </MenuItem>
      </Menu>

      {/* VFS file picker dialog */}
      {filePickerOpen && (
        <VfsFilePicker
          rootPath={projectRoot}
          onSelect={handleFileImport}
          onClose={() => setFilePickerOpen(false)}
        />
      )}
    </>
  );
}

/* ── Main panel ──────────────────────────────────────────────────────────────*/

function VisualMinisLibPanel() {
  const {
    entities,
    connections,
    uri,
    isMinisFile,
    savedPositions,
    externalClassDefs,
    importedClasses,
    currentCode,
  } = usePluginState();
  const snippets = useSnippets();
  // Track selection by varName (stable across re-parses) rather than entity.id
  // (auto-numbered e0/e1/… → reshuffled every time the file is parsed). Without
  // this, switching to a source tab and back would silently drop the selection,
  // unmount ClassBuilderPanel, and break the "edit slot" listener.
  const [selectedVarName, setSelectedVarName] = useState<string | null>(null);
  const pendingSelectName = useRef<string | null>(null);

  // Resolve current entity + its (parser-assigned) id from the stable varName.
  // ReactFlow node ids still come from entity.id, so we map back here.
  const selectedEntity = selectedVarName
    ? (entities.find((e) => e.varName === selectedVarName) ?? null)
    : null;
  const selectedEntityId = selectedEntity?.id ?? null;

  // Setter wrapper that mirrors React's `setState` signature — accepts either
  // a value or a `(prev) => next` updater, both keyed by entity.id (what
  // ReactFlow's selection callbacks emit). We translate id ↔ varName so the
  // underlying state stays stable across re-parses.
  const setSelectedEntityId = useCallback(
    (idOrUpdater: string | null | ((prev: string | null) => string | null)) => {
      setSelectedVarName((prevVarName) => {
        const prevId = prevVarName
          ? (entities.find((e) => e.varName === prevVarName)?.id ?? null)
          : null;
        const nextId = typeof idOrUpdater === 'function' ? idOrUpdater(prevId) : idOrUpdater;
        if (!nextId) return null;
        return entities.find((e) => e.id === nextId)?.varName ?? null;
      });
    },
    [entities]
  );

  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  // Ref gives handleNodeDragStop access to the current node list without stale closure
  const nodesRef = useRef<Node[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Sync nodes when entities change; preserve positions of unchanged nodes (keyed by varName)
  useEffect(() => {
    if (entities.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setNodes((prev) => {
      // Key by varName — stable across re-parses (unlike auto-incremented e0/e1 ids)
      const posMap = new Map(
        prev.map((n) => [(n.data as MinisNodeData).entity.varName, n.position])
      );
      return layoutNodes(entities, savedPositions).map((n) => ({
        ...n,
        position: posMap.get((n.data as MinisNodeData).entity.varName) ?? n.position,
      }));
    });
    setEdges(connectionsToEdges(connections, entities));
    // Auto-select newly created class (from "+Class" button)
    if (pendingSelectName.current) {
      const match = entities.find(
        (e) => e.varName === pendingSelectName.current && e.kind === 'class'
      );
      if (match) {
        setSelectedVarName(match.varName);
        pendingSelectName.current = null;
      }
    }
  }, [entities, connections, savedPositions, setNodes, setEdges]);

  // No reset effect needed any more — selectedEntity is derived from varName,
  // so it automatically resolves to null when the class disappears from the
  // parsed entities (deleted, file replaced, etc.).

  // Save node positions to file as metadata comment after every drag
  // The DOM event type, not React's: from @xyflow/react 12.11 on, `OnNodeDrag`
  // is declared with `MouseEvent | TouchEvent` and a synthetic event no longer
  // satisfies it. The event is unused here either way.
  const handleNodeDragStop = useCallback((_: MouseEvent | TouchEvent, draggedNode: Node) => {
    const positions: SavedPositions = {};
    for (const n of nodesRef.current) {
      const varName = (n.data as MinisNodeData).entity.varName;
      positions[varName] = n.id === draggedNode.id ? draggedNode.position : n.position;
    }
    const { uri: u } = _state;
    if (!u) return;
    const model = getEditorModel(u);
    if (!model) return;
    // Always read live model content — never use debounced _state.currentCode as base
    const currentCode = model.getValue();
    const patched = patchGraphMetadata(currentCode, positions);
    replaceModelContent(model, patched);
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const entity = (node.data as MinisNodeData).entity;
    setSelectedEntityId((prev) => (prev === entity.id ? null : entity.id));
  }, []);

  const handleConnect = useCallback(
    (connection: Connection) => {
      const srcNode = nodes.find((n) => n.id === connection.source);
      const tgtNode = nodes.find((n) => n.id === connection.target);
      if (!srcNode || !tgtNode || !connection.sourceHandle || !connection.targetHandle) return;
      const code = generateConnectCode(
        (srcNode.data as MinisNodeData).entity,
        connection.sourceHandle,
        (tgtNode.data as MinisNodeData).entity,
        connection.targetHandle
      );
      const inserted = !!_onInsertCode && (_onInsertCode(code), true);
      addSnippet(code, inserted);
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#cba6f7' },
            style: { stroke: '#cba6f7', strokeWidth: 1.5 },
          },
          eds
        )
      );
    },
    [nodes, setEdges]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') {
          const conn = connections.find((c) => c.id === change.id);
          if (conn) removeConnectLine(conn, uri);
        }
      }
      setEdges((es) => applyEdgeChanges(changes, es));
    },
    [connections, uri, setEdges]
  );

  // Delete entity from source code (called from × button via globalEventBus or Delete key via onNodesDelete)
  const handleDeleteEntity = useCallback(
    (varName: string) => {
      const model = findModel(uri);
      if (!model) return;
      replaceModelContent(model, deleteEntityFromCode(model.getValue(), varName));
    },
    [uri]
  );

  // × button on node header emits this event
  useEffect(() => {
    const unsub = globalEventBus.on<{ varName: string }>('minislib:deleteEntity', ({ varName }) => {
      handleDeleteEntity(varName);
    });
    return unsub;
  }, [handleDeleteEntity]);

  // Click on a slot row → open Edit Slot. Listening at the panel level (not
  // inside ClassBuilderPanel) keeps the wiring alive across tab switches —
  // ClassBuilderPanel only mounts when a class is selected, but this panel
  // is mounted whenever the user sees the graph at all.
  //
  // We keep the pending request in proper React state (not mutated onto the
  // entity object) because the parser produces a fresh entities array on
  // every re-parse — a marker on the old object would silently disappear
  // before ClassBuilderPanel could read it.
  const [pendingEditSlot, setPendingEditSlot] = useState<{
    varName: string;
    slotName: string;
  } | null>(null);

  useEffect(() => {
    const unsub = globalEventBus.on<{ varName: string; slotName: string }>(
      'minislib:editSlot',
      ({ varName, slotName }) => {
        const target = entities.find((e) => e.varName === varName && e.kind === 'class');
        if (!target) return;
        const slot = target.slots.find((s) => s.name === slotName);
        if (!slot || slot.body === undefined || slot.params === undefined) return;
        setPendingEditSlot({ varName, slotName });
        setSelectedVarName(varName);
      }
    );
    return unsub;
  }, [entities]);

  // Clear callback handed down — ClassBuilderPanel calls it after consuming
  // the pending edit so a second click on the same slot still works.
  const clearPendingEditSlot = useCallback(() => setPendingEditSlot(null), []);

  // (selectedEntity is derived earlier from selectedVarName.)

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), []);

  if (!uri) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          p: 2,
          textAlign: 'center',
        }}
      >
        <AutoFixHighIcon sx={{ fontSize: 36, color: '#45475a' }} />
        <Typography sx={{ fontSize: 12, color: '#6c7086' }}>Otwórz plik, żeby zacząć.</Typography>
      </Box>
    );
  }

  // Plik bez importu `@hestia/core` nie ma encji do rysowania, ale sam
  // edytor bloczków jest tu przydatny (np. do składania kodu z funkcji z UML) —
  // pokazujemy go bez górnego paska, z jedną ikoną ustawień.
  if (!isMinisFile) return <StandaloneBlocklyView uri={uri} />;

  return (
    <MinisContainerCtx.Provider value={containerRef}>
      <Box
        ref={containerRef}
        sx={
          isFullscreen
            ? {
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 1400,
                display: 'flex',
                flexDirection: 'column',
                background: '#181825',
              }
            : {
                position: 'relative',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: '#181825',
              }
        }
      >
        {/* Toolbar: Add instance + Define new class + Fullscreen */}
        <Box sx={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #313244' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <AddNodeMenu
              uri={uri}
              externalClassDefs={externalClassDefs}
              importedClasses={importedClasses}
              entities={entities}
            />
          </Box>
          <NewClassButton
            uri={uri}
            onCreated={(varName) => {
              pendingSelectName.current = varName;
            }}
          />
          <ImportButton uri={uri} entities={entities} />
          <OptionsButton uri={uri} />
          <SaveSourceButton uri={uri} />
          <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <IconButton
              size="small"
              onClick={toggleFullscreen}
              sx={{
                px: 1,
                borderLeft: '1px solid #313244',
                borderRadius: 0,
                color: '#585b70',
                '&:hover': { color: '#cdd6f4', background: '#1e1e2e' },
              }}
            >
              {isFullscreen ? (
                <FullscreenExitIcon sx={{ fontSize: 16 }} />
              ) : (
                <FullscreenIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        {entities.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              p: 2,
              textAlign: 'center',
            }}
          >
            <AutoFixHighIcon sx={{ fontSize: 36, color: '#45475a' }} />
            <Typography sx={{ fontSize: 12, color: '#6c7086' }}>
              No minislib entities found.
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#45475a' }}>
              Use <strong style={{ color: '#cba6f7' }}>Add object</strong> above, or declare classes
              extending <code style={{ color: '#4fc3f7' }}>CoreObject</code>.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            {/* Left: collapsible scene tree */}
            <NodeTreePanel
              entities={entities}
              currentCode={currentCode}
              uri={uri}
              selectedEntityId={selectedEntityId}
              onSelectEntity={(id) => setSelectedEntityId((prev) => (prev === id ? null : id))}
              importedClasses={importedClasses}
            />

            {/* Right: ReactFlow canvas + properties + snippets */}
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              {/* ReactFlow canvas */}
              <Box
                sx={{ flex: 1, minHeight: 0, position: 'relative' }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={NODE_TYPES}
                  onNodesChange={(changes: NodeChange[]) =>
                    setNodes((ns) => applyNodeChanges(changes, ns))
                  }
                  onNodesDelete={(deleted) => {
                    for (const n of deleted)
                      handleDeleteEntity((n.data as MinisNodeData).entity.varName);
                  }}
                  onEdgesChange={handleEdgesChange}
                  onConnect={handleConnect}
                  onNodeClick={handleNodeClick}
                  onNodeDragStop={handleNodeDragStop}
                  defaultViewport={_savedViewport ?? { x: 0, y: 0, zoom: 1 }}
                  fitView={_savedViewport === null}
                  fitViewOptions={{ padding: 0.2 }}
                  onMoveEnd={(_, vp) => {
                    _savedViewport = vp;
                  }}
                  minZoom={0.3}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  style={{ background: '#181825' }}
                >
                  <Background color="#313244" variant={BackgroundVariant.Dots} gap={16} size={1} />
                  <Controls
                    style={{ background: '#1e1e2e', border: '1px solid #313244' }}
                    showInteractive={false}
                  />
                </ReactFlow>
                {edges.some((e) => e.selected) && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 8,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      background: '#313244',
                      border: '1px solid #45475a',
                      borderRadius: 1,
                      px: 1,
                      py: 0.5,
                    }}
                  >
                    <Typography sx={{ fontSize: 11, color: '#cdd6f4' }}>
                      Connection selected
                    </Typography>
                    <Tooltip title="Delete connection">
                      <IconButton
                        size="small"
                        onClick={() =>
                          handleEdgesChange(
                            edges
                              .filter((e) => e.selected)
                              .map((e) => ({ type: 'remove' as const, id: e.id }))
                          )
                        }
                        sx={{ color: '#f38ba8', p: 0.25 }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>

              {/* Properties / class builder — shown when a node is selected */}
              {selectedEntity &&
                (selectedEntity.kind === 'class' ? (
                  <ClassBuilderPanel
                    entity={selectedEntity}
                    onClose={() => setSelectedEntityId(null)}
                    pendingEditSlotName={
                      pendingEditSlot?.varName === selectedEntity.varName
                        ? pendingEditSlot.slotName
                        : undefined
                    }
                    onPendingConsumed={clearPendingEditSlot}
                  />
                ) : (
                  <PropertiesPanel
                    entity={selectedEntity}
                    onClose={() => setSelectedEntityId(null)}
                  />
                ))}

              {/* Generated snippets */}
              {snippets.length > 0 && (
                <Box
                  sx={{
                    borderTop: '1px solid #313244',
                    maxHeight: 130,
                    overflowY: 'auto',
                    background: '#13131e',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 10,
                      color: '#45475a',
                      px: 1.5,
                      py: 0.5,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                    }}
                  >
                    Generated
                  </Typography>
                  {snippets.map((s) => (
                    <SnippetRow key={s.id} snippet={s} />
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </MinisContainerCtx.Provider>
  );
}

function VisualMinisLibPanelWrapped() {
  return (
    <ReactFlowProvider>
      <VisualMinisLibPanel />
    </ReactFlowProvider>
  );
}

/* ── Toolbar icons ───────────────────────────────────────────────────────────*/

const ICON_GRAPH = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <circle cx="3" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="13" cy="3.5" r="1.5" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="13" cy="12.5" r="1.5" stroke="currentColor" stroke-width="1.3"/>
  <path d="M5 7.2l6.5-3M5 8.8l6.5 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

const ICON_EXPORT_MANIFEST = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M8 2v8M5.5 7.5L8 10l2.5-2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M3 11v1.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

/* ── Plugin definition ───────────────────────────────────────────────────────*/

const PLUGIN_ID = 'builtin.visual-minislib';

export const VisualMinisLibPlugin = defineEditorPlugin(
  {
    id: PLUGIN_ID,
    name: 'Visual MinisLib',
    version: '1.2.0',
    description: 'Signal-Slot visual graph + properties panel for @hestia/core',
    contributes: ['toolbar', 'commandpalette'],
  },

  (api) => {
    let currentUri = '';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    _onInsertCode = (code) => insertAtEnd(code, currentUri);

    // ── Toolbar ──────────────────────────────────────────────────────────────

    // Register toolbar items once — always visible regardless of active file.
    api.ui.toolbar.register({
      id: 'vml.open',
      label: 'Open MinisLib Graph',
      icon: ICON_GRAPH,
      command: `${PLUGIN_ID}:open`,
      group: 'right',
      order: 160,
    });
    api.ui.toolbar.register({
      id: 'vml.export',
      label: 'Export Plugin Manifest',
      icon: ICON_EXPORT_MANIFEST,
      command: `${PLUGIN_ID}:exportManifest`,
      group: 'right',
      order: 161,
    });

    // ── Commands ─────────────────────────────────────────────────────────────

    api.commands.register('open', () => {
      api.openEditorTab({
        uri: 'virtual://visual-minislib',
        title: 'MinisLib Graph',
        component: VisualMinisLibPanelWrapped,
      });
    });

    api.commands.register('exportManifest', async () => {
      const { uri, entities } = _state;
      if (!uri || uri.startsWith('virtual://')) return;
      const classCount = entities.filter((e) => e.kind === 'class').length;
      if (classCount === 0) {
        api.logger.warn('No class definitions to export');
        return;
      }
      try {
        await saveManifestToVfs(uri, generateManifest(entities));
        api.logger.info('minislib-plugin.json exported');
      } catch (err) {
        api.logger.error(`Export failed: ${err}`);
      }
    });

    api.ui.commandpalette.register({
      command: `${PLUGIN_ID}:open`,
      title: 'Open Signal-Slot Graph',
      category: 'MinisLib',
    });
    api.ui.commandpalette.register({
      command: `${PLUGIN_ID}:exportManifest`,
      title: 'Export Plugin Manifest',
      category: 'MinisLib',
    });

    function updateState(uri: string, code: string) {
      currentUri = uri;
      const isMinisFile = hasMinislibImport(code);
      const { entities, connections } = parseMinisEntities(code);
      const savedPositions = parseGraphMetadata(code);

      const importedClasses: ImportedClass[] = parseNpmImports(code)
        .filter(({ packageName }) => packageName !== '@hestia/core')
        .flatMap(({ packageName, names }) =>
          names
            .filter((n) => /^[A-Z]/.test(n)) // keep only PascalCase (likely classes)
            .map((className) => ({ packageName, className }))
        );

      _state = {
        entities,
        connections,
        uri,
        isMinisFile,
        currentCode: code,
        savedPositions,
        externalClassDefs: [],
        importedClasses,
      };
      notifyState();

      // Async: load external package manifests and re-parse with discovered classes
      if (isMinisFile) {
        loadExternalClassDefs(code, uri).then(({ byClass, entries }) => {
          if (_state.uri !== uri) return;
          const { entities: ext, connections: extConn } = parseMinisEntities(code, byClass);
          _state = { ..._state, entities: ext, connections: extConn, externalClassDefs: entries };
          notifyState();
        });
      }
    }

    api.editor.onDidOpenDocument((uri, text) => {
      if (uri.startsWith('virtual://')) return; // ignore virtual tabs (graph itself, previews)
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      updateState(uri, text);
    });
    api.editor.onDidChangeModel((uri) => {
      if (uri.startsWith('virtual://')) {
        // User switched to graph tab — flush pending debounce and sync immediately
        // so graph always shows the latest file content without waiting 600ms
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        const effectiveUri = currentUri || _state.uri;
        const model = effectiveUri ? findModel(effectiveUri) : null;
        if (model && effectiveUri) updateState(effectiveUri, model.getValue());
      } else {
        currentUri = uri;
      }
    });
    api.editor.onDidChangeContent((text) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        updateState(currentUri, text);
      }, 600);
    });

    // On activation (including after HMR), scan open Monaco models to bootstrap state.
    // Without this, after a hot reload no editor events fire and the graph stays empty.
    requestAnimationFrame(() => {
      if (currentUri) return; // already set by an event that fired during activation
      const models = monaco.editor.getModels();
      for (const model of models) {
        const uri = model.uri.path || model.uri.toString();
        if (uri.startsWith('virtual://') || uri.includes('node_modules')) continue;
        const text = model.getValue();
        if (hasMinislibImport(text)) {
          updateState(uri, text);
          break;
        }
      }
    });

    _vfsContentUnsub = globalEventBus.on<{ path: string; content: string }>(
      'system:vfs:fileContent',
      ({ path, content }) => {
        if (path.startsWith('virtual://')) return;
        if (!/\.(ts|js|tsx|jsx)$/i.test(path)) return;
        if (!hasMinislibImport(content)) return;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        updateState(path, content);
      }
    );

    api.logger.info('Visual MinisLib v1.1 activated');
  },

  () => {
    // Remove toolbar updater — prevents stale api closure from throwing in notifyState()
    // on next activation (each activate() adds a new updateToolbar; without cleanup
    // the old one stays in _stateListeners and its api.ui.toolbar.register() throws,
    // aborting the forEach before the new updateToolbar can run).
    if (_currentUpdateToolbar) {
      _stateListeners.delete(_currentUpdateToolbar);
      _currentUpdateToolbar = null;
    }
    _vfsContentUnsub?.();
    _vfsContentUnsub = null;
    _onInsertCode = null;
    _state = {
      entities: [],
      connections: [],
      uri: '',
      isMinisFile: false,
      currentCode: '',
      savedPositions: {},
      externalClassDefs: [],
      importedClasses: [],
    };
    notifyState();
  }
);

// HMR: after Vite replaces this module, re-activate the plugin so the new closure
// (new _state, new listeners) is used instead of the stale old one.
// `import.meta.hot` is only defined when this file is compiled directly by Vite
// (app dev mode); shipped as a pre-built package it is undefined and this is a no-op.
const _viteHot = (import.meta as { hot?: { accept(cb: () => void | Promise<void>): void } }).hot;
if (_viteHot) {
  _viteHot.accept(async () => {
    // Deactivate old plugin (disposes old listeners, resets old _state)
    await globalPluginRegistry.deactivate(PLUGIN_ID);
    // Replace with new plugin definition from this module evaluation
    globalPluginRegistry.unregister(PLUGIN_ID);
    globalPluginRegistry.register(VisualMinisLibPlugin);
    await globalPluginRegistry.activate(PLUGIN_ID);
  });
}
