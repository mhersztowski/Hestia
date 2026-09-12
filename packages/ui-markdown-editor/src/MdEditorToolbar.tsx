import React, { useCallback, useMemo, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Box,
  IconButton,
  Divider,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  Button,
  Menu,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Switch,
} from '@mui/material';
import { markdownToHtml } from './utils/markdownConverter';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SpellcheckIcon from '@mui/icons-material/Spellcheck';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import CodeIcon from '@mui/icons-material/Code';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ChecklistIcon from '@mui/icons-material/Checklist';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import LinkIcon from '@mui/icons-material/Link';
import ImageIcon from '@mui/icons-material/Image';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import VideocamIcon from '@mui/icons-material/Videocam';
import HighlightIcon from '@mui/icons-material/Highlight';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import AddLinkIcon from '@mui/icons-material/AddLink';
import PostAddIcon from '@mui/icons-material/PostAdd';
import CollectionsIcon from '@mui/icons-material/Collections';
import MapIcon from '@mui/icons-material/Map';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { CALLOUT_VARIANTS, type CalloutVariant } from './utils/callout';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import DictationDialog from './DictationDialog';
import FunctionsIcon from '@mui/icons-material/Functions';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import TableSizePicker from './components/TableSizePicker';
import ColumnPicker from './components/ColumnPicker';
import EmojiPicker from './components/EmojiPicker';

interface MdEditorToolbarProps {
  editor: Editor;
  onSave?: () => void;
  saveDisabled?: boolean;
  /** Optional — wired by MdEditor to open the "export to clean markdown" dialog. */
  onExportMarkdown?: () => void;
  /** Optional — wired by MdEditor so the "Info" toolbar button can pop the
   *  InfoMark insertion dialog. Left optional so toolbars used in contexts
   *  without the InfoMark extension (rare) still render. */
  onInsertInfoMark?: () => void;
  /** Optional — opens the internal-link picker (tree of .md files). */
  onInsertInternalLink?: () => void;
  /** Optional — opens the embed picker, inserts an Obsidian `![[…]]` transclusion. */
  onInsertEmbed?: () => void;
  /** Optional — opens the photo-gallery picker (Immich / Google Photos). */
  onInsertGallery?: () => void;
  /** Optional — opens the photo-map picker (photos pinned on a Leaflet map). */
  onInsertPhotoMap?: () => void;
  /** Optional — inserts a File chip (icon + name + Open/Options). */
  onInsertFile?: () => void;
  /** Optional — inserts an env-value marker {{env:name}}. */
  onInsertEnvValue?: () => void;
  /** Optional — toggles block group-selection mode (checkboxes + bulk actions). */
  onToggleGroupMode?: () => void;
  /** Whether group-selection mode is currently active (highlights the button). */
  groupModeActive?: boolean;
  /** Spellcheck language code (ISO 639-1, e.g. 'pl', 'en'). Used as the
   *  `lang` attribute on the contenteditable, which switches the browser's
   *  native spelling dictionary. */
  spellLanguage?: string;
  /** Master on/off for native spellcheck. */
  spellEnabled?: boolean;
  onSpellLanguageChange?: (lang: string) => void;
  onSpellEnabledChange?: (enabled: boolean) => void;
}

/** Languages exposed in the toolbar picker. List intentionally small —
 *  covers the most common dictionaries shipped with macOS / Windows / most
 *  Linux distros. User's OS controls actual dictionary availability; we
 *  just hint with the `lang` attribute. */
const SPELL_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'pl',    label: 'Polski' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'de',    label: 'Deutsch' },
  { code: 'fr',    label: 'Français' },
  { code: 'es',    label: 'Español' },
  { code: 'it',    label: 'Italiano' },
  { code: 'pt',    label: 'Português' },
  { code: 'ru',    label: 'Русский' },
  { code: 'uk',    label: 'Українська' },
  { code: 'cs',    label: 'Čeština' },
];

