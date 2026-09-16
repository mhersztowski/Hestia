import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import React, { useState, useMemo, useCallback } from 'react';
import {
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  TextField,
  InputAdornment,
  Box,
  Skeleton,
  Collapse,
  Typography,
  Tooltip,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { ProjectNode } from '@hestia/core';
import { useEditorProjectData, type EditorProjectData as DataSource } from '../capabilities';

export type ComponentType = 'person' | 'task' | 'project';

// Helper to collect all project IDs
const collectAllProjectIds = (projects: ProjectNode[]): string[] => {
  const ids: string[] = [];
  for (const project of projects) {
    ids.push(project.id);
    ids.push(...collectAllProjectIds(project.children));
  }
  return ids;
};

// Project tree item for task picker
interface ProjectTreeItemProps {
  project: ProjectNode;
  level: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  filter: string;
  dataSource: DataSource;
}

const ProjectTreeItem: React.FC<ProjectTreeItemProps> = ({
  project,
  level,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpand,
  filter,
  dataSource,
}) => {
  const projectTasks = useMemo(() => {
    return dataSource.getTasksByProjectId(project.id);
  }, [dataSource, project.id]);

  const filteredTasks = useMemo(() => {
    return filter ? projectTasks.filter((t) => t.matches(filter)) : projectTasks;
  }, [projectTasks, filter]);

  const hasContent = projectTasks.length > 0 || project.hasChildren();
  const isExpanded = expandedIds.has(project.id);

  const matchesFilter = useMemo(() => {
    if (!filter) return true;
    if (project.matches(filter)) return true;
    if (filteredTasks.length > 0) return true;
    for (const child of project.children) {
      const childTasks = dataSource.getTasksByProjectId(child.id);
      if (child.matches(filter) || childTasks.some((t) => t.matches(filter))) {
        return true;
      }
    }
    return false;
  }, [project, filter, filteredTasks, dataSource]);

  if (!matchesFilter) return null;

  return (
    <>
      <ListItemButton
        onClick={() => hasContent && onToggleExpand(project.id)}
        sx={{ pl: 1 + level * 1.5, py: 0.25, bgcolor: 'grey.50', minHeight: 32 }}
      >
        {hasContent && (
          <Box sx={{ mr: 0.25, display: 'flex', alignItems: 'center' }}>
            {isExpanded ? (
              <ExpandLess sx={{ fontSize: 16 }} />
            ) : (
              <ExpandMore sx={{ fontSize: 16 }} />
            )}
          </Box>
        )}
        <ListItemIcon sx={{ minWidth: 24 }}>
          {isExpanded ? (
            <FolderOpenIcon sx={{ fontSize: 18 }} color="success" />
          ) : (
            <FolderIcon sx={{ fontSize: 18 }} color="success" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={project.getDisplayName()}
          primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 500 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {projectTasks.length}
        </Typography>
      </ListItemButton>

      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <List component="div" disablePadding dense>
          {filteredTasks.map((task) => (
            <ListItemButton
              key={task.id}
              selected={selectedId === task.id}
              onClick={() => onSelect(task.id)}
              sx={{ pl: 2.5 + level * 1.5, py: 0.25, minHeight: 28 }}
            >
              <ListItemIcon sx={{ minWidth: 24 }}>
                <TaskIcon
                  sx={{ fontSize: 16 }}
                  color={selectedId === task.id ? 'secondary' : 'action'}
                />
              </ListItemIcon>
              <ListItemText
                primary={task.getDisplayName()}
                primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
              />
            </ListItemButton>
          ))}

          {project.children.map((child) => (
            <ProjectTreeItem
              key={child.id}
              project={child}
              level={level + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              filter={filter}
              dataSource={dataSource}
            />
          ))}
        </List>
      </Collapse>
    </>
  );
};

// Project tree item for project picker
interface ProjectPickerTreeItemProps {
  project: ProjectNode;
  level: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  filter: string;
}

const ProjectPickerTreeItem: React.FC<ProjectPickerTreeItemProps> = ({
  project,
  level,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpand,
  filter,
}) => {
  const hasChildren = project.hasChildren();
  const isExpanded = expandedIds.has(project.id);
  const isSelected = selectedId === project.id;

  if (filter && !project.matchesDeep(filter)) return null;

  return (
    <>
      <ListItemButton
        selected={isSelected}
        onClick={() => onSelect(project.id)}
        sx={{ pl: 1 + level * 1.5, py: 0.25, minHeight: 32 }}
      >
        {hasChildren && (
          <Box
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(project.id);
            }}
            sx={{ mr: 0.25, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            {isExpanded ? (
              <ExpandLess sx={{ fontSize: 16 }} />
            ) : (
              <ExpandMore sx={{ fontSize: 16 }} />
            )}
          </Box>
        )}
        <ListItemIcon sx={{ minWidth: 24 }}>
          {hasChildren ? (
            isExpanded ? (
              <FolderOpenIcon sx={{ fontSize: 18 }} color={isSelected ? 'success' : 'action'} />
            ) : (
              <FolderIcon sx={{ fontSize: 18 }} color={isSelected ? 'success' : 'action'} />
            )
          ) : (
            <FolderIcon sx={{ fontSize: 18 }} color={isSelected ? 'success' : 'action'} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={project.getDisplayName()}
          primaryTypographyProps={{ fontSize: '0.85rem', noWrap: true }}
        />
      </ListItemButton>
      {hasChildren && (
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding dense>
            {project.children.map((child) => (
              <ProjectPickerTreeItem
                key={child.id}
                project={child}
                level={level + 1}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                filter={filter}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

// Node View Component
const ComponentEmbedNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const dataSource = useEditorProjectData();
  const isDataLoaded = dataSource?.isLoaded ?? false;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isHovered, setIsHovered] = useState(false);

  const componentType = node.attrs.componentType as ComponentType;
  const componentId = node.attrs.componentId as string;

  const displayData = useMemo(() => {
    if (!dataSource || !isDataLoaded || !componentId) return null;

    switch (componentType) {
      case 'person':
        return dataSource.getPersonById(componentId);
      case 'task':
        return dataSource.getTaskById(componentId);
      case 'project':
        return dataSource.findProjectByIdDeep(componentId);
      default:
        return null;
    }
  }, [dataSource, isDataLoaded, componentType, componentId]);

  const projects = useMemo(() => {
    if (!dataSource || !isDataLoaded) return [];
    return dataSource.projects;
  }, [dataSource, isDataLoaded]);

  const unassignedTasks = useMemo(() => {
    if (!dataSource || !isDataLoaded) return [];
    return dataSource.getUnassignedTasks();
  }, [dataSource, isDataLoaded]);

  const getIcon = () => {
    switch (componentType) {
      case 'person':
        return <PersonIcon />;
      case 'task':
        return <TaskIcon />;
      case 'project':
        return <FolderIcon />;
      default:
        return <HelpOutlineIcon />;
    }
  };

  const getColor = (): 'primary' | 'secondary' | 'success' | 'error' | 'default' => {
    if (!displayData) return 'error';
    switch (componentType) {
      case 'person':
        return 'primary';
      case 'task':
        return 'secondary';
      case 'project':
        return 'success';
      default:
        return 'default';
    }
  };

  const getLabel = () => {
    if (!displayData) return 'Unknown';
    return displayData.getDisplayName();
  };

  const getDialogTitle = () => {
    switch (componentType) {
      case 'person':
        return 'Select Person';
      case 'task':
        return 'Select Task';
      case 'project':
        return 'Select Project';
      default:
        return 'Select';
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setFilter('');
    if (componentType === 'task' || componentType === 'project') {
      setExpandedIds(new Set(['__unassigned__', ...collectAllProjectIds(projects)]));
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSelect = (id: string) => {
    updateAttributes({ componentId: id });
    setOpen(false);
  };

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleFilterChange = (value: string) => {
    setFilter(value);
    if (value && (componentType === 'task' || componentType === 'project')) {
      setExpandedIds(new Set(['__unassigned__', ...collectAllProjectIds(projects)]));
    }
  };

  if (!isDataLoaded) {
    return (
      <NodeViewWrapper as="span" className="component-embed-wrapper">
        <Skeleton variant="rounded" width={80} height={24} sx={{ display: 'inline-block' }} />
      </NodeViewWrapper>
    );
  }

  const filteredPersons =
    componentType === 'person' && dataSource
      ? filter
        ? dataSource.findPersons(filter)
        : dataSource.persons
      : [];

  const filteredUnassignedTasks =
    componentType === 'task'
      ? filter
        ? unassignedTasks.filter((t) => t.matches(filter))
        : unassignedTasks
      : [];

  return (
    <NodeViewWrapper as="span" className="component-embed-wrapper">
      <Tooltip title={`Click to edit ${componentType}`} arrow placement="top">
        <Chip
          icon={getIcon()}
          label={getLabel()}
          size="small"
          variant="outlined"
          color={getColor()}
          onClick={handleOpen}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          sx={{
            cursor: 'pointer',
            verticalAlign: 'middle',
            mx: 0.25,
            border: selected || isHovered ? '2px solid' : '1px solid',
            borderColor: selected ? 'primary.main' : undefined,
            transition: 'all 0.2s ease',
          }}
        />
      </Tooltip>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          {getIcon()}
          {getDialogTitle()}
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <TextField
              fullWidth
              size="small"
              placeholder={`Search ${componentType}s...`}
              value={filter}
              onChange={(e) => handleFilterChange(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              autoFocus
            />
          </Box>

          {/* Person List */}
          {componentType === 'person' && (
            <List sx={{ maxHeight: 300, overflow: 'auto' }}>
              {filteredPersons.map((person) => (
                <ListItemButton
                  key={person.id}
                  selected={person.id === componentId}
                  onClick={() => handleSelect(person.id)}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <PersonIcon color={person.id === componentId ? 'primary' : 'action'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={person.getDisplayName()}
                    secondary={person.nick !== person.getDisplayName() ? person.nick : undefined}
                  />
                </ListItemButton>
              ))}
              {filteredPersons.length === 0 && (
                <ListItemText
                  primary="No persons found"
                  sx={{ px: 2, py: 1, color: 'text.secondary' }}
                />
              )}
            </List>
          )}

          {/* Task List */}
          {componentType === 'task' && (
            <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
              {filteredUnassignedTasks.length > 0 && (
                <>
                  <ListItemButton
                    onClick={() => handleToggleExpand('__unassigned__')}
                    sx={{ bgcolor: 'grey.100', py: 0.25, minHeight: 32 }}
                  >
                    <Box sx={{ mr: 0.25, display: 'flex', alignItems: 'center' }}>
                      {expandedIds.has('__unassigned__') ? (
                        <ExpandLess sx={{ fontSize: 16 }} />
                      ) : (
                        <ExpandMore sx={{ fontSize: 16 }} />
                      )}
                    </Box>
                    <ListItemIcon sx={{ minWidth: 24 }}>
                      <TaskIcon sx={{ fontSize: 18 }} color="action" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Unassigned"
                      primaryTypographyProps={{
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        fontStyle: 'italic',
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {unassignedTasks.length}
                    </Typography>
                  </ListItemButton>
                  <Collapse in={expandedIds.has('__unassigned__')} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding dense>
                      {filteredUnassignedTasks.map((task) => (
                        <ListItemButton
                          key={task.id}
                          selected={componentId === task.id}
                          onClick={() => handleSelect(task.id)}
                          sx={{ pl: 2.5, py: 0.25, minHeight: 28 }}
                        >
                          <ListItemIcon sx={{ minWidth: 24 }}>
                            <TaskIcon
                              sx={{ fontSize: 16 }}
                              color={componentId === task.id ? 'secondary' : 'action'}
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={task.getDisplayName()}
                            primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
                          />
                        </ListItemButton>
                      ))}
                    </List>
                  </Collapse>
                </>
              )}

              {projects.map((project) => (
                <ProjectTreeItem
                  key={project.id}
                  project={project}
                  level={0}
                  selectedId={componentId}
                  expandedIds={expandedIds}
                  onSelect={handleSelect}
                  onToggleExpand={handleToggleExpand}
                  filter={filter}
                  dataSource={dataSource!}
                />
              ))}

              {(dataSource?.tasks.length ?? 0) === 0 && (
                <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
                  No tasks found
                </Typography>
              )}
            </List>
          )}

          {/* Project List */}
          {componentType === 'project' && (
            <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
              {projects.map((project) => (
                <ProjectPickerTreeItem
                  key={project.id}
                  project={project}
                  level={0}
                  selectedId={componentId}
                  expandedIds={expandedIds}
                  onSelect={handleSelect}
                  onToggleExpand={handleToggleExpand}
                  filter={filter}
                />
              ))}
              {projects.length === 0 && (
                <ListItemText
                  primary="No projects found"
                  sx={{ px: 2, py: 1, color: 'text.secondary' }}
                />
              )}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
};

// Tiptap Extension
export const ComponentEmbed = Node.create({
  name: 'componentEmbed',

  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      componentType: {
        default: 'person',
      },
      componentId: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="component-embed"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          return {
            componentType: element.getAttribute('data-component-type') || 'person',
            componentId: element.getAttribute('data-component-id') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'component-embed',
        'data-component-type': node.attrs.componentType,
        'data-component-id': node.attrs.componentId,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ComponentEmbedNodeView);
  },

  addCommands() {
    return {
      insertComponentEmbed:
        (componentType: ComponentType, componentId: string = '') =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { componentType, componentId },
          });
        },
    };
  },
});

// Type declarations for commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    componentEmbed: {
      insertComponentEmbed: (componentType: ComponentType, componentId?: string) => ReturnType;
    };
  }
}
