import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  TextField,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Collapse,
  CircularProgress,
  ImageList,
  ImageListItem,
  Tabs,
  Tab,
  Breadcrumbs,
  Link,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ImageIcon from '@mui/icons-material/Image';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import VideocamIcon from '@mui/icons-material/Videocam';
import PermMediaIcon from '@mui/icons-material/PermMedia';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import {
  useEditorFileTree, useEditorSession,
  type EditorDir as DirData, type EditorFile as FileData,
} from '../capabilities';

export type MediaType = 'image' | 'audio' | 'video' | 'all';

const MEDIA_EXTENSIONS: Record<MediaType, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'],
  audio: ['mp3', 'wav', 'ogg', 'webm', 'aac', 'm4a', 'flac'],
  video: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'],
  all: [],
};

// Combine all extensions for 'all' type
MEDIA_EXTENSIONS.all = [
  ...MEDIA_EXTENSIONS.image,
  ...MEDIA_EXTENSIONS.audio,
  ...MEDIA_EXTENSIONS.video,
];


interface MediaPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (mediaUrl: string, mediaPath: string, mediaType: MediaType) => void;
  initialMediaType?: MediaType;
  currentPath?: string;
}

interface DirTreeItemProps {
  dir: DirData;
  level: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggleExpand: (path: string) => void;
  filter: string;
  mediaType: MediaType;
}

const getFileMediaType = (ext: string): MediaType => {
  const lowerExt = ext.toLowerCase();
  if (MEDIA_EXTENSIONS.image.includes(lowerExt)) return 'image';
  if (MEDIA_EXTENSIONS.audio.includes(lowerExt)) return 'audio';
  if (MEDIA_EXTENSIONS.video.includes(lowerExt)) return 'video';
  return 'all';
};

const getMediaIcon = (type: MediaType) => {
  switch (type) {
    case 'image': return <ImageIcon />;
    case 'audio': return <AudiotrackIcon />;
    case 'video': return <VideocamIcon />;
    default: return <PermMediaIcon />;
  }
};