/** Rough browser detection — used to surface the right setup hint when
 *  the OS dictionary isn't available. We accept that this is a heuristic
 *  (UA string can lie); a wrong guess only changes the help text, not
 *  the spellcheck itself.
 *
 *  Important context:
 *  - Chrome on every OS uses its OWN Hunspell-based dictionaries. They're
 *    auto-downloaded but ONLY for languages on the user's `chrome://
 *    settings/languages` preferred list. macOS's system Polish dictionary
 *    is invisible to Chrome — the user has to add Polish there explicitly.
 *  - Safari + Firefox both delegate to the OS dictionary; on macOS that
 *    means System Settings → Keyboard → Text → Spelling.
 *  - Edge inherits Chromium behaviour. */
function detectBrowser(): 'chrome' | 'safari' | 'firefox' | 'edge' | 'other' {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua))     return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua))  return 'chrome';
  if (/Safari\//.test(ua))  return 'safari';
  return 'other';
}

const MdEditorToolbar: React.FC<MdEditorToolbarProps> = ({
  editor, onSave, saveDisabled, onInsertInfoMark, onInsertInternalLink, onInsertEmbed, onInsertGallery, onInsertPhotoMap, onInsertFile, onInsertEnvValue, onToggleGroupMode, groupModeActive, onExportMarkdown,
  spellLanguage, spellEnabled, onSpellLanguageChange, onSpellEnabledChange,
}) => {
  const [spellMenuAnchor, setSpellMenuAnchor] = useState<null | HTMLElement>(null);
  const [spellHelpOpen, setSpellHelpOpen] = useState(false);
  const browser = useMemo(() => detectBrowser(), []);
  const [insertMenuAnchor, setInsertMenuAnchor] = useState<null | HTMLElement>(null);
  // Callout ma pięć wariantów, więc przycisk otwiera listę zamiast wstawiać na ślepo.
  const [calloutMenuAnchor, setCalloutMenuAnchor] = useState<null | HTMLElement>(null);
  const insertMenuOpen = Boolean(insertMenuAnchor);

  // "Paste Markdown" dialog — fallback when navigator.clipboard.readText() is
  // unavailable (mobile browsers, HTTP, denied permission). When `text` is set
  // the dialog is open; user pastes manually then confirms.
  const [pasteDialog, setPasteDialog] = useState<{ text: string } | null>(null);

  // "Dictate" dialog — TTS the selection (or whole doc when nothing selected)
  // with real-time word highlighting + a writing canvas for practice.
  const [dictateDialog, setDictateDialog] = useState<{ text: string } | null>(null);

  const openDictateDialog = useCallback(() => {
    const { from, to, empty } = editor.state.selection;
    // Whole document when no selection — TipTap separator '\n\n' for block
    // boundaries makes the spoken text readable without merging paragraphs.
    const text = empty
      ? editor.getText({ blockSeparator: '\n\n' })
      : editor.state.doc.textBetween(from, to, '\n\n', ' ');
    if (!text.trim()) return;
    setDictateDialog({ text });
  }, [editor]);

  // Convert markdown to TipTap-compatible HTML and insert at the cursor.
  // Replaces any current selection. Distinct from the default Ctrl+V which
  // pastes raw text — this one parses the markdown syntax first.
  const insertMarkdown = useCallback((markdown: string) => {
    if (!markdown) return;
    const html = markdownToHtml(markdown);
    editor.chain().focus().insertContent(html).run();
  }, [editor]);

  const pasteMarkdownFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        // Empty clipboard → open manual dialog (better than silent no-op).
        setPasteDialog({ text: '' });
        return;
      }
      insertMarkdown(text);
    } catch {
      // Clipboard API blocked (mobile, HTTP, denied permission).
      // Open the dialog with empty content + autofocus so user can paste
      // manually with the native OS keyboard.
      setPasteDialog({ text: '' });
    }
  }, [insertMarkdown]);

  const confirmPasteDialog = useCallback(() => {
    if (!pasteDialog) return;
    insertMarkdown(pasteDialog.text);
    setPasteDialog(null);
  }, [pasteDialog, insertMarkdown]);

  const handleInsertMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setInsertMenuAnchor(event.currentTarget);
  };

  const handleInsertMenuClose = () => {
    setInsertMenuAnchor(null);
  };

  const insertComponent = useCallback((type: 'person' | 'task' | 'project') => {
    editor.chain().focus().insertComponentEmbed(type, '').run();
    handleInsertMenuClose();
  }, [editor]);

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    // Insert image with empty src - opens in edit mode
    editor.chain().focus().setImage({
      src: '',
      alt: '',
    }).run();
  }, [editor]);

  const addAudio = useCallback(() => {
    // Insert audio with empty src - opens in edit mode
    editor.chain().focus().setAudio({
      src: '',
    }).run();
  }, [editor]);

  const addVideo = useCallback(() => {
    // Insert video with empty src - opens in edit mode
    editor.chain().focus().setVideo({
      src: '',
    }).run();
  }, [editor]);

  const insertTable = useCallback((rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }, [editor]);

  const insertColumns = useCallback((columnCount: 2 | 3) => {
    editor.chain().focus().setColumns(columnCount).run();
  }, [editor]);

  const insertEmoji = useCallback((char: string) => {
    editor.chain().focus().insertContent(char).run();
  }, [editor]);

  // Indent/outdent for bullet, ordered and task list items.
  // taskList uses a different node type ('taskItem') from the other two.
  const getListItemType = () => editor.isActive('taskList') ? 'taskItem' : 'listItem';
  const handleIndent = useCallback(() => {
    editor.chain().focus().sinkListItem(getListItemType()).run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  const handleOutdent = useCallback(() => {
    editor.chain().focus().liftListItem(getListItemType()).run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  const inList = editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList');
  const canIndent  = inList && editor.can().sinkListItem(getListItemType());
  const canOutdent = inList && editor.can().liftListItem(getListItemType());

  const getHeadingLevel = (): string => {
    if (editor.isActive('heading', { level: 1 })) return '1';
    if (editor.isActive('heading', { level: 2 })) return '2';
    if (editor.isActive('heading', { level: 3 })) return '3';
    if (editor.isActive('heading', { level: 4 })) return '4';
    return '0';
  };

  const handleHeadingChange = (value: string) => {
    const level = parseInt(value);
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 }).run();
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        p: 1,
        borderBottom: 1,
        borderColor: 'divider',
        flexWrap: 'wrap',
        bgcolor: 'background.paper',
        flexShrink: 0, // Prevent toolbar from being compressed
        minHeight: 48, // Ensure minimum height
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Undo/Redo */}
      <Tooltip title="Undo (Ctrl+Z)">
        <IconButton size="small" onClick={() => editor.chain().focus().undo().run()}>
          <UndoIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Redo (Ctrl+Y)">
        <IconButton size="small" onClick={() => editor.chain().focus().redo().run()}>
          <RedoIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Heading selector */}
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <Select
          value={getHeadingLevel()}
          onChange={(e) => handleHeadingChange(e.target.value)}
          size="small"
          sx={{ height: 32 }}
        >
          <MenuItem value="0">Paragraph</MenuItem>
          <MenuItem value="1">Heading 1</MenuItem>
          <MenuItem value="2">Heading 2</MenuItem>
          <MenuItem value="3">Heading 3</MenuItem>
          <MenuItem value="4">Heading 4</MenuItem>
        </Select>
      </FormControl>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Text formatting */}
      <Tooltip title="Bold (Ctrl+B)">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBold().run()}
          color={editor.isActive('bold') ? 'primary' : 'default'}
        >
          <FormatBoldIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Italic (Ctrl+I)">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          color={editor.isActive('italic') ? 'primary' : 'default'}
        >
          <FormatItalicIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Strikethrough">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          color={editor.isActive('strike') ? 'primary' : 'default'}
        >
          <StrikethroughSIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Inline code">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleCode().run()}
          color={editor.isActive('code') ? 'primary' : 'default'}
        >
          <CodeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Highlight">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          color={editor.isActive('highlight') ? 'primary' : 'default'}
        >
          <HighlightIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Text Alignment */}
      <Tooltip title="Wyrównaj do lewej">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          color={editor.isActive({ textAlign: 'left' }) ? 'primary' : 'default'}
        >
          <FormatAlignLeftIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Wyśrodkuj">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          color={editor.isActive({ textAlign: 'center' }) ? 'primary' : 'default'}
        >
          <FormatAlignCenterIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Wyrównaj do prawej">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          color={editor.isActive({ textAlign: 'right' }) ? 'primary' : 'default'}
        >
          <FormatAlignRightIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Wyjustuj">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          color={editor.isActive({ textAlign: 'justify' }) ? 'primary' : 'default'}
        >
          <FormatAlignJustifyIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Link & Media */}
      <Tooltip title="Link">
        <IconButton
          size="small"
          onClick={setLink}
          color={editor.isActive('link') ? 'primary' : 'default'}
        >
          <LinkIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Image">
        <IconButton size="small" onClick={addImage}>
          <ImageIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {onInsertInfoMark && (
        <Tooltip title="Wyróżnienie z popupem (info-mark)">
          <IconButton size="small" onClick={onInsertInfoMark}>
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onInsertInternalLink && (
        <Tooltip title="Link wewnętrzny (plik / nagłówek / blok)">
          <IconButton size="small" onClick={onInsertInternalLink}>
            <AddLinkIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onInsertEmbed && (
        <Tooltip title="Osadź zawartość ![[…]] (plik / nagłówek / blok)">
          <IconButton size="small" onClick={onInsertEmbed}>
            <PostAddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onInsertGallery && (
        <Tooltip title="Galeria zdjęć (Immich / Google Photos)">
          <IconButton size="small" onClick={onInsertGallery}>
            <CollectionsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onInsertPhotoMap && (
        <Tooltip title="Mapa zdjęć (Immich / Google Photos na mapie)">
          <IconButton size="small" onClick={onInsertPhotoMap}>
            <MapIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onInsertFile && (
        <Tooltip title="Wstaw plik (Otwórz / Opcje — env dla JSON)">
          <IconButton size="small" onClick={onInsertFile}>
            <InsertDriveFileOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onInsertEnvValue && (
        <Tooltip title="Wstaw wartość zmiennej env ({{env:…}})">
          <IconButton size="small" onClick={onInsertEnvValue}>
            <DataObjectIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Callout — wyróżniony blok (jak w Notion)">
        <IconButton
          size="small"
          onClick={(e) => setCalloutMenuAnchor(e.currentTarget)}
          color={editor?.isActive('callout') ? 'primary' : 'default'}
        >
          <LightbulbOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={calloutMenuAnchor}
        open={calloutMenuAnchor !== null}
        onClose={() => setCalloutMenuAnchor(null)}
      >
        {(Object.keys(CALLOUT_VARIANTS) as CalloutVariant[]).map((variant) => (
          <MenuItem
            key={variant}
            selected={editor?.isActive('callout', { variant })}
            onClick={() => {
              // `toggle` — powtórne kliknięcie tego samego typu zdejmuje wyróżnienie.
              editor?.chain().focus().toggleCallout(variant).run();
              setCalloutMenuAnchor(null);
            }}
          >
            <ListItemIcon sx={{ minWidth: 32, fontSize: 18 }}>{CALLOUT_VARIANTS[variant].emoji}</ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 14 }}>
              {CALLOUT_VARIANTS[variant].label}
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
      {onToggleGroupMode && (
        <Tooltip title="Operacje grupowe na blokach (zaznacz i wykonaj Cut/Copy/Delete)">
          <IconButton
            size="small"
            onClick={onToggleGroupMode}
            color={groupModeActive ? 'primary' : 'default'}
            sx={groupModeActive ? { bgcolor: 'action.selected' } : undefined}
          >
            <ChecklistIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {/* Spellcheck control — only rendered when the host (MdEditor) has
          wired the callbacks, so other toolbar uses don't show a control
          they can't act on. Icon button opens a small menu with the
          on/off Switch + a language list. The button is colored primary
          when active so the user can tell the state at a glance. */}
      {onSpellEnabledChange && onSpellLanguageChange && (
        <>
          <Tooltip title={
            spellEnabled
              ? `Sprawdzanie pisowni: ${SPELL_LANGUAGES.find(l => l.code === spellLanguage)?.label ?? spellLanguage}`
              : 'Sprawdzanie pisowni wyłączone'
          }>
            <IconButton
              size="small"
              onClick={(e) => setSpellMenuAnchor(e.currentTarget)}
              color={spellEnabled ? 'primary' : 'default'}
            >
              <SpellcheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={spellMenuAnchor}
            open={spellMenuAnchor !== null}
            onClose={() => setSpellMenuAnchor(null)}
          >
            {/* Master switch — leaves the language selection intact so
                turning it back on lands on the same dictionary. */}
            <MenuItem onClick={() => onSpellEnabledChange(!spellEnabled)}>
              <ListItemIcon>
                <Switch size="small" checked={!!spellEnabled} />
              </ListItemIcon>
              <ListItemText
                primary="Sprawdzaj pisownię"
                secondary="Słownik systemowy przeglądarki / OS"
              />
            </MenuItem>
            <Divider />
            {SPELL_LANGUAGES.map(({ code, label }) => (
              <MenuItem
                key={code}
                selected={spellLanguage === code}
                disabled={!spellEnabled}
                onClick={() => {
                  onSpellLanguageChange(code);
                  setSpellMenuAnchor(null);
                }}
              >
                <ListItemText primary={label} secondary={code} />
              </MenuItem>
            ))}
            <Divider />
            <MenuItem onClick={() => { setSpellHelpOpen(true); setSpellMenuAnchor(null); }}>
              <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText
                primary="Słownik nie działa? Włącz go w przeglądarce →"
                secondary="Krótka instrukcja dla Chrome / Safari / Firefox / Edge"
                primaryTypographyProps={{ fontSize: '0.85rem' }}
                secondaryTypographyProps={{ fontSize: '0.72rem' }}
              />
            </MenuItem>
          </Menu>

          {/* Per-browser setup instructions — shown when the user reports
              spellcheck isn't doing anything. Each browser has its own
              quirk: Chrome wants the language on its preferred list, Safari
              + Firefox lean on OS settings, etc. */}
          <Dialog open={spellHelpOpen} onClose={() => setSpellHelpOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Włączenie sprawdzania pisowni</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Edytor ustawia tylko atrybuty <code>spellcheck</code> i <code>lang="{spellLanguage}"</code>
                — faktyczne podświetlanie błędów wykonuje <strong>przeglądarka</strong>, korzystając ze
                swojego słownika. Jeśli nic nie podświetla się dla wybranego języka, najczęściej trzeba
                go ręcznie aktywować.
              </Typography>

              {(browser === 'chrome' || browser === 'edge') && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 1 }}>
                    {browser === 'chrome' ? 'Google Chrome' : 'Microsoft Edge'} (wykryto twoje przeglądarka)
                  </Typography>
                  <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                    <ol style={{ marginTop: 0, paddingLeft: '1.25rem' }}>
                      <li>Otwórz <code>{browser === 'chrome' ? 'chrome://settings/languages' : 'edge://settings/languages'}</code> w nowej karcie
                        (skopiuj — link do <code>chrome://</code> nie zadziała z poziomu strony).</li>
                      <li>W sekcji <em>Preferred languages</em> kliknij <em>Add languages</em> i dodaj <strong>{
                        SPELL_LANGUAGES.find(l => l.code === spellLanguage)?.label ?? spellLanguage
                      }</strong>.</li>
                      <li>Pod listą języków znajdź sekcję <em>Spell check</em>. Włącz <em>Enhanced spell check</em>
                        (lub przynajmniej <em>Basic</em>) — bez tego Chrome ignoruje słownik.</li>
                      <li>Upewnij się że wybrany język ma checkbox <em>Use this language for spell checking</em>.</li>
                      <li>Wróć do MyCastle i odśwież stronę.</li>
                    </ol>
                  </Typography>
                  <Button
                    variant="outlined" size="small" sx={{ mt: 1 }}
                    onClick={() => navigator.clipboard?.writeText(browser === 'chrome' ? 'chrome://settings/languages' : 'edge://settings/languages')}
                  >
                    Skopiuj URL ustawień
                  </Button>
                </>
              )}

              {browser === 'safari' && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 1 }}>Safari (macOS)</Typography>
                  <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                    <ol style={{ marginTop: 0, paddingLeft: '1.25rem' }}>
                      <li>System Settings → <em>Keyboard</em> → <em>Text Input</em> → <em>Edit</em>.</li>
                      <li>W polu <em>Spelling</em> wybierz <strong>{
                        SPELL_LANGUAGES.find(l => l.code === spellLanguage)?.label ?? spellLanguage
                      }</strong> lub <em>Automatic by Language</em>.</li>
                      <li>Jeśli słownik nie jest zainstalowany, kliknij <em>Set Up…</em> obok — macOS pobierze go automatycznie.</li>
                      <li>Wróć do MyCastle i odśwież stronę.</li>
                    </ol>
                  </Typography>
                </>
              )}

              {browser === 'firefox' && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 1 }}>Mozilla Firefox</Typography>
                  <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                    <ol style={{ marginTop: 0, paddingLeft: '1.25rem' }}>
                      <li>Prawym przyciskiem klikinij w polu edytora → <em>Languages</em> → <em>Add Dictionaries…</em></li>
                      <li>Wybierz słownik dla języka <strong>{
                        SPELL_LANGUAGES.find(l => l.code === spellLanguage)?.label ?? spellLanguage
                      }</strong> i zainstaluj.</li>
                      <li>Po instalacji ponownie prawy przycisk → <em>Languages</em> → wybierz zainstalowany słownik.</li>
                    </ol>
                  </Typography>
                </>
              )}

              {browser === 'other' && (
                <Typography variant="body2">
                  Nie udało się wykryć twojej przeglądarki. Sprawdź w ustawieniach przeglądarki sekcję
                  "Languages" lub "Spell check" i upewnij się że
                  <strong> {SPELL_LANGUAGES.find(l => l.code === spellLanguage)?.label ?? spellLanguage} </strong>
                  jest aktywnym słownikiem.
                </Typography>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary">
                Edytor nie dystrybuuje słowników — to celowe, bo systemowe / wbudowane są zoptymalizowane,
                aktualizowane przez producenta przeglądarki i działają również w innych aplikacjach.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSpellHelpOpen(false)}>Zamknij</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      <Tooltip title="Audio">
        <IconButton size="small" onClick={addAudio} color="secondary">
          <AudiotrackIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Video">
        <IconButton size="small" onClick={addVideo} color="error">
          <VideocamIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Lists */}
      <Tooltip title="Bullet list">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          color={editor.isActive('bulletList') ? 'primary' : 'default'}
        >
          <FormatListBulletedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Numbered list">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          color={editor.isActive('orderedList') ? 'primary' : 'default'}
        >
          <FormatListNumberedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Task list">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          color={editor.isActive('taskList') ? 'primary' : 'default'}
        >
          <ChecklistIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Outdent (decrease indent)">
        <span>
          <IconButton size="small" onClick={handleOutdent} disabled={!canOutdent}>
            <FormatIndentDecreaseIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Indent (increase indent)">
        <span>
          <IconButton size="small" onClick={handleIndent} disabled={!canIndent}>
            <FormatIndentIncreaseIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Blocks */}
      <Tooltip title="Quote">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          color={editor.isActive('blockquote') ? 'primary' : 'default'}
        >
          <FormatQuoteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Code block">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          color={editor.isActive('codeBlock') ? 'primary' : 'default'}
        >
          <CodeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <TableSizePicker onSelect={insertTable} />
      <ColumnPicker onSelect={insertColumns} />
      <Tooltip title="Horizontal rule">
        <IconButton size="small" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <HorizontalRuleIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Math Block (LaTeX)">
        <IconButton size="small" onClick={() => editor.chain().focus().insertMathBlock('E = mc^2').run()}>
          <FunctionsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <EmojiPicker onSelect={insertEmoji} />

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Insert menu (for mobile - alternative to slash commands) */}
      <Tooltip title="Insert component">
        <IconButton size="small" onClick={handleInsertMenuOpen}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={insertMenuAnchor}
        open={insertMenuOpen}
        onClose={handleInsertMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={() => insertComponent('person')}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Person</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => insertComponent('task')}>
          <ListItemIcon>
            <TaskIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Task</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => insertComponent('project')}>
          <ListItemIcon>
            <FolderIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Project</ListItemText>
        </MenuItem>
      </Menu>

      {/* Spacer pushes the trailing buttons to the right edge. Placed even
          when there's no Save button so "Paste Markdown" still right-aligns. */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Paste Markdown — parses clipboard contents as markdown before
          inserting, unlike the default Ctrl+V which pastes raw text. */}
      <Tooltip title="Wklej Markdown ze schowka (parsuje składnię)">
        <IconButton size="small" onClick={pasteMarkdownFromClipboard}>
          <ContentPasteGoIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Dyktuj — TTS zaznaczonego tekstu z real-time podświetlaniem słów
          i obszarem do pisania odręcznego (pen/touch + pinch zoom/pan). */}
      <Tooltip title="Dyktuj zaznaczony tekst (cały dokument gdy nic nie zaznaczone)">
        <IconButton size="small" onClick={openDictateDialog}>
          <RecordVoiceOverIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Export to clean markdown */}
      {onExportMarkdown && (
        <Tooltip title="Eksportuj do czystego markdown">
          <IconButton size="small" onClick={onExportMarkdown}>
            <TextSnippetIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      {/* Save button */}
      {onSave && (
        <Button
          variant="contained"
          size="small"
          startIcon={<SaveIcon />}
          onClick={onSave}
          disabled={saveDisabled}
        >
          Save
        </Button>
      )}

      {/* Dictation dialog — full screen, mounted lazily on first open */}
      {dictateDialog && (
        <DictationDialog
          open
          text={dictateDialog.text}
          onClose={() => setDictateDialog(null)}
        />
      )}

      {/* Manual paste fallback (mobile / HTTP / blocked clipboard) */}
      {pasteDialog && (
        <Dialog open onClose={() => setPasteDialog(null)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ContentPasteGoIcon /> Wklej Markdown
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Twoja przeglądarka nie pozwoliła odczytać schowka automatycznie.
              Wklej zawartość poniżej (<code>⌘V</code>/<code>Ctrl+V</code> na desktopie,
              przytrzymaj pole → <strong>Wklej</strong> na mobile), a po kliknięciu
              <strong> Wstaw</strong> zostanie sparsowana jako Markdown.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              multiline
              rows={12}
              value={pasteDialog.text}
              onChange={(e) => setPasteDialog({ text: e.target.value })}
              onKeyDown={(e) => {
                // Ctrl/Cmd+Enter → quick-confirm without reaching for the button
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  confirmPasteDialog();
                }
              }}
              placeholder="# Nagłówek&#10;&#10;**pogrubiony** tekst, _kursywa_, [link](https://…)"
              slotProps={{ htmlInput: { style: { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 13 } } }}
              helperText={`${pasteDialog.text.length} znaków · Ctrl+Enter wstawia`}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPasteDialog(null)}>Anuluj</Button>
            <Button variant="contained" disabled={!pasteDialog.text.trim()} onClick={confirmPasteDialog}>
              Wstaw
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default MdEditorToolbar;
