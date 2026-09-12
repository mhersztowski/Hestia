import React, { useState, useCallback } from 'react';
import {
  Box,
  IconButton,
  Popover,
  Tabs,
  Tab,
  Typography,
  TextField,
  Tooltip,
} from '@mui/material';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';

interface EmojiPickerProps {
  onSelect: (char: string) => void;
}

// Emoji categories with common emojis
const EMOJI_CATEGORIES = {
  'Twarze': [
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌',
    '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑',
    '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
    '😬', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢',
    '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠',
  ],
  'Gesty': [
    '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
    '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌', '🤲', '🤝',
    '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '👀', '👁️',
  ],
  'Symbole': [
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
    '💞', '💓', '💗', '💖', '💘', '💝', '⭐', '🌟', '✨', '💫', '🔥', '💥',
    '💢', '💦', '💨', '🎵', '🎶', '💤', '💬', '💭', '🗯️', '💡', '🔔', '🔕',
  ],
  'Natura': [
    '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴', '🌲',
    '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🪹', '🪺',
    '🍄', '🌰', '🦀', '🦞', '🦐', '🦑', '🐙', '🐚', '🐌', '🦋', '🐛', '🐜',
  ],
  'Jedzenie': [
    '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑',
    '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑',
    '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨',
  ],
  'Obiekty': [
    '📱', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '🖲️', '💽', '💾', '💿', '📀', '📼',
    '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻',
    '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋',
  ],
};

// Special characters categories
const SPECIAL_CATEGORIES = {
  'Strzałki': [
    '→', '←', '↑', '↓', '↔', '↕', '↖', '↗', '↘', '↙', '⇒', '⇐',
    '⇑', '⇓', '⇔', '⇕', '➔', '➜', '➝', '➞', '➟', '➠', '➡', '➢',
    '➣', '➤', '➥', '➦', '➧', '➨', '➩', '➪', '➫', '➬', '➭', '➮',
  ],
  'Matematyka': [
    '±', '×', '÷', '≠', '≈', '≤', '≥', '∞', '∑', '∏', '√', '∛',
    '∜', '∫', '∬', '∭', '∮', '∝', '∂', '∆', '∇', '∈', '∉', '∋',
    '∩', '∪', '⊂', '⊃', '⊄', '⊅', '⊆', '⊇', '⊕', '⊗', '⊥', '∥',
    '∠', '∡', '∢', '°', '′', '″', '‰', '‱', '℃', '℉', 'π', 'φ',
  ],
  'Waluta': [
    '€', '£', '¥', '₹', '₽', '₿', '¢', '₣', '₤', '₧', '₨', '₩',
    '₪', '₫', '₭', '₮', '₯', '₰', '₱', '₲', '₳', '₴', '₵', '₶',
  ],
  'Typografia': [
    '©', '®', '™', '℠', '№', '℗', '℮', '‼', '⁉', '❓', '❔', '❕',
    '❗', '〃', '§', '¶', '†', '‡', '•', '‣', '⁃', '◦', '○', '●',
    '◉', '◎', '◌', '◐', '◑', '◒', '◓', '◔', '◕', '◖', '◗', '❖',
  ],
  'Ramki': [
    '─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '═',
    '║', '╒', '╓', '╔', '╕', '╖', '╗', '╘', '╙', '╚', '╛', '╜',
    '╝', '╞', '╟', '╠', '╡', '╢', '╣', '╤', '╥', '╦', '╧', '╨',
  ],
  'Geometria': [
    '■', '□', '▢', '▣', '▤', '▥', '▦', '▧', '▨', '▩', '▪', '▫',
    '▬', '▭', '▮', '▯', '▰', '▱', '▲', '△', '▴', '▵', '▶', '▷',
    '▸', '▹', '►', '▻', '▼', '▽', '▾', '▿', '◀', '◁', '◂', '◃',
    '◄', '◅', '◆', '◇', '◈', '◊', '★', '☆', '✦', '✧', '✩', '✪',
  ],
  'Znaki': [
    '✓', '✔', '✕', '✖', '✗', '✘', '✙', '✚', '✛', '✜', '✝', '✞',
    '✟', '✠', '✡', '✢', '✣', '✤', '✥', '✦', '✧', '✩', '✪', '✫',
    '✬', '✭', '✮', '✯', '✰', '✱', '✲', '✳', '✴', '✵', '✶', '✷',
  ],
};

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [emojiSubTab, setEmojiSubTab] = useState(0);
  const [specialSubTab, setSpecialSubTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
    setSearchTerm('');
  }, []);

  const handleSelect = useCallback((char: string) => {
    onSelect(char);
    handleClose();
  }, [onSelect, handleClose]);

  const open = Boolean(anchorEl);

  const emojiCategories = Object.keys(EMOJI_CATEGORIES);
  const specialCategories = Object.keys(SPECIAL_CATEGORIES);

  // Get current items based on tab selection
  const getCurrentItems = () => {
    if (tabValue === 0) {
      const categoryName = emojiCategories[emojiSubTab];
      return EMOJI_CATEGORIES[categoryName as keyof typeof EMOJI_CATEGORIES] || [];
    } else {
      const categoryName = specialCategories[specialSubTab];
      return SPECIAL_CATEGORIES[categoryName as keyof typeof SPECIAL_CATEGORIES] || [];
    }
  };

  // Filter items by search term
  const filteredItems = searchTerm
    ? getCurrentItems().filter(item => item.includes(searchTerm))
    : getCurrentItems();

  return (
    <>
      <Tooltip title="Emoji i znaki specjalne">
        <IconButton size="small" onClick={handleClick}>
          <EmojiEmotionsIcon fontSize="small" />
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
        <Box sx={{ width: 320, maxHeight: 400, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Main tabs: Emoji / Special */}
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => setTabValue(newValue)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="Emoji" sx={{ minHeight: 40 }} />
            <Tab label="Znaki" sx={{ minHeight: 40 }} />
          </Tabs>

          {/* Search field */}
          <Box sx={{ p: 1 }}>
            <TextField
              size="small"
              placeholder="Szukaj..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              fullWidth
              sx={{ '& .MuiInputBase-input': { py: 0.5 } }}
            />
          </Box>

          {/* Category tabs */}
          <Tabs
            value={tabValue === 0 ? emojiSubTab : specialSubTab}
            onChange={(_, newValue) => {
              if (tabValue === 0) {
                setEmojiSubTab(newValue);
              } else {
                setSpecialSubTab(newValue);
              }
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 32,
              borderBottom: 1,
              borderColor: 'divider',
              '& .MuiTab-root': { minHeight: 32, py: 0.5, fontSize: '0.75rem' }
            }}
          >
            {(tabValue === 0 ? emojiCategories : specialCategories).map((cat) => (
              <Tab key={cat} label={cat} />
            ))}
          </Tabs>

          {/* Character grid */}
          <Box
            sx={{
              p: 1,
              flexGrow: 1,
              overflow: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gap: 0.5,
              maxHeight: 220,
            }}
          >
            {filteredItems.map((char, index) => (
              <Box
                key={`${char}-${index}`}
                onClick={() => handleSelect(char)}
                sx={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: 1,
                  fontSize: tabValue === 0 ? '1.25rem' : '1rem',
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                {char}
              </Box>
            ))}
            {filteredItems.length === 0 && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 2 }}
              >
                Brak wyników
              </Typography>
            )}
          </Box>
        </Box>
      </Popover>
    </>
  );
};

export default EmojiPicker;
