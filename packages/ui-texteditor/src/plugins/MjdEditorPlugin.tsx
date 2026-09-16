import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { defineEditorPlugin, globalEventBus } from '../monaco';
import { MjdVfsLoader } from '../mjd';
import type { FileSystemProvider } from '@hestia/core';

const DEF_TAB_URI = 'virtual://mjd-def-editor';
const DATA_TAB_URI = 'virtual://mjd-data-editor';

/* ── Module-level active-file stores ─────────────────────────────────────── */

let _activeMjdUri = '';
let _activeDataUri = '';
const _mjdListeners = new Set<() => void>();
const _dataListeners = new Set<() => void>();
let _vfsUnsub: (() => void) | null = null;

function setActiveMjdUri(uri: string) {
  if (_activeMjdUri === uri) return;
  _activeMjdUri = uri;
  _mjdListeners.forEach((fn) => fn());
}

function setActiveDataUri(uri: string) {
  if (_activeDataUri === uri) return;
  _activeDataUri = uri;
  _dataListeners.forEach((fn) => fn());
}

function useActiveMjdUri(): string {
  const [uri, setUri] = useState(_activeMjdUri);
  useEffect(() => {
    const fn = () => setUri(_activeMjdUri);
    _mjdListeners.add(fn);
    return () => {
      _mjdListeners.delete(fn);
    };
  }, []);
  return uri;
}

function useActiveDataUri(): string {
  const [uri, setUri] = useState(_activeDataUri);
  useEffect(() => {
    const fn = () => setUri(_activeDataUri);
    _dataListeners.add(fn);
    return () => {
      _dataListeners.delete(fn);
    };
  }, []);
  return uri;
}

/* ── URI helpers ─────────────────────────────────────────────────────────── */

function isMjdUri(uri: string): boolean {
  return uri.endsWith('.mjd');
}

// Data files follow the convention: <name>.mjd.json
function isMjdDataUri(uri: string): boolean {
  return uri.endsWith('.mjd.json');
}

// foo.mjd.json → foo.mjd
function defPathFromDataPath(dataPath: string): string {
  return dataPath.slice(0, -'.json'.length);
}

/* ── Panel components ────────────────────────────────────────────────────── */

function MjdDefPanel({ provider }: { provider: FileSystemProvider }) {
  const uri = useActiveMjdUri();

  if (!uri) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          bgcolor: '#1e1e1e',
        }}
      >
        <Typography sx={{ color: '#888', fontSize: 13 }}>
          No .mjd file is active. Open a .mjd file first.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', bgcolor: '#fff' }}>
      <MjdVfsLoader key={uri} provider={provider} mjdPath={uri} />
    </Box>
  );
}

function MjdDataPanel({ provider }: { provider: FileSystemProvider }) {
  const dataUri = useActiveDataUri();

  if (!dataUri) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          bgcolor: '#1e1e1e',
        }}
      >
        <Typography sx={{ color: '#888', fontSize: 13 }}>
          No .mjd.json file is active. Open a .mjd.json file first.
        </Typography>
      </Box>
    );
  }

  const mjdPath = defPathFromDataPath(dataUri);

  return (
    <Box sx={{ height: '100%', overflow: 'auto', bgcolor: '#fff' }}>
      <MjdVfsLoader key={dataUri} provider={provider} mjdPath={mjdPath} dataPath={dataUri} />
    </Box>
  );
}

/* ── Plugin factory ──────────────────────────────────────────────────────── */

export function createMjdEditorPlugin(provider: FileSystemProvider) {
  function MjdDefPanelBound() {
    return <MjdDefPanel provider={provider} />;
  }
  function MjdDataPanelBound() {
    return <MjdDataPanel provider={provider} />;
  }

  return defineEditorPlugin(
    {
      id: 'builtin.mjd-editor',
      name: 'MJD Editor',
      version: '1.0.0',
      description: 'Edit .mjd definition files and .mjd.json data files',
      contributes: ['commandpalette'],
    },

    (api) => {
      function handleUri(uri: string) {
        if (uri.startsWith('virtual://')) return;
        if (isMjdUri(uri)) {
          setActiveMjdUri(uri);
          api.openEditorTab({
            uri: DEF_TAB_URI,
            title: 'MJD Def Editor',
            component: MjdDefPanelBound,
            toSide: false,
          });
        } else if (isMjdDataUri(uri)) {
          setActiveDataUri(uri);
          api.openEditorTab({
            uri: DATA_TAB_URI,
            title: 'MJD Data Editor',
            component: MjdDataPanelBound,
            toSide: false,
          });
        }
      }

      api.editor.onDidOpenDocument((uri) => handleUri(uri));
      api.editor.onDidChangeModel((uri) => {
        if (uri) handleUri(uri);
      });

      _vfsUnsub = globalEventBus.on<{ path: string }>('system:vfs:fileSelected', ({ path }) =>
        handleUri(path)
      );

      api.ui.commandpalette.register({
        command: `${api.pluginId}:openDef`,
        title: 'Open MJD Def Editor',
        category: 'MJD',
      });
      api.ui.commandpalette.register({
        command: `${api.pluginId}:openData`,
        title: 'Open MJD Data Editor',
        category: 'MJD',
      });

      api.commands.register('openDef', () => {
        api.openEditorTab({
          uri: DEF_TAB_URI,
          title: 'MJD Def Editor',
          component: MjdDefPanelBound,
          toSide: false,
        });
      });
      api.commands.register('openData', () => {
        api.openEditorTab({
          uri: DATA_TAB_URI,
          title: 'MJD Data Editor',
          component: MjdDataPanelBound,
          toSide: false,
        });
      });

      api.logger.info('MJD Editor plugin activated');
    },

    () => {
      _vfsUnsub?.();
      _vfsUnsub = null;
      _activeMjdUri = '';
      _activeDataUri = '';
      _mjdListeners.forEach((fn) => fn());
      _dataListeners.forEach((fn) => fn());
    }
  );
}
