/**
 * Plugin Script Block — wykonywalny blok skryptowy z dostępem do API aplikacji.
 * Format: Node TipTap z atrybutami blockId / code / mode / label / collapsed.
 * Skrypt może zwracać: string, MarkdownOutput, TableOutput, ReactiveValue, ReactElement.
 */

import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExtensionIcon from '@mui/icons-material/Extension';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import EditIcon from '@mui/icons-material/Edit';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import OutputIcon from '@mui/icons-material/OutputOutlined';
import Editor from '@monaco-editor/react';

// Lazy — the docs string is bundled into MdScriptHelpDialog's chunk, so users
// who never click the (?) icon don't pay for it.
const MdScriptHelpDialog = lazy(() => import('./MdScriptHelpDialog'));

import {
  useEditorFiles,
  useEditorServices,
  useEditorSession,
  type EditorScriptHost,
  type EditorScriptScene,
} from '../capabilities';
import { useMdEnv } from './MdEnvContext';
import { editorOverlay } from '../editorOverlayState';
import type {
  ScriptDisplayApi as DisplayApi,
  ScriptDisplayItem as DisplayItem,
  ScriptOutput,
} from '../capabilities';

// ─── Monaco IntelliSense bootstrap ────────────────────────────────────────────
//
// Registers the Plugin Script globals (`auth`, `http`, `md`, `table`,
// `reactive`, `display`, …) so Monaco offers autocomplete + hover docs
// inside the script editor.
//
// Shares the same setup helpers as AutomateScriptExtension (`applyScriptDefaults`
// + `mergeExtraLibs`). `mergeExtraLibs` uses `monaco.editor.createModel()`
// under the hood, NOT `addExtraLib` — same reason as Automate: createModel
// doesn't restart the TS worker, while every addExtraLib/setExtraLibs cycle
// does, and a restarting worker can't answer completion queries.
//
// Together with `defaultLanguage="typescript"` below this gets ambient
// `declare const auth/http/md/table/reactive/display` actually visible to
// the editor model — JS and TS service treat each other's models as separate
// compilation contexts, so a .ts ambient is invisible from a .js model.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureScriptGlobals(monaco: any, host?: EditorScriptHost | null): void {
  // Defaults and type declarations are the host's: it defines the language the
  // script is written in. Without one Monaco opens plain — completion is
  // missing, editing is not.
  host?.configureMonaco?.(monaco);
}

// ─── Display API (imperative output, compatible with automate block) ──────────

function makeDisplayApi(push: (item: DisplayItem) => void): DisplayApi {
  return {
    text: (str) => push({ type: 'text', data: String(str) }),
    table: (data) => push({ type: 'table', data }),
    list: (items) => push({ type: 'list', data: items }),
    json: (obj) => push({ type: 'json', data: obj }),
  };
}

