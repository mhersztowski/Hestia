/**
 * The Cad3d subpage: the modeller from `@hestia/ui-cad/cad3d`, with the file menu
 * inside its toolbar rather than above it.
 *
 * The whole page is loaded lazily by the shell — see `App.tsx`. The model's
 * file is the feature tree as JSON; the sketches inside it travel with it,
 * because that is what `getTreeJson` writes.
 */

import { useRef } from 'react';
import { Box } from '@mui/material';
import { useProject, type Project } from '@hestia/ui-cad/cad2d';
import { Cad3dEditor, type Cad3dApi } from '@hestia/ui-cad/cad3d';
import type { WorkspaceObject } from '@hestia/ui-core';
import { CadFileBar } from './CadFileBar';

/** An empty feature tree, in the shape `replaceTree` reads. */
const EMPTY_TREE = JSON.stringify({ features: [] });

export function Cad3dPage({
  project,
  workspace,
}: {
  project: Project;
  workspace?: WorkspaceObject;
}) {
  const { version } = useProject(project);
  // The editor fills this in with its own API; the file menu reads and writes
  // the tree through it.
  const api = useRef<Cad3dApi | null>(null);

  return (
    <Box sx={{ height: '100%', minHeight: 0 }}>
      <Cad3dEditor
        project={project}
        version={version}
        apiRef={api}
        toolbarStart={
          <CadFileBar
            kind="model"
            read={() => api.current?.getTreeJson() ?? EMPTY_TREE}
            apply={(content) => api.current?.replaceTree(content ?? EMPTY_TREE)}
            workspace={workspace}
          />
        }
      />
    </Box>
  );
}
