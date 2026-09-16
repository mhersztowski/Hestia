/**
 * What React Flow draws: the class node, the relation edge, the UML arrowheads,
 * and their diff-view counterparts.
 */
import { createContext, useContext } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getSmoothStepPath,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import { Box, Tooltip, Typography } from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import type { RelType, UmlMember } from '@hestia/node-devtools/format';
import {
  DIFF_COLOR,
  type DiffFlowEdge,
  type DiffFlowNode,
  type DiffMember,
  type DiffStatus,
} from './diff';
import {
  KIND_META,
  REL_META,
  VIS_LABEL,
  VIS_ORDER,
  categoryColor,
  docTooltip,
  hasDoc,
  memberSigil,
  type UmlFlowEdge,
  type UmlFlowNode,
} from './model';

/** The active member-category filter — `null` shows every member. */
export const CategoryFilterContext = createContext<string | null>(null);

const handleStyle = { width: 9, height: 9, background: '#fff', border: '2px solid #888' };

function Handles() {
  return (
    <>
      <Handle id="t" type="source" position={Position.Top} style={handleStyle} />
      <Handle id="r" type="source" position={Position.Right} style={handleStyle} />
      <Handle id="b" type="source" position={Position.Bottom} style={handleStyle} />
      <Handle id="l" type="source" position={Position.Left} style={handleStyle} />
    </>
  );
}

function MemberLines({ members }: { members: UmlMember[] }) {
  const groups = VIS_ORDER.map((sig) => ({
    sig,
    items: members.filter((m) => memberSigil(m.text) === sig),
  })).filter((g) => g.items.length > 0);
  const multiVis = groups.length > 1;

  return (
    <Box
      sx={{
        px: 1,
        py: 0.5,
        minHeight: 18,
        borderBottom: '1px solid',
        borderColor: 'divider',
        whiteSpace: 'pre',
      }}
    >
      {members.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>&nbsp;</Typography>
      ) : (
        groups.map(({ sig, items }, gi) => (
          <Box key={sig}>
            {multiVis && gi > 0 && (
              <Box
                sx={{ mx: -1, px: 1, borderTop: '1px dashed', borderColor: 'divider', mt: 0.25 }}
              >
                <Typography
                  sx={{
                    fontSize: 9,
                    color: 'text.disabled',
                    fontFamily: 'monospace',
                    lineHeight: 1.4,
                  }}
                >
                  {VIS_LABEL[sig]}
                </Typography>
              </Box>
            )}
            {items.map((m) => (
              // A native `title` rather than an MUI Tooltip — nodes re-render on
              // every drag, and the native hint costs nothing and keeps the
              // line breaks.
              <Typography
                key={m.id}
                title={docTooltip(m.doc)}
                sx={{
                  fontSize: 11,
                  lineHeight: 1.5,
                  fontFamily: 'monospace',
                  textDecoration: m.doc?.deprecated !== undefined ? 'line-through' : 'none',
                  cursor: hasDoc(m.doc) ? 'help' : 'default',
                }}
              >
                {m.category && (
                  <Box
                    component="span"
                    title={m.category}
                    sx={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      bgcolor: categoryColor(m.category),
                      mr: 0.5,
                      verticalAlign: 'middle',
                    }}
                  />
                )}
                {m.text}
                {hasDoc(m.doc) && (
                  <Box component="span" sx={{ ml: 0.5, opacity: 0.5, fontSize: 9 }}>
                    ⓘ
                  </Box>
                )}
              </Typography>
            ))}
          </Box>
        ))
      )}
    </Box>
  );
}

