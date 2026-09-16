/**
 * The Cad2d subpage: the editor from `@hestia/ui-cad/cad2d`, with the file menu
 * inside its action bar rather than above it.
 *
 * The `Project` comes from the shell rather than from here, because the 3D
 * modeller sketches on the same one: a sketch **is** a 2D drawing, and switching
 * tabs must not throw it away.
 */

import { Box } from '@mui/material';
import { Cad2dEditor, Project, loadProjectFromText } from '@hestia/ui-cad/cad2d';
import type { WorkspaceObject } from '@hestia/ui-core';
import { CadFileBar } from './CadFileBar';

/** An empty drawing, as text — what "new" loads. */
function emptyDrawing(): string {
  return JSON.stringify(new Project().toJSON());
}

export function Cad2dPage({
  project,
  workspace,
}: {
  project: Project;
  workspace?: WorkspaceObject;
}) {
  return (
    <Box sx={{ height: '100%', minHeight: 0 }}>
      <Cad2dEditor
        project={project}
        toolbarStart={
          <CadFileBar
            kind="drawing"
            read={() => JSON.stringify(project.toJSON(), null, 2)}
            // The project object stays the same one throughout — the
            // editor, the canvas and the 3D sketches all hold it, so
            // opening a file fills it rather than replacing it.
            apply={(content) => loadProjectFromText(content ?? emptyDrawing(), project)}
            workspace={workspace}
          />
        }
      />
    </Box>
  );
}