// Renders display.* imperative output (same renderer as AutomateScriptBlock)
const DisplayOutput: React.FC<{ items: DisplayItem[] }> = ({ items }) => {
  if (items.length === 0) return null;
  return (
    <Box sx={{ p: 1 }}>
      {items.map((item, i) => {
        if (item.type === 'text') {
          return (
            <Typography
              key={i}
              variant="body2"
              sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
            >
              {String(item.data)}
            </Typography>
          );
        }
        if (item.type === 'json') {
          return (
            <Box
              key={i}
              sx={{
                bgcolor: '#f5f5f5',
                borderRadius: 0.5,
                p: 1,
                my: 0.5,
                overflow: 'auto',
                maxHeight: 200,
              }}
            >
              <Typography
                variant="body2"
                component="pre"
                sx={{ fontFamily: 'monospace', fontSize: '0.75rem', m: 0, whiteSpace: 'pre-wrap' }}
              >
                {JSON.stringify(item.data, null, 2)}
              </Typography>
            </Box>
          );
        }
        if (item.type === 'list') {
          return (
            <Box key={i} component="ul" sx={{ my: 0.5, pl: 2 }}>
              {(item.data as unknown[]).map((li, idx) => (
                <Typography
                  key={idx}
                  component="li"
                  variant="body2"
                  sx={{ fontFamily: 'monospace' }}
                >
                  {String(li)}
                </Typography>
              ))}
            </Box>
          );
        }
        // table
        const data = item.data as Record<string, unknown>[] | unknown[][];
        if (!Array.isArray(data) || data.length === 0) return null;
        const isObj = typeof data[0] === 'object' && !Array.isArray(data[0]);
        const headers = isObj
          ? Object.keys(data[0] as Record<string, unknown>)
          : (data[0] as unknown[]).map((_, idx) => String(idx));
        return (
          <Box key={i} sx={{ overflow: 'auto', my: 0.5 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: '100%' }}>
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th
                      key={hi}
                      style={{ border: '1px solid #ddd', padding: '2px 6px', textAlign: 'left' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, ri) => (
                  <tr key={ri}>
                    {isObj
                      ? headers.map((h, hi) => (
                          <td key={hi} style={{ border: '1px solid #ddd', padding: '2px 6px' }}>
                            {String((row as Record<string, unknown>)[h] ?? '')}
                          </td>
                        ))
                      : (row as unknown[]).map((cell, ci) => (
                          <td key={ci} style={{ border: '1px solid #ddd', padding: '2px 6px' }}>
                            {String(cell ?? '')}
                          </td>
                        ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        );
      })}
    </Box>
  );
};

// ─── Node View ────────────────────────────────────────────────────────────────

type RunStatus = 'idle' | 'running' | 'completed' | 'error';

const PluginScriptNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const session = useEditorSession();
  const currentUser = session?.userName ? { name: session.userName } : null;
  const token = session?.token ?? null;
  const isAdmin = session?.isAdmin ?? false;
  const files = useEditorFiles();
  const { scriptHost, scriptRunner } = useEditorServices();
  const mdEnv = useMdEnv();
  const pluginsVersion = scriptHost?.pluginsVersion ?? 0;

  const blockId = useRef(
    node.attrs.blockId || crypto.randomUUID?.() || Math.random().toString(36).slice(2)
  );
  const autorunFiredRef = useRef(false);
  const lastPluginsVersionRef = useRef(0);

  const [code, setCode] = useState<string>((node.attrs.code as string) || '');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [error, setError] = useState<string | undefined>();
  const [richOutput, setRichOutput] = useState<ScriptOutput>(undefined);
  /** Scena wczytana przez `Scene.load` — panel pokazuje się pod wynikiem. */
  const [scenaPanelu, setScenaPanelu] = useState<EditorScriptScene | null>(null);
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [isLive, setIsLive] = useState(false);

  const [outputVisible, setOutputVisible] = useState(true);

  const [labelEditing, setLabelEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState<string>((node.attrs.label as string) || 'Script');
  const [monacoOpen, setMonacoOpen] = useState(false);
  // Suppress the MdEditor bubble menu while the fullscreen script editor is open.
  useEffect(() => {
    if (!monacoOpen) return;
    editorOverlay.enter();
    return () => editorOverlay.exit();
  }, [monacoOpen]);
  const [monacoCode, setMonacoCode] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  const mode = node.attrs.mode as 'auto' | 'manual';
  const label = (node.attrs.label as string) || 'Script';
  const collapsed = node.attrs.collapsed as boolean;

  // Assign blockId on first render
  useEffect(() => {
    if (!node.attrs.blockId) updateAttributes({ blockId: blockId.current });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pushDisplay = useCallback((item: DisplayItem) => {
    setDisplayItems((prev) => [...prev, item]);
  }, []);

  const run = useCallback(async () => {
    // No runner means the block shows its code and does not run it. There is no
    // button that promises a run and ends in an error.
    if (!scriptRunner) return;
    if (status === 'running') return;
    setStatus('running');
    setError(undefined);
    setRichOutput(undefined);
    setDisplayItems([]);
    setIsLive(false);
    setOutputVisible(true);
    // Yield to React so the clears above render before the script starts
    // producing new output via display.* calls.
    await Promise.resolve();

    const ctx = scriptRunner.buildContext(
      {
        currentUser: (currentUser as { name?: string } | null)?.name ?? null,
        token: token ?? null,
        isAdmin,
      },
      { get: (name: string) => mdEnv.get(name), all: () => mdEnv.all() }
    );
    const display = makeDisplayApi(pushDisplay);

    /*
      Scena wczytana przez `Scene.load` pojawia się w panelu pod wynikiem.
      Host podstawiamy na czas przebiegu i zdejmujemy po nim: dwa bloki na
      jednej stronie mają własne panele, a scena z jednego nie ma prawa wpaść
      do wyniku drugiego.
    */
    setScenaPanelu(null);
    scriptHost?.setSceneHost?.({
      readFile: async (path) => (await files?.readFile(path))?.content ?? null,
      writeFile: async (path, content) => {
        await files?.writeFile(path, content);
      },
      present: (scene, opis) => setScenaPanelu({ scene, path: opis.path }),
    });

    try {
      const result = await scriptRunner.execute(code, ctx, display);
      if (scriptRunner.isLive(result)) setIsLive(true);
      setRichOutput(result);
      setStatus('completed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    } finally {
      scriptHost?.setSceneHost?.(null);
    }
  }, [
    status,
    code,
    currentUser,
    token,
    isAdmin,
    pushDisplay,
    mdEnv,
    scriptHost,
    files,
    scriptRunner,
  ]);

  // Auto-run on mount when mode === 'auto'
  useEffect(() => {
    if (mode === 'auto' && code && !autorunFiredRef.current) {
      autorunFiredRef.current = true;
      run();
    }
  }, [mode, code, run]);

  // Re-run auto blocks when plugins finish loading (fixes race: auto-run fires before plugins ready)
  useEffect(() => {
    if (
      mode === 'auto' &&
      code &&
      autorunFiredRef.current &&
      pluginsVersion > lastPluginsVersionRef.current
    ) {
      lastPluginsVersionRef.current = pluginsVersion;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginsVersion]);

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setCode(v);
      updateAttributes({ code: v });
    },
    [updateAttributes]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        run();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const ta = e.currentTarget;
        const s = ta.selectionStart;
        const newCode = code.slice(0, s) + '  ' + code.slice(ta.selectionEnd);
        setCode(newCode);
        updateAttributes({ code: newCode });
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = s + 2;
        });
        return;
      }
      e.stopPropagation();
    },
    [code, updateAttributes, run]
  );

  const clearOutput = useCallback(() => {
    setRichOutput(undefined);
    setDisplayItems([]);
    setError(undefined);
    setStatus('idle');
    setIsLive(false);
  }, []);

  const commitLabel = useCallback(() => {
    updateAttributes({ label: labelDraft });
    setLabelEditing(false);
  }, [labelDraft, updateAttributes]);

  const openMonaco = useCallback(() => {
    setMonacoCode(code);
    setMonacoOpen(true);
  }, [code]);
  const saveMonaco = useCallback(() => {
    setCode(monacoCode);
    updateAttributes({ code: monacoCode });
    setMonacoOpen(false);
  }, [monacoCode, updateAttributes]);

  const hasOutput =
    (richOutput !== null && richOutput !== undefined) || displayItems.length > 0 || !!error;
  const accentColor = '#7c4dff';

  return (
    <NodeViewWrapper data-block-id={node.attrs.blockId || undefined}>
      <Paper
        elevation={selected ? 3 : 1}
        sx={{
          border: selected ? `2px solid ${accentColor}` : '1px solid',
          borderColor: selected ? accentColor : 'grey.300',
          overflow: 'hidden',
          my: 1,
        }}
      >
        {/* ── Header ── */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.5,
            bgcolor: '#1a1040',
            color: '#e0d7ff',
          }}
        >
          <ExtensionIcon sx={{ fontSize: 15, color: accentColor, flexShrink: 0 }} />

          {/* Label — inline editable */}
          {labelEditing ? (
            <TextField
              size="small"
              variant="standard"
              value={labelDraft}
              autoFocus
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitLabel();
                e.stopPropagation();
              }}
              inputProps={{ style: { color: '#e0d7ff', fontSize: '0.75rem', padding: 0 } }}
              sx={{ flex: 1, '& .MuiInput-underline:before': { borderColor: accentColor } }}
            />
          ) : (
            <Typography
              variant="caption"
              sx={{
                flex: 1,
                color: '#c7bbff',
                fontSize: '0.72rem',
                cursor: 'text',
                '&:hover': { color: '#e0d7ff' },
              }}
              onClick={() => {
                setLabelDraft(label);
                setLabelEditing(true);
              }}
            >
              {label}
            </Typography>
          )}

          {isLive && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mr: 0.5 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: '#4caf50',
                  animation: 'pulse 2s infinite',
                }}
              />
              <Typography variant="caption" sx={{ color: '#4caf50', fontSize: '0.6rem' }}>
                LIVE
              </Typography>
            </Box>
          )}

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={mode === 'auto'}
                onChange={(e) => updateAttributes({ mode: e.target.checked ? 'auto' : 'manual' })}
                sx={{
                  '& .MuiSwitch-thumb': { bgcolor: mode === 'auto' ? accentColor : '#555' },
                  '& .MuiSwitch-track': {
                    bgcolor: mode === 'auto' ? 'rgba(124,77,255,0.4)' : 'rgba(255,255,255,0.15)',
                  },
                }}
              />
            }
            label={
              <Typography variant="caption" sx={{ color: '#c7bbff', fontSize: '0.62rem' }}>
                Auto
              </Typography>
            }
            sx={{ mr: 0, ml: 0 }}
          />

          <Tooltip title="Run (Ctrl+Enter)">
            <span>
              <IconButton
                size="small"
                onClick={run}
                disabled={status === 'running'}
                sx={{ color: accentColor, '&:hover': { bgcolor: 'rgba(124,77,255,0.15)' } }}
              >
                {status === 'running' ? (
                  <CircularProgress size={13} sx={{ color: accentColor }} />
                ) : (
                  <PlayArrowIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Monaco editor">
            <IconButton
              size="small"
              onClick={openMonaco}
              sx={{ color: '#c7bbff', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}
            >
              <OpenInFullIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Dokumentacja Plugin Script">
            <IconButton
              size="small"
              onClick={() => setHelpOpen(true)}
              sx={{ color: '#c7bbff', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}
            >
              <HelpOutlineIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Edit label">
            <IconButton
              size="small"
              onClick={() => {
                setLabelDraft(label);
                setLabelEditing(true);
              }}
              sx={{ color: '#c7bbff', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}
            >
              <EditIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Clear output">
            <span>
              <IconButton
                size="small"
                onClick={clearOutput}
                disabled={!hasOutput}
                sx={{
                  color: hasOutput ? '#c7bbff' : '#444',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                  '&.Mui-disabled': { color: '#444' },
                }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip
            title={
              outputVisible ? 'Hide output' : `Show output${hasOutput ? ' (has content)' : ''}`
            }
          >
            <span>
              <IconButton
                size="small"
                onClick={() => setOutputVisible((v) => !v)}
                sx={{
                  color: hasOutput ? (outputVisible ? accentColor : '#c7bbff') : '#444',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                  position: 'relative',
                }}
              >
                <OutputIcon sx={{ fontSize: 14 }} />
                {/* dot indicator: output exists but panel is hidden */}
                {hasOutput && !outputVisible && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 3,
                      right: 3,
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      bgcolor: accentColor,
                    }}
                  />
                )}
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={collapsed ? 'Show code' : 'Hide code'}>
            <IconButton
              size="small"
              onClick={() => updateAttributes({ collapsed: !collapsed })}
              sx={{ color: '#c7bbff', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}
            >
              {collapsed ? (
                <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
              ) : (
                <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        {/* ── Code editor ── */}
        {!collapsed && (
          <textarea
            value={code}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 80,
              maxHeight: 400,
              padding: '12px',
              fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
              fontSize: '0.875em',
              lineHeight: 1.6,
              backgroundColor: '#120d2e',
              color: '#e0d7ff',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              tabSize: 2,
              boxSizing: 'border-box',
              display: 'block',
            }}
          />
        )}

        {/* ── Output ── */}
        {/*
          Panel sceny stoi **poza** oknem wyniku i nie ma jego ograniczenia
          wysokości: scena ściśnięta do 400 px jest nie do obejrzenia, a to
          jedyny powód, dla którego skrypt ją wczytał.
        */}
        {scenaPanelu && outputVisible && (
          <Box
            sx={{ borderTop: '1px solid rgba(124,77,255,0.25)', p: 1, bgcolor: 'background.paper' }}
          >
            {scriptHost?.renderScene?.(scenaPanelu, '70vh')}
          </Box>
        )}

        {hasOutput && outputVisible && (
          <Box
            sx={{
              borderTop: '1px solid rgba(124,77,255,0.25)',
              maxHeight: 400,
              overflow: 'auto',
              bgcolor: 'background.paper',
            }}
          >
            {error && (
              <Alert severity="error" sx={{ borderRadius: 0, py: 0.25, fontSize: '0.8rem' }}>
                {error}
              </Alert>
            )}
            {/* Rich return value */}
            {scriptRunner?.renderOutput(richOutput)}
            {/* Imperative display.* calls */}
            <DisplayOutput items={displayItems} />
          </Box>
        )}
      </Paper>

      {/* ── Monaco dialog ── */}
      <Dialog
        open={monacoOpen}
        onClose={() => setMonacoOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: '80vh' } }}
      >
        <DialogTitle sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ExtensionIcon sx={{ color: accentColor }} />
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
            {label}
          </Typography>
          <Tooltip title="Dokumentacja Plugin Script">
            <IconButton size="small" onClick={() => setHelpOpen(true)}>
              <HelpOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Editor
            height="100%"
            // TypeScript so the ambient `declare const auth/http/md/table/
            // reactive/display` declarations from `scriptGlobals.ts` (registered
            // as a TS model via createModel) are visible to the editor. JS and
            // TS service maintain separate compilation contexts; a .ts ambient
            // is invisible from a .js model, which is why completions for
            // user-defined locals worked but `auth.*` / `http.*` etc. didn't.
            defaultLanguage="typescript"
            value={monacoCode}
            onChange={(v) => setMonacoCode(v || '')}
            theme="vs-dark"
            beforeMount={(monaco) => ensureScriptGlobals(monaco, scriptHost)}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMonacoOpen(false)}>Cancel</Button>
          <Button onClick={saveMonaco} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Help dialog ── */}
      {/* Suspense fallback is null because the chunk is small enough that the
          flash would be jarring; the dialog opens with a beat of delay on
          first click and then is cached. */}
      <Suspense fallback={null}>
        {helpOpen && <MdScriptHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />}
      </Suspense>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </NodeViewWrapper>
  );
};

