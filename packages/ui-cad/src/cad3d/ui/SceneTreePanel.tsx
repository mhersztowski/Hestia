import { useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Box, Typography, Divider, IconButton, Tooltip,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import GridOnIcon from '@mui/icons-material/GridOn';
import FlipIcon from '@mui/icons-material/Flip';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FolderIcon from '@mui/icons-material/Folder';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CategoryIcon from '@mui/icons-material/Category';
import TimelineIcon from '@mui/icons-material/Timeline';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import type { Feature } from '../model/types';

interface Props {
  sceneRoot: THREE.Object3D | null;
  features: Feature[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

// ── Tree node ─────────────────────────────────────────────────────────────────

interface TreeNode {
  uuid: string;
  label: string;
  kind: 'root' | 'group' | 'mesh' | 'wire' | 'sketch';
  featureId: string | null;
  featureType: string | null;
  obj: THREE.Object3D;
  children: TreeNode[];
}

function buildTree(
  obj: THREE.Object3D,
  featureMap: Map<string, Feature>,
  depth = 0,
): TreeNode | null {
  // Skip pure edge helpers (LineSegments without featureId)
  if (obj instanceof THREE.LineSegments && !obj.userData['featureId']) return null;

  const featureId = (obj.userData['featureId'] as string | undefined) ?? null;
  const feature = featureId ? featureMap.get(featureId) : null;

  // Recurse children first
  const children: TreeNode[] = [];
  for (const child of obj.children) {
    const n = buildTree(child, featureMap, depth + 1);
    if (n) children.push(n);
  }

  // Determine kind and label
  let kind: TreeNode['kind'];
  let label: string;

  if (depth === 0) {
    kind = 'root';
    label = 'Scene';
  } else if (feature) {
    kind = feature.type === 'sketch' ? 'sketch'
      : feature.type === 'extrude' ? 'mesh'
      : feature.type === 'revolve' ? 'mesh'
      : 'group';
    label = feature.name;
  } else if (obj instanceof THREE.Mesh) {
    kind = 'mesh';
    label = 'Solid Body';
  } else if (obj instanceof THREE.Line) {
    kind = 'wire';
    label = 'Sketch Wire';
  } else {
    kind = 'group';
    label = 'Group';
  }

  // Drop empty anonymous containers
  if (kind === 'group' && !featureId && children.length === 0 && depth > 0) return null;

  return { uuid: obj.uuid, label, kind, featureId, featureType: feature?.type ?? null, obj, children };
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function NodeIcon({ node, expanded }: { node: TreeNode; expanded: boolean }) {
  const s = { fontSize: 14 };
  if (node.kind === 'root') return <AccountTreeIcon sx={{ ...s, color: 'text.secondary' }} />;
  if (node.kind === 'sketch') return <GridOnIcon sx={{ ...s, color: '#4fc3f7' }} />;
  if (node.featureType === 'extrude') return <ViewInArIcon sx={{ ...s, color: '#81c784' }} />;
  if (node.featureType === 'revolve') return <RotateRightIcon sx={{ ...s, color: '#ffb74d' }} />;
  if (node.featureType === 'mirror') return <FlipIcon sx={{ ...s, color: '#ce93d8' }} />;
  if (node.kind === 'mesh') return <CategoryIcon sx={{ ...s, color: '#81c784' }} />;
  if (node.kind === 'wire') return <TimelineIcon sx={{ ...s, color: '#4fc3f7', opacity: 0.6 }} />;
  return expanded
    ? <FolderOpenIcon sx={{ ...s, color: 'text.secondary' }} />
    : <FolderIcon sx={{ ...s, color: 'text.secondary' }} />;
}

// ── Tree item ─────────────────────────────────────────────────────────────────

interface ItemProps {
  node: TreeNode;
  depth: number;
  selected: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onVisibilityToggle: () => void;
}

function SceneTreeItem({ node, depth, selected, selectedId, onSelect, onVisibilityToggle }: ItemProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const indent = depth * 14;

  const handleClick = useCallback(() => {
    if (node.featureId) onSelect(node.featureId);
    if (hasChildren) setExpanded(e => !e);
  }, [node.featureId, hasChildren, onSelect]);

  const handleToggleVis = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    node.obj.visible = !node.obj.visible;
    onVisibilityToggle();
  }, [node.obj, onVisibilityToggle]);

  const visible = node.obj.visible;

  return (
    <>
      <Box
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          pl: `${indent + 4}px`,
          pr: '4px',
          py: '2px',
          gap: '2px',
          cursor: 'pointer',
          userSelect: 'none',
          opacity: visible ? 1 : 0.4,
          bgcolor: selected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
          minHeight: 26,
        }}
      >
        {/* expand arrow */}
        <Box sx={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {hasChildren
            ? (expanded
              ? <ArrowDropDownIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              : <ArrowRightIcon sx={{ fontSize: 16, color: 'text.secondary' }} />)
            : null}
        </Box>

        <NodeIcon node={node} expanded={expanded} />

        <Typography
          variant="caption"
          noWrap
          sx={{
            flex: 1,
            ml: '4px',
            fontSize: '0.72rem',
            color: selected ? 'primary.main' : 'text.primary',
            fontWeight: selected ? 600 : 400,
          }}
        >
          {node.label}
        </Typography>

        {/* visibility toggle */}
        <Tooltip title={visible ? 'Hide' : 'Show'}>
          <IconButton
            size="small"
            onClick={handleToggleVis}
            sx={{ p: '2px', opacity: 0, '.MuiBox-root:hover > &': { opacity: 1 } }}
          >
            {visible
              ? <VisibilityIcon sx={{ fontSize: 12 }} />
              : <VisibilityOffIcon sx={{ fontSize: 12 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {expanded && hasChildren && node.children.map(child => (
        <SceneTreeItem
          key={child.uuid}
          node={child}
          depth={depth + 1}
          selected={!!child.featureId && child.featureId === selectedId}
          selectedId={selectedId}
          onSelect={onSelect}
          onVisibilityToggle={onVisibilityToggle}
        />
      ))}
    </>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function SceneTreePanel({ sceneRoot, features, selectedId, onSelect }: Props) {
  // Version bumped to force re-render after visibility toggle (obj.visible is mutated in-place)
  const [visVersion, setVisVersion] = useState(0);
  const bumpVis = useCallback(() => setVisVersion(v => v + 1), []);

  const featureMap = new Map(features.map(f => [f.id, f]));
  const tree = sceneRoot ? buildTree(sceneRoot, featureMap) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider', overflow: 'hidden', flex: 1, minHeight: 0 }}>
      <Typography variant="caption" sx={{ px: 1.5, py: 0.75, color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0 }}>
        Scene Tree
      </Typography>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {!tree ? (
          <Typography variant="body2" sx={{ px: 2, py: 2, color: 'text.disabled' }}>
            No scene yet
          </Typography>
        ) : (
          // Render root's children directly (skip the root "Scene" node wrapper if desired)
          // Actually show root as first node
          <SceneTreeItem
            key={tree.uuid + visVersion}
            node={tree}
            depth={0}
            selected={!!tree.featureId && tree.featureId === selectedId}
            selectedId={selectedId}
            onSelect={onSelect}
            onVisibilityToggle={bumpVis}
          />
        )}
      </Box>
    </Box>
  );
}
