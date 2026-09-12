import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Popover,
  IconButton,
  Tooltip,
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';

interface TableSizePickerProps {
  onSelect: (rows: number, cols: number) => void;
}

const MAX_ROWS = 10;
const MAX_COLS = 10;

export const TableSizePicker: React.FC<TableSizePickerProps> = ({ onSelect }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    setHoverRow(3);
    setHoverCol(3);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleCellClick = (row: number, col: number) => {
    onSelect(row, col);
    handleClose();
  };

  const handleCellHover = (row: number, col: number) => {
    setHoverRow(row);
    setHoverCol(col);
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title="Wstaw tabelę">
        <IconButton size="small" onClick={handleClick}>
          <TableChartIcon fontSize="small" />
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
      >
        <Paper sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {hoverRow} x {hoverCol}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)`,
              gap: '2px',
            }}
          >
            {Array.from({ length: MAX_ROWS }, (_, rowIndex) =>
              Array.from({ length: MAX_COLS }, (_, colIndex) => {
                const row = rowIndex + 1;
                const col = colIndex + 1;
                const isSelected = row <= hoverRow && col <= hoverCol;
                return (
                  <Box
                    key={`${row}-${col}`}
                    onClick={() => handleCellClick(row, col)}
                    onMouseEnter={() => handleCellHover(row, col)}
                    sx={{
                      width: 16,
                      height: 16,
                      border: '1px solid',
                      borderColor: isSelected ? 'primary.main' : 'grey.300',
                      backgroundColor: isSelected ? 'primary.light' : 'background.paper',
                      cursor: 'pointer',
                      transition: 'all 0.1s ease',
                      '&:hover': {
                        borderColor: 'primary.main',
                      },
                    }}
                  />
                );
              })
            )}
          </Box>
        </Paper>
      </Popover>
    </>
  );
};

export default TableSizePicker;
