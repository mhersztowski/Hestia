import { useState, useCallback } from 'react';
import type { FileSystemProvider } from '@hestia/core';
import { basename, join } from '@hestia/core';

export interface VfsClipboard {
  paths: string[];
  operation: 'copy' | 'cut' | null;
}

export function useVfsClipboard() {
  const [clipboard, setClipboard] = useState<VfsClipboard>({ paths: [], operation: null });

  const copy = useCallback((paths: string[]) => {
    setClipboard({ paths, operation: 'copy' });
  }, []);

  const cut = useCallback((paths: string[]) => {
    setClipboard({ paths, operation: 'cut' });
  }, []);

  const clear = useCallback(() => {
    setClipboard({ paths: [], operation: null });
  }, []);

  const paste = useCallback(async (targetDir: string, provider: FileSystemProvider) => {
    if (!clipboard.operation || clipboard.paths.length === 0) return;

    for (const sourcePath of clipboard.paths) {
      const name = basename(sourcePath);
      const destPath = join(targetDir, name);

      if (clipboard.operation === 'copy') {
        if (provider.copy) {
          await provider.copy(sourcePath, destPath, { overwrite: false });
        } else {
          // Fallback: read + write for providers without copy
          const content = await provider.readFile(sourcePath);
          if (provider.writeFile) {
            await provider.writeFile(destPath, content, { create: true, overwrite: false });
          }
        }
      } else {
        // cut = move = rename
        if (provider.rename) {
          await provider.rename(sourcePath, destPath, { overwrite: false });
        }
      }
    }

    if (clipboard.operation === 'cut') {
      clear();
    }
  }, [clipboard, clear]);

  const canPaste = clipboard.operation !== null && clipboard.paths.length > 0;

  return { clipboard, copy, cut, paste, canPaste, clear };
}
