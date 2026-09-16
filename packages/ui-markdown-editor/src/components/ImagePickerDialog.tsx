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
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useEditorFileTree, type EditorDir as DirData } from '../capabilities';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];

interface ImagePickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string, imagePath: string) => void;
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
}

const DirTreeItem: React.FC<DirTreeItemProps> = ({
  dir,
  level,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggleExpand,
  filter,
}) => {
  const hasSubdirs = dir.getDirs().length > 0;
  const isExpanded = expandedPaths.has(dir.getPath());
  const isSelected = selectedPath === dir.getPath();

  // Count images in this directory
  const imageCount = useMemo(() => {
    return dir.getFiles().filter((f) => IMAGE_EXTENSIONS.includes(f.getExt().toLowerCase())).length;
  }, [dir]);

  // Check if matches filter
  const matchesFilter = useMemo(() => {
    if (!filter) return true;
    const lowerFilter = filter.toLowerCase();
    if (dir.getName().toLowerCase().includes(lowerFilter)) return true;
    // Check if any image in this dir matches
    if (
      dir
        .getFiles()
        .some(
          (f) =>
            IMAGE_EXTENSIONS.includes(f.getExt().toLowerCase()) &&
            f.getName().toLowerCase().includes(lowerFilter)
        )
    )
      return true;
    return false;
  }, [dir, filter]);

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
        <ListItemText primary={dir.getName()} primaryTypographyProps={{ noWrap: true }} />
        {imageCount > 0 && (
          <Chip
            label={imageCount}
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
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

const ImagePickerDialog: React.FC<ImagePickerDialogProps> = ({
  open,
  onClose,
  onSelect,
  currentPath,
}) => {
  const tree = useEditorFileTree();
  const rootDir = tree?.rootDir ?? null;
  const isDataLoaded = tree?.isLoaded ?? false;
  const HTTP_BASE_URL = tree?.baseUrl ?? '';
  const [selectedDirPath, setSelectedDirPath] = useState<string>('');
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'grid'>('grid');
  const [currentDirPath, setCurrentDirPath] = useState<string>('');

  // Public directory path - only files from here are served
  const PUBLIC_DIR = 'data/public';

  // Get public directory
  const publicDir = useMemo(() => {
    if (!rootDir) return null;
    return rootDir.getSubDir(['data', 'public']) || null;
  }, [rootDir]);

  // Initialize with current path or public dir
  useEffect(() => {
    if (open && publicDir) {
      if (currentPath && currentPath.startsWith(PUBLIC_DIR)) {
        // Extract directory from current image path
        const pathParts = currentPath.split('/');
        pathParts.pop(); // Remove filename
        const dirPath = pathParts.join('/');
        setCurrentDirPath(dirPath || PUBLIC_DIR);
        setSelectedDirPath(dirPath || PUBLIC_DIR);
        // Expand parent directories
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
      setSelectedImagePath(null);
      setFilter('');
    }
  }, [open, publicDir, currentPath]);

  const currentDir = useMemo(() => {
    if (!rootDir || !publicDir) return null;
    if (!currentDirPath || currentDirPath === PUBLIC_DIR) return publicDir;

    const pathParts = currentDirPath.split('/').filter(Boolean);
    return rootDir.getSubDir(pathParts) || publicDir;
  }, [rootDir, publicDir, currentDirPath]);

  const images = useMemo(() => {
    if (!currentDir) return [];
    return currentDir.getFiles().filter((f) => IMAGE_EXTENSIONS.includes(f.getExt().toLowerCase()));
  }, [currentDir]);

  const filteredImages = useMemo(() => {
    if (!filter) return images;
    const lowerFilter = filter.toLowerCase();
    return images.filter((img) => img.getName().toLowerCase().includes(lowerFilter));
  }, [images, filter]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
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
    setSelectedImagePath(null);
    // Auto-expand selected directory
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  };

  const handleImageSelect = (imagePath: string) => {
    setSelectedImagePath(imagePath);
  };

  const handleConfirm = () => {
    if (selectedImagePath) {
      const imageUrl = `${HTTP_BASE_URL}/files/${selectedImagePath}`;
      onSelect(imageUrl, selectedImagePath);
      onClose();
    }
  };

  const handleNavigateUp = () => {
    if (!currentDirPath || currentDirPath === PUBLIC_DIR) return;
    const pathParts = currentDirPath.split('/').filter(Boolean);
    pathParts.pop();
    const newPath = pathParts.join('/');
    // Don't go above public dir
    if (newPath.startsWith('data/public') || newPath === 'data') {
      setCurrentDirPath(newPath.startsWith('data/public') ? newPath : PUBLIC_DIR);
    }
    setSelectedImagePath(null);
  };

  const handleSubdirClick = (dir: DirData) => {
    setCurrentDirPath(dir.getPath());
    setSelectedImagePath(null);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      next.add(dir.getPath());
      return next;
    });
  };

  // Get path parts relative to public dir for breadcrumbs
  const pathParts = useMemo(() => {
    if (!currentDirPath) return [];
    const parts = currentDirPath.split('/').filter(Boolean);
    // Skip 'data' and 'public' from display
    return parts.slice(2);
  }, [currentDirPath]);

  if (!isDataLoaded || !rootDir || !publicDir) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogContent
          sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}
        >
          {!publicDir && isDataLoaded ? (
            <Typography color="text.secondary">
              Folder data/public nie istnieje. Utwórz go aby przechowywać obrazki.
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
        <ImageIcon color="primary" />
        <Typography variant="h6" component="span">
          Select image from files
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs value={viewMode} onChange={(_, v) => setViewMode(v)} sx={{ minHeight: 40 }}>
          <Tab label="Przeglądaj" value="grid" sx={{ minHeight: 40 }} />
          <Tab label="Drzewo folderów" value="tree" sx={{ minHeight: 40 }} />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 400 }}>
        {/* Search */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Szukaj obrazków..."
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
            <Box
              sx={{
                px: 2,
                py: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
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
                      // Build path from data/public + parts up to index
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
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 1, display: 'block' }}
                  >
                    Foldery
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {currentDir.getDirs().map((subdir) => {
                      const imgCount = subdir
                        .getFiles()
                        .filter((f) => IMAGE_EXTENSIONS.includes(f.getExt().toLowerCase())).length;
                      return (
                        <Chip
                          key={subdir.getPath()}
                          icon={<FolderIcon />}
                          label={`${subdir.getName()}${imgCount > 0 ? ` (${imgCount})` : ''}`}
                          onClick={() => handleSubdirClick(subdir)}
                          variant="outlined"
                          sx={{ cursor: 'pointer' }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}

              {/* Images grid */}
              {filteredImages.length > 0 ? (
                <>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 1, display: 'block' }}
                  >
                    Obrazki ({filteredImages.length})
                  </Typography>
                  <ImageList cols={4} gap={8}>
                    {filteredImages.map((image) => {
                      const isSelected = selectedImagePath === image.getPath();
                      const imageUrl = `${HTTP_BASE_URL}/files/${image.getPath()}`;
                      return (
                        <ImageListItem
                          key={image.getPath()}
                          onClick={() => handleImageSelect(image.getPath())}
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
                          <img
                            src={imageUrl}
                            alt={image.getName()}
                            loading="lazy"
                            style={{
                              width: '100%',
                              height: 100,
                              objectFit: 'cover',
                            }}
                          />
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
                            }}
                          >
                            <Typography variant="caption" noWrap>
                              {image.getName()}
                            </Typography>
                          </Box>
                        </ImageListItem>
                      );
                    })}
                  </ImageList>
                </>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <ImageIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                  <Typography color="text.secondary">
                    {filter ? 'No images found' : 'No images in this folder'}
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
                />
              </List>
            </Box>

            {/* Image list */}
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
              {filteredImages.length > 0 ? (
                <ImageList cols={3} gap={8}>
                  {filteredImages.map((image) => {
                    const isSelected = selectedImagePath === image.getPath();
                    const imageUrl = `${HTTP_BASE_URL}/files/${image.getPath()}`;
                    return (
                      <ImageListItem
                        key={image.getPath()}
                        onClick={() => handleImageSelect(image.getPath())}
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
                        <img
                          src={imageUrl}
                          alt={image.getName()}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: 100,
                            objectFit: 'cover',
                          }}
                        />
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
                          }}
                        >
                          <Typography variant="caption" noWrap>
                            {image.getName()}
                          </Typography>
                        </Box>
                      </ImageListItem>
                    );
                  })}
                </ImageList>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <ImageIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                  <Typography color="text.secondary">
                    {filter ? 'No images found' : 'Select a folder with images'}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        {selectedImagePath && (
          <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
            Wybrany: {selectedImagePath}
          </Typography>
        )}
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!selectedImagePath}>
          Select
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImagePickerDialog;
