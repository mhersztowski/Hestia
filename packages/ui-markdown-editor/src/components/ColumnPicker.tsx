import React, { useState } from 'react';
import {
  IconButton,
  Tooltip,
  Popover,
  Box,
  Typography,
  Button,
} from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';

interface ColumnPickerProps {
  onSelect: (columns: 2 | 3) => void;
}

const ColumnPicker: React.FC<ColumnPickerProps> = ({ onSelect }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (columns: 2 | 3) => {
    onSelect(columns);
    handleClose();
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title="Wstaw kolumny">
        <IconButton size="small" onClick={handleClick}>
          <ViewColumnIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Select number of columns
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => handleSelect(2)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 1.5,
                minWidth: 80,
              }}
            >
              <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                <Box
                  sx={{
                    width: 24,
                    height: 32,
                    bgcolor: 'action.selected',
                    borderRadius: 0.5,
                  }}
                />
                <Box
                  sx={{
                    width: 24,
                    height: 32,
                    bgcolor: 'action.selected',
                    borderRadius: 0.5,
                  }}
                />
              </Box>
              <Typography variant="caption">2 kolumny</Typography>
            </Button>
            <Button
              variant="outlined"
              onClick={() => handleSelect(3)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 1.5,
                minWidth: 80,
              }}
            >
              <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                <Box
                  sx={{
                    width: 16,
                    height: 32,
                    bgcolor: 'action.selected',
                    borderRadius: 0.5,
                  }}
                />
                <Box
                  sx={{
                    width: 16,
                    height: 32,
                    bgcolor: 'action.selected',
                    borderRadius: 0.5,
                  }}
                />
                <Box
                  sx={{
                    width: 16,
                    height: 32,
                    bgcolor: 'action.selected',
                    borderRadius: 0.5,
                  }}
                />
              </Box>
              <Typography variant="caption">3 kolumny</Typography>
            </Button>
          </Box>
        </Box>
      </Popover>
    </>
  );
};

export default ColumnPicker;