const DirTreeItem: React.FC<DirTreeItemProps> = ({
  dir,
  level,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggleExpand,
  filter,
  mediaType,
}) => {
  const hasSubdirs = dir.getDirs().length > 0;
  const isExpanded = expandedPaths.has(dir.getPath());
  const isSelected = selectedPath === dir.getPath();

  const extensions = MEDIA_EXTENSIONS[mediaType];
  const mediaCount = useMemo(() => {
    return dir.getFiles().filter(f => extensions.includes(f.getExt().toLowerCase())).length;
  }, [dir, extensions]);

  const matchesFilter = useMemo(() => {
    if (!filter) return true;
    const lowerFilter = filter.toLowerCase();
    if (dir.getName().toLowerCase().includes(lowerFilter)) return true;
    if (dir.getFiles().some(f =>
      extensions.includes(f.getExt().toLowerCase()) &&
      f.getName().toLowerCase().includes(lowerFilter)
    )) return true;
    return false;
  }, [dir, filter, extensions]);

  if (!matchesFilter && !isExpanded) return null;

  return (
    <>
      <ListItemButton
        selected={isSelected}
        onClick={() => onSelect(dir.getPath())}
        sx={{ pl: 1 + level * 1.5, py: 0.5 }}
      >
        {hasSubdirs && (
          <Box
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(dir.getPath());
            }}
            sx={{ mr: 0.5, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </Box>
        )}
        <ListItemIcon sx={{ minWidth: 32 }}>
          {isExpanded ? (
            <FolderOpenIcon color={isSelected ? 'primary' : 'action'} />
          ) : (
            <FolderIcon color={isSelected ? 'primary' : 'action'} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={dir.getName()}
          primaryTypographyProps={{ noWrap: true }}
        />
        {mediaCount > 0 && (
          <Chip
            label={mediaCount}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.75rem' }}
          />
        )}
      </ListItemButton>

      {hasSubdirs && (
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding dense>
            {dir.getDirs().map((subdir) => (
              <DirTreeItem
                key={subdir.getPath()}
                dir={subdir}
                level={level + 1}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                filter={filter}
                mediaType={mediaType}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

/**
 * Buduje URL HTTP pliku media. Per-user: plik leży w VFS pod
 * `data/Minis/Users/{u}/drive/public/files/...` i jest serwowany przez trasę
 * `/public/drive/users/{u}/...` (mapuje `drive/public/...`). Fallback do
 * globalnego `/files/...` gdy brak usera.
 */
function buildMediaUrl(vfsPath: string, userName: string, baseUrl: string): string {
  if (userName) {
    const prefix = `data/Minis/Users/${userName}/drive/public/`;
    const rel = vfsPath.startsWith(prefix) ? vfsPath.slice(prefix.length) : vfsPath;
    return `${baseUrl}/public/drive/users/${encodeURIComponent(userName)}/${rel}`;
  }
  return `${baseUrl}/files/${vfsPath}`;
}

// Media item preview component
interface MediaItemPreviewProps {
  file: FileData;
  isSelected: boolean;
  onClick: () => void;
  userName: string;
  /** The host's file base URL; it used to be a module-level constant. */
  baseUrl: string;
}

const MediaItemPreview: React.FC<MediaItemPreviewProps> = ({ file, isSelected, onClick, userName, baseUrl }) => {
  const fileType = getFileMediaType(file.getExt());
  const mediaUrl = buildMediaUrl(file.getPath(), userName, baseUrl);

  return (
    <ImageListItem
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        border: isSelected ? '3px solid' : '1px solid',
        borderColor: isSelected ? 'primary.main' : 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'relative',
        '&:hover': {
          borderColor: 'primary.light',
        },
      }}
    >
      {fileType === 'image' && (
        <img
          src={mediaUrl}
          alt={file.getName()}
          loading="lazy"
          style={{
            width: '100%',
            height: 100,
            objectFit: 'cover',
          }}
        />
      )}

      {fileType === 'audio' && (
        <Box
          sx={{
            width: '100%',
            height: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'grey.100',
          }}
        >
          <AudiotrackIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <audio
            src={mediaUrl}
            style={{ width: '90%', height: 30, marginTop: 8 }}
            controls
            onClick={(e) => e.stopPropagation()}
          />
        </Box>
      )}

      {fileType === 'video' && (
        <Box
          sx={{
            width: '100%',
            height: 100,
            position: 'relative',
            bgcolor: 'grey.900',
          }}
        >
          <video
            src={mediaUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            muted
            preload="metadata"
          />
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              bgcolor: 'rgba(0,0,0,0.5)',
              borderRadius: '50%',
              p: 0.5,
            }}
          >
            <PlayArrowIcon sx={{ color: 'white', fontSize: 24 }} />
          </Box>
        </Box>
      )}

      {isSelected && (
        <CheckCircleIcon
          color="primary"
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            bgcolor: 'white',
            borderRadius: '50%',
          }}
        />
      )}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: 'rgba(0,0,0,0.6)',
          color: 'white',
          px: 0.5,
          py: 0.25,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {getMediaIcon(fileType)}
        <Typography variant="caption" noWrap sx={{ flexGrow: 1 }}>
          {file.getName()}
        </Typography>
      </Box>
    </ImageListItem>
  );
};

const MediaPickerDialog: React.FC<MediaPickerDialogProps> = ({
  open,
  onClose,
  onSelect,
  initialMediaType = 'all',
  currentPath,
}) => {
  const tree = useEditorFileTree();
  const rootDir = tree?.rootDir ?? null;
  const isDataLoaded = tree?.isLoaded ?? false;
  const session = useEditorSession();
  const currentUser = session?.userName ? { name: session.userName } : null;
  const baseUrl = tree?.baseUrl ?? '';
  const userName = currentUser?.name ?? '';
  const [selectedDirPath, setSelectedDirPath] = useState<string>('');
  const [selectedMediaPath, setSelectedMediaPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'grid'>('grid');
  const [currentDirPath, setCurrentDirPath] = useState<string>('');
  const [mediaType, setMediaType] = useState<MediaType>(initialMediaType);

  // Katalog media per-user: `data/Minis/Users/{u}/drive/public/files` (backend tworzy go przy starcie).
  const PUBLIC_PARTS = useMemo(
    () => (userName ? ['data', 'Minis', 'Users', userName, 'drive', 'public', 'files'] : ['data', 'public']),
    [userName],
  );
  const PUBLIC_DIR = PUBLIC_PARTS.join('/');

  const publicDir = useMemo(() => {
    if (!rootDir) return null;
    return rootDir.getSubDir(PUBLIC_PARTS) || null;
  }, [rootDir, PUBLIC_PARTS]);

  useEffect(() => {
    if (open && publicDir) {
      setMediaType(initialMediaType);
      if (currentPath && currentPath.startsWith(PUBLIC_DIR)) {
        const pathParts = currentPath.split('/');
        pathParts.pop();
        const dirPath = pathParts.join('/');
        setCurrentDirPath(dirPath || PUBLIC_DIR);
        setSelectedDirPath(dirPath || PUBLIC_DIR);
        const toExpand = new Set<string>();
        let path = '';
        for (const part of pathParts) {
          path = path ? `${path}/${part}` : part;
          toExpand.add(path);
        }
        setExpandedPaths(toExpand);
      } else {
        setCurrentDirPath(PUBLIC_DIR);
        setSelectedDirPath(PUBLIC_DIR);
        setExpandedPaths(new Set([PUBLIC_DIR]));
      }
      setSelectedMediaPath(null);
      setFilter('');
    }
  }, [open, publicDir, currentPath, initialMediaType]);

  const currentDir = useMemo(() => {
    if (!rootDir || !publicDir) return null;
    if (!currentDirPath || currentDirPath === PUBLIC_DIR) return publicDir;

    const pathParts = currentDirPath.split('/').filter(Boolean);
    return rootDir.getSubDir(pathParts) || publicDir;
  }, [rootDir, publicDir, currentDirPath]);

  const extensions = MEDIA_EXTENSIONS[mediaType];

  const mediaFiles = useMemo(() => {
    if (!currentDir) return [];
    return currentDir.getFiles().filter(f =>
      extensions.includes(f.getExt().toLowerCase())
    );
  }, [currentDir, extensions]);

  const filteredMedia = useMemo(() => {
    if (!filter) return mediaFiles;
    const lowerFilter = filter.toLowerCase();
    return mediaFiles.filter(f => f.getName().toLowerCase().includes(lowerFilter));
  }, [mediaFiles, filter]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleDirSelect = (path: string) => {
    setSelectedDirPath(path);
    setCurrentDirPath(path);
    setSelectedMediaPath(null);
    setExpandedPaths(prev => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  };

  const handleMediaSelect = (mediaPath: string) => {
    setSelectedMediaPath(mediaPath);
  };

  const handleConfirm = () => {
    if (selectedMediaPath) {
      const mediaUrl = buildMediaUrl(selectedMediaPath, userName, baseUrl);
      const fileExt = selectedMediaPath.split('.').pop() || '';
      const detectedType = getFileMediaType(fileExt);
      onSelect(mediaUrl, selectedMediaPath, detectedType);
      onClose();
    }
  };

  const handleNavigateUp = () => {
    if (!currentDirPath || currentDirPath === PUBLIC_DIR) return;
    const pathParts = currentDirPath.split('/').filter(Boolean);
    pathParts.pop();
    const newPath = pathParts.join('/');
    // Nie wychodź powyżej katalogu media użytkownika.
    setCurrentDirPath(newPath.startsWith(PUBLIC_DIR) ? newPath : PUBLIC_DIR);
    setSelectedMediaPath(null);
  };

  const handleSubdirClick = (dir: DirData) => {
    setCurrentDirPath(dir.getPath());
    setSelectedMediaPath(null);
    setExpandedPaths(prev => {
      const next = new Set(prev);
      next.add(dir.getPath());
      return next;
    });
  };

  const pathParts = useMemo(() => {
    if (!currentDirPath) return [];
    const parts = currentDirPath.split('/').filter(Boolean);
    return parts.slice(2);
  }, [currentDirPath]);

  const getMediaTypeLabel = (type: MediaType) => {
    switch (type) {
      case 'image': return 'Obrazy';
      case 'audio': return 'Audio';
      case 'video': return 'Video';
      default: return 'Wszystkie';
    }
  };

  if (!isDataLoaded || !rootDir || !publicDir) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
          {!publicDir && isDataLoaded ? (
            <Typography color="text.secondary">
              Folder media użytkownika nie istnieje ({PUBLIC_DIR}). Zostanie utworzony przy starcie backendu — odśwież po restarcie.
            </Typography>
          ) : (
            <CircularProgress />
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <PermMediaIcon color="primary" />
        <Typography variant="h6" component="span">
          Select media
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* Media type tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs
          value={mediaType}
          onChange={(_, v) => {
            setMediaType(v);
            setSelectedMediaPath(null);
          }}
          sx={{ minHeight: 40 }}
        >
          <Tab
            icon={<PermMediaIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Wszystkie"
            value="all"
            sx={{ minHeight: 40 }}
          />
          <Tab
            icon={<ImageIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Obrazy"
            value="image"
            sx={{ minHeight: 40 }}
          />
          <Tab
            icon={<AudiotrackIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Audio"
            value="audio"
            sx={{ minHeight: 40 }}
          />
          <Tab
            icon={<VideocamIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Video"
            value="video"
            sx={{ minHeight: 40 }}
          />
        </Tabs>
      </Box>

      {/* View mode tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs
          value={viewMode}
          onChange={(_, v) => setViewMode(v)}
          sx={{ minHeight: 36 }}
        >
          <Tab label="Przeglądaj" value="grid" sx={{ minHeight: 36, fontSize: '0.8rem' }} />
          <Tab label="Drzewo folderów" value="tree" sx={{ minHeight: 36, fontSize: '0.8rem' }} />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 400 }}>
        {/* Search */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            placeholder={`Szukaj ${getMediaTypeLabel(mediaType).toLowerCase()}...`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {viewMode === 'grid' && (
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Breadcrumbs navigation */}
            <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
              <IconButton
                size="small"
                onClick={handleNavigateUp}
                disabled={currentDirPath === PUBLIC_DIR}
              >
                <ArrowBackIcon fontSize="small" />
              </IconButton>
              <Breadcrumbs sx={{ flexGrow: 1 }}>
                <Link
                  component="button"
                  variant="body2"
                  underline="hover"
                  onClick={() => setCurrentDirPath(PUBLIC_DIR)}
                  sx={{ cursor: 'pointer' }}
                >
                  Public
                </Link>
                {pathParts.map((part, index) => (
                  <Link
                    key={index}
                    component="button"
                    variant="body2"
                    underline="hover"
                    onClick={() => {
                      const newPath = PUBLIC_DIR + '/' + pathParts.slice(0, index + 1).join('/');
                      setCurrentDirPath(newPath);
                    }}
                    sx={{ cursor: 'pointer' }}
                  >
                    {part}
                  </Link>
                ))}
              </Breadcrumbs>
            </Box>

            {/* Grid content */}
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
              {/* Subdirectories */}
              {currentDir && currentDir.getDirs().length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Foldery
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {currentDir.getDirs().map((subdir) => {
                      const mediaCount = subdir.getFiles().filter(f =>
                        extensions.includes(f.getExt().toLowerCase())
                      ).length;
                      return (
                        <Chip
                          key={subdir.getPath()}
                          icon={<FolderIcon />}
                          label={`${subdir.getName()}${mediaCount > 0 ? ` (${mediaCount})` : ''}`}
                          onClick={() => handleSubdirClick(subdir)}
                          variant="outlined"
                          sx={{ cursor: 'pointer' }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}

              {/* Media grid */}
              {filteredMedia.length > 0 ? (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    {getMediaTypeLabel(mediaType)} ({filteredMedia.length})
                  </Typography>
                  <ImageList cols={4} gap={8}>
                    {filteredMedia.map((file) => (
                      <MediaItemPreview
                        key={file.getPath()}
                        file={file}
                        isSelected={selectedMediaPath === file.getPath()}
                        onClick={() => handleMediaSelect(file.getPath())}
                        userName={userName}
                        baseUrl={baseUrl}
                      />
                    ))}
                  </ImageList>
                </>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  {getMediaIcon(mediaType)}
                  <Typography color="text.secondary">
                    {filter ? 'No media found' : `Brak ${getMediaTypeLabel(mediaType).toLowerCase()} w tym folderze`}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {viewMode === 'tree' && publicDir && (
          <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
            {/* Directory tree */}
            <Box sx={{ width: 250, borderRight: 1, borderColor: 'divider', overflow: 'auto' }}>
              <List dense>
                <DirTreeItem
                  dir={publicDir}
                  level={0}
                  selectedPath={selectedDirPath}
                  expandedPaths={expandedPaths}
                  onSelect={handleDirSelect}
                  onToggleExpand={handleToggleExpand}
                  filter={filter}
                  mediaType={mediaType}
                />
              </List>
            </Box>

            {/* Media list */}
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
              {filteredMedia.length > 0 ? (
                <ImageList cols={3} gap={8}>
                  {filteredMedia.map((file) => (
                    <MediaItemPreview
                      key={file.getPath()}
                      file={file}
                      isSelected={selectedMediaPath === file.getPath()}
                      onClick={() => handleMediaSelect(file.getPath())}
                      userName={userName}
                      baseUrl={baseUrl}
                    />
                  ))}
                </ImageList>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  {getMediaIcon(mediaType)}
                  <Typography color="text.secondary">
                    {filter ? 'No media found' : 'Select a folder with media'}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        {selectedMediaPath && (
          <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
            Wybrano: {selectedMediaPath.split('/').pop()}
          </Typography>
        )}
        <Button onClick={onClose}>Anuluj</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!selectedMediaPath}
        >
          Select
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MediaPickerDialog;
export { getFileMediaType, getMediaIcon, MEDIA_EXTENSIONS };
