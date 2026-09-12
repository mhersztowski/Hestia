/**
 * Help dialog for the Plugin Script block. Thin wrapper around `MdDocsDialog`
 * with the contents of `docs/MDScript.md` (repo-root) bundled via Vite's `?raw`.
 *
 * Lazy-loaded by PluginScriptExtension so the docs only enter the chunk graph
 * when the user actually clicks the (?) icon.
 */

import React from 'react';
import MdDocsDialog from './MdDocsDialog';
import { useEditorServices } from '../capabilities';

export interface MdScriptHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const MdScriptHelpDialog: React.FC<MdScriptHelpDialogProps> = ({ open, onClose }) => {
  // MyCastle bundled `docs/MDScript.md` with Vite's `?raw`. A package cannot
  // reach out of itself for a repository file, so the host passes the text —
  // and with none, there is nothing to show and no dialog.
  const { mdScriptDocs } = useEditorServices();
  if (!mdScriptDocs) return null;

  return (
    <MdDocsDialog
      open={open}
      onClose={onClose}
      title="Plugin Script — dokumentacja"
      accent="#7c4dff"
      markdown={mdScriptDocs}
    />
  );
};

export default MdScriptHelpDialog;