// ─── TipTap Extension ─────────────────────────────────────────────────────────

export const PluginScriptBlock = Node.create({
  name: 'pluginScriptBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: '' },
      code: { default: '' },
      mode: { default: 'manual' },
      label: { default: 'Script' },
      collapsed: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="plugin-script-block"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const el = node as HTMLElement;
          return {
            blockId: el.getAttribute('data-block-id') || '',
            code: el.getAttribute('data-code')
              ? decodeURIComponent(el.getAttribute('data-code') || '')
              : '',
            mode: el.getAttribute('data-mode') || 'manual',
            label: el.getAttribute('data-label') || 'Script',
            collapsed: el.getAttribute('data-collapsed') === 'true',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs: Record<string, string> = {
      'data-type': 'plugin-script-block',
      'data-mode': node.attrs.mode,
      'data-label': node.attrs.label,
      'data-collapsed': node.attrs.collapsed ? 'true' : 'false',
    };
    if (node.attrs.blockId) attrs['data-block-id'] = node.attrs.blockId;
    if (node.attrs.code) attrs['data-code'] = encodeURIComponent(node.attrs.code);
    return ['div', attrs];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PluginScriptNodeView);
  },

  addCommands() {
    return {
      insertPluginScript:
        (code = '', opts?: { mode?: 'auto' | 'manual'; label?: string }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              code,
              mode: opts?.mode ?? 'manual',
              label: opts?.label ?? 'Script',
              blockId: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
            },
          }),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pluginScriptBlock: {
      insertPluginScript: (
        code?: string,
        opts?: { mode?: 'auto' | 'manual'; label?: string }
      ) => ReturnType;
    };
  }
}

export default PluginScriptBlock;
