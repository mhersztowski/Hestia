/**
 * The 2D CAD page — the `cad` mode of `cad-app` as one component.
 *
 * The parts were already components there; what lived in `App.tsx` was the
 * wiring between them: the active tool, the coordinates typed into the command
 * line, the layers/properties tabs, and the rule that a newly drawn element
 * becomes the selected one. That wiring is here, and nothing else — the file
 * menu, the repository of templates and the AI panel stayed with the
 * application, because they were its own and not the drawing's.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import LayersIcon from '@mui/icons-material/Layers';
import TuneIcon from '@mui/icons-material/Tune';
import { Project, type Point2D, type ViewMode } from '../core';
import type { ToolName } from '../tools/types';
import { useProject } from '../hooks/useProject';
import { ActionBar } from './ActionBar';
import { CadCanvas, type PlacementStamp } from './CadCanvas';
import { CommandLine } from './CommandLine';
import { LayerPanel } from './LayerPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';

export interface Cad2dEditorProps {
  /**
   * The drawing. Build it once (`useMemo`) and keep it — the host owns it, so
   * that its own file menu can save and load the same object. Without one the
   * editor makes an empty project of its own, which is enough to try it out.
   */
  project?: Project;
  /**
   * `2d` is the drawing plane, `3d` an orbit view of the same drawing. The
   * switch between them belongs to the host (in `cad-app` it sat in the
   * application's top bar) — put it in `actionBarExtras`.
   */
  viewMode?: ViewMode;
  /** The active tool, when the host wants to drive it (a menu of its own, a keyboard shortcut). */
  activeTool?: ToolName;
  onToolChange?: (tool: ToolName) => void;
  /** A drawing armed for stamping — see `PlacementStamp`. */
  placementStamp?: PlacementStamp | null;
  onCancelPlacement?: () => void;
  /**
   * The host's own controls at the start of the action bar — this is where a
   * file menu goes. In the bar rather than above it, because two bars stacked
   * on a tablet cost a fifth of the drawing.
   */
  toolbarStart?: ReactNode;
  /** Extra buttons at the end of the action bar. */
  actionBarExtras?: ReactNode;
  /** Rendered under the canvas, above the status bar (the host's own panel). */
  belowCanvas?: ReactNode;
  /** Hides the layers/properties column when the host draws its own. */
  hideSidePanel?: boolean;
}

type RightTab = 'layers' | 'properties';

export function Cad2dEditor({
  project: projectProp,
  viewMode = '2d',
  activeTool: toolProp,
  onToolChange,
  placementStamp,
  onCancelPlacement,
  toolbarStart,
  actionBarExtras,
  belowCanvas,
  hideSidePanel,
}: Cad2dEditorProps) {
  // A project of our own only when the host does not supply one; `useMemo` with
  // an empty dependency list, so a re-render does not throw the drawing away.
  const ownProject = useMemo(() => new Project(), []);
  const project = projectProp ?? ownProject;
  const { version } = useProject(project);

  const [ownTool, setOwnTool] = useState<ToolName>('select');
  const activeTool = toolProp ?? ownTool;

  const [rightTab, setRightTab] = useState<RightTab>('layers');
  const [injectedPoint, setInjectedPoint] = useState<Point2D | null>(null);
  const [injectedAngle, setInjectedAngle] = useState<number | null>(null);
  const lastPointRef = useRef<Point2D | null>(null);

  const handleToolChange = useCallback(
    (tool: ToolName) => {
      setOwnTool(tool);
      onToolChange?.(tool);
      // Coordinates typed for the previous tool would otherwise start the new one.
      setInjectedPoint(null);
      setInjectedAngle(null);
    },
    [onToolChange]
  );

  const handleCoordinate = useCallback((point: Point2D) => {
    setInjectedPoint({ ...point });
    lastPointRef.current = point;
  }, []);

  // A fresh object every time, so that typing the same angle twice still counts
  // as a change — the canvas reacts to the value, not to the keystroke.
  const handleAngle = useCallback((degrees: number) => {
    setInjectedAngle(degrees + Math.random() * 1e-10);
  }, []);

  const handleLastPoint = useCallback((p: Point2D) => {
    lastPointRef.current = p;
  }, []);

  // A newly drawn element becomes the selected one and the panel switches to
  // its properties: after drawing, what one wants is its dimensions.
  useEffect(
    () =>
      project.eventBus.on('entity:added', (entity) => {
        project.selectionManager.clear();
        project.selectionManager.select(entity.id);
        project.eventBus.emit('selection:changed', project.selectionManager.getSelected());
        setRightTab('properties');
      }),
    [project]
  );

  return (
    <Box
      sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      <ActionBar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        project={project}
        start={toolbarStart}
      >
        {actionBarExtras}
      </ActionBar>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar activeTool={activeTool} onToolChange={handleToolChange} viewMode={viewMode} />

        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <CadCanvas
            project={project}
            activeTool={activeTool}
            version={version}
            viewMode={viewMode}
            injectedPoint={injectedPoint}
            injectedAngle={injectedAngle}
            onLastPoint={handleLastPoint}
            onToolChange={handleToolChange}
            placementStamp={placementStamp}
            onCancelPlacement={onCancelPlacement}
          />
        </Box>

        {!hideSidePanel && (
          <Box
            sx={{
              width: 200,
              display: 'flex',
              flexDirection: 'column',
              bgcolor: 'background.paper',
              borderLeft: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Tabs
              value={rightTab}
              onChange={(_, v: RightTab) => setRightTab(v)}
              sx={{
                minHeight: 32,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '& .MuiTab-root': { minHeight: 32, py: 0, fontSize: 11, minWidth: 0, flex: 1 },
              }}
            >
              <Tab
                value="layers"
                label="Layers"
                icon={<LayersIcon sx={{ fontSize: 14 }} />}
                iconPosition="start"
              />
              <Tab
                value="properties"
                label="Props"
                icon={<TuneIcon sx={{ fontSize: 14 }} />}
                iconPosition="start"
              />
            </Tabs>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {rightTab === 'layers' ? (
                <LayerPanel project={project} version={version} />
              ) : (
                <PropertiesPanel project={project} version={version} />
              )}
            </Box>
          </Box>
        )}
      </Box>

      {belowCanvas}
      <StatusBar project={project} activeTool={activeTool} viewMode={viewMode} />
      {/* The command line takes coordinates and angles — in the 3D view there is
          no plane for them to mean anything on. */}
      {viewMode === '2d' && (
        <CommandLine
          activeTool={activeTool}
          onToolChange={handleToolChange}
          onCoordinate={handleCoordinate}
          onAngle={handleAngle}
          lastPoint={lastPointRef.current}
        />
      )}
    </Box>
  );
}