function UmlClassNode({ data, selected }: NodeProps<UmlFlowNode>) {
  const meta = KIND_META[data.kind];
  const italic = data.kind === 'abstract' || data.kind === 'interface';
  const filter = useContext(CategoryFilterContext);
  const visible = (ms: UmlMember[]) => (filter ? ms.filter((m) => m.category === filter) : ms);
  const fields = visible(data.members.filter((m) => m.kind === 'field'));
  const methods = visible(data.members.filter((m) => m.kind === 'method'));
  return (
    <Box
      sx={{
        minWidth: 160,
        bgcolor: 'background.paper',
        border: '2px solid',
        borderColor: selected ? meta.color : 'divider',
        borderRadius: 1,
        boxShadow: selected ? `0 0 0 2px ${meta.color}55` : 1,
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <Handles />
      <Box
        sx={{
          px: 1,
          py: 0.5,
          textAlign: 'center',
          position: 'relative',
          bgcolor: `${meta.color}14`,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {data.linkedFile && (
          <Tooltip title={`File: ${data.linkedFile}`}>
            <LinkIcon
              sx={{ position: 'absolute', top: 3, right: 3, fontSize: 13, color: meta.color }}
            />
          </Tooltip>
        )}
        {meta.stereotype && (
          <Typography
            sx={{ fontSize: 10, fontStyle: 'italic', color: meta.color, lineHeight: 1.2 }}
          >
            {meta.stereotype}
          </Typography>
        )}
        <Typography
          title={docTooltip(data.doc)}
          sx={{
            fontWeight: 700,
            fontStyle: italic ? 'italic' : 'normal',
            color: meta.color,
            lineHeight: 1.3,
            cursor: hasDoc(data.doc) ? 'help' : 'default',
          }}
        >
          {data.name || 'Unnamed'}
          {hasDoc(data.doc) && (
            <Box component="span" sx={{ ml: 0.5, opacity: 0.55, fontSize: 10 }}>
              ⓘ
            </Box>
          )}
        </Typography>
      </Box>
      <MemberLines members={fields} />
      <MemberLines members={methods} />
    </Box>
  );
}

function UmlEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<UmlFlowEdge>) {
  const relType = (data?.relType ?? 'association') as RelType;
  const rel = REL_META[relType];
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={rel.markerStart}
        markerEnd={rel.markerEnd}
        style={{
          stroke: selected ? '#1976d2' : '#607d8b',
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: rel.dashed ? '6 4' : undefined,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 11,
              background: 'rgba(255,255,255,0.85)',
              padding: '0 4px',
              borderRadius: 3,
              pointerEvents: 'none',
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const NODE_TYPES = { umlClass: UmlClassNode };
export const EDGE_TYPES = { uml: UmlEdgeView };

/** The UML arrowheads, referenced by `REL_META` as `url(#uml-…)`. Rendered once per editor. */
export function UmlMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
      <defs>
        <marker
          id="uml-triangle"
          markerWidth="22"
          markerHeight="22"
          refX="15"
          refY="7"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M1,1 L15,7 L1,13 Z" fill="#fff" stroke="#607d8b" strokeWidth="1.5" />
        </marker>
        <marker
          id="uml-arrow-open"
          markerWidth="20"
          markerHeight="20"
          refX="11"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M1,1 L11,6 L1,11" fill="none" stroke="#607d8b" strokeWidth="1.5" />
        </marker>
        <marker
          id="uml-diamond-filled"
          markerWidth="26"
          markerHeight="18"
          refX="2"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M2,6 L11,1 L20,6 L11,11 Z" fill="#607d8b" stroke="#607d8b" strokeWidth="1" />
        </marker>
        <marker
          id="uml-diamond-hollow"
          markerWidth="26"
          markerHeight="18"
          refX="2"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M2,6 L11,1 L20,6 L11,11 Z" fill="#fff" stroke="#607d8b" strokeWidth="1.5" />
        </marker>
      </defs>
    </svg>
  );
}

// ── Diff view ────────────────────────────────────────────────────────────────

function DiffNode({ data }: NodeProps<DiffFlowNode>) {
  const meta = KIND_META[data.kind];
  const border = data.status === 'unchanged' ? 'divider' : DIFF_COLOR[data.status];
  const fields = data.members.filter((m) => m.kind === 'field');
  const methods = data.members.filter((m) => m.kind === 'method');
  const lineSx = (s: DiffStatus) =>
    s === 'unchanged'
      ? {}
      : {
          bgcolor: `${DIFF_COLOR[s]}22`,
          color: DIFF_COLOR[s],
          textDecoration: s === 'removed' ? 'line-through' : undefined,
        };
  const renderMembers = (ms: DiffMember[]) => (
    <Box sx={{ px: 1, py: 0.5, minHeight: 18, borderBottom: '1px solid', borderColor: 'divider' }}>
      {ms.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>&nbsp;</Typography>
      ) : (
        ms.map((m) => (
          <Tooltip
            key={m.id}
            title={m.status === 'modified' && m.oldText ? `was: ${m.oldText}` : ''}
            disableHoverListener={m.status !== 'modified'}
          >
            <Typography
              sx={{
                fontSize: 11,
                lineHeight: 1.5,
                fontFamily: 'monospace',
                px: 0.5,
                borderRadius: 0.5,
                ...lineSx(m.status),
              }}
            >
              {m.text}
            </Typography>
          </Tooltip>
        ))
      )}
    </Box>
  );
  return (
    <Box
      sx={{
        minWidth: 160,
        bgcolor: 'background.paper',
        border: '2px solid',
        borderColor: border,
        borderRadius: 1,
        fontSize: 12,
        overflow: 'hidden',
        opacity: data.status === 'removed' ? 0.7 : 1,
      }}
    >
      <Handles />
      <Box
        sx={{
          px: 1,
          py: 0.5,
          textAlign: 'center',
          bgcolor: data.status === 'unchanged' ? `${meta.color}14` : `${DIFF_COLOR[data.status]}22`,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {meta.stereotype && (
          <Typography
            sx={{ fontSize: 10, fontStyle: 'italic', color: meta.color, lineHeight: 1.2 }}
          >
            {meta.stereotype}
          </Typography>
        )}
        <Typography
          sx={{
            fontWeight: 700,
            color: data.status === 'unchanged' ? meta.color : DIFF_COLOR[data.status],
            lineHeight: 1.3,
          }}
        >
          {data.oldName && (
            <Box
              component="span"
              sx={{ textDecoration: 'line-through', opacity: 0.6, mr: 0.5, fontWeight: 400 }}
            >
              {data.oldName}
            </Box>
          )}
          {data.name || 'Unnamed'}
        </Typography>
      </Box>
      {renderMembers(fields)}
      {renderMembers(methods)}
    </Box>
  );
}

function DiffEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<DiffFlowEdge>) {
  const status = (data?.status ?? 'unchanged') as DiffStatus;
  const rel = REL_META[(data?.relType ?? 'association') as RelType];
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  const stroke = status === 'unchanged' ? '#90a4ae' : DIFF_COLOR[status];
  return (
    <BaseEdge
      id={id}
      path={path}
      markerStart={rel.markerStart}
      markerEnd={rel.markerEnd}
      style={{
        stroke,
        strokeWidth: status === 'unchanged' ? 1.5 : 2.2,
        strokeDasharray: status === 'removed' || rel.dashed ? '6 4' : undefined,
      }}
    />
  );
}

export const DIFF_NODE_TYPES = { diff: DiffNode };
export const DIFF_EDGE_TYPES = { diffEdge: DiffEdgeView };
