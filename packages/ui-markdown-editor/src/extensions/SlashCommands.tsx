import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import TitleIcon from '@mui/icons-material/Title';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import ScienceIcon from '@mui/icons-material/Science';
import CodeIcon from '@mui/icons-material/Code';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import LanguageIcon from '@mui/icons-material/Language';
import TableChartIcon from '@mui/icons-material/TableChart';
import GridOnIcon from '@mui/icons-material/GridOn';
import ImageIcon from '@mui/icons-material/Image';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import VideocamIcon from '@mui/icons-material/Videocam';
import YouTubeIcon from '@mui/icons-material/YouTube';
import FunctionsIcon from '@mui/icons-material/Functions';
import PersonIcon from '@mui/icons-material/Person';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DynamicFormIcon from '@mui/icons-material/DynamicForm';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import LinkIcon from '@mui/icons-material/Link';
import ExtensionIcon from '@mui/icons-material/Extension';
import EventIcon from '@mui/icons-material/Event';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { CALLOUT_VARIANTS, type CalloutVariant } from '../utils/callout';
import type { ScriptTemplate } from '../capabilities';

interface CommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (props: { editor: any; range: any }) => void;
}

export interface SlashCommandsOptions {
  suggestion: Omit<SuggestionOptions, 'editor'>;
  createPageRef?: { current: ((path: string) => Promise<void>) | undefined };
  /** Called by the `/event` command — host opens its EventDialog with this
   *  range so the resulting blockquote replaces the slash trigger text. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertEventRef?: { current: ((editor: any, range: any) => void) | undefined };
  /** Wołane przez `/karta` — gospodarz otwiera okno wyboru zadania. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertTaskCardRef?: { current: ((editor: any, range: any) => void) | undefined };
  /**
   * Szablony skryptów dodawane przez gospodarza — w MyCastle brały się z
   * `pluginRegistry`. Ref, a nie hook: to jest konfiguracja sugestii TipTapa,
   * a nie komponent, więc nie ma skąd wołać hooka. Lista jest odpytywana przy
   * każdym otwarciu palety, bo zestaw wtyczek zmienia się w trakcie sesji.
   */
  scriptTemplatesRef?: { current: (() => ScriptTemplate[]) | undefined };
}

const commands: CommandItem[] = [
  {
    title: 'Text',
    description: 'Plain text paragraph',
    icon: <TextFieldsIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: 'Heading 1',
    description: 'Large heading',
    icon: <TitleIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium heading',
    icon: <TitleIcon sx={{ fontSize: 20 }} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: 'Heading 3',
    description: 'Small heading',
    icon: <TitleIcon sx={{ fontSize: 18 }} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: <FormatListBulletedIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    icon: <FormatListNumberedIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'Task List',
    description: 'List with checkboxes',
    icon: <ChecklistIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: 'Quote',
    description: 'Block quote',
    icon: <FormatQuoteIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  // Callout (wyróżnienie jak w Notion) — jeden wpis na wariant, żeby dało się
  // wstawić właściwy typ bez dodatkowego klikania w menu bloku.
  ...(Object.keys(CALLOUT_VARIANTS) as CalloutVariant[]).map((variant) => ({
    title: `Callout: ${CALLOUT_VARIANTS[variant].label}`,
    description: `Wyróżniony blok ${CALLOUT_VARIANTS[variant].emoji} (markdown: > [!${variant.toUpperCase()}])`,
    icon: <span style={{ fontSize: 18 }}>{CALLOUT_VARIANTS[variant].emoji}</span>,
    command: ({ editor, range }: { editor: any; range: any }) => {
      editor.chain().focus().deleteRange(range).setCallout(variant).run();
    },
  })),
  // Bloki bazy wiedzy. Każdy wstawia się z gotową, poprawną treścią — pusty
  // blok `formula` pokazuje sam komunikat o braku przypisania, co wygląda jak
  // usterka, a nie jak zaproszenie do pisania.
  {
    title: 'Wzór (baza wiedzy)',
    description: 'Blok formula: równanie w LaTeX-u z jednostkami',
    icon: <FunctionsIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: `formula:wzor-${Math.random().toString(36).slice(2, 6)}` },
          content: [
            { type: 'text', text: 'T = 2\\pi\\sqrt{\\frac{L}{g}}\n@vars T: s, L: m, g: m/s^2' },
          ],
        })
        .run();
    },
  },
  {
    title: 'Układ równań (baza wiedzy)',
    description: 'Blok formula z @ode: zmienne stanu i pochodne',
    icon: <FunctionsIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: `formula:ruch-${Math.random().toString(36).slice(2, 6)}` },
          content: [
            {
              type: 'text',
              text: [
                '@ode',
                '@state x, v',
                '@d x = v',
                '@d v = -\\omega_0^2 \\cdot x',
                '@init x = x_0, v = 0',
                '@vars x: m, v: m/s, omega_0: s^-1, x_0: m',
              ].join('\n'),
            },
          ],
        })
        .run();
    },
  },
  {
    title: 'Symulacja (baza wiedzy)',
    description: 'Blok sim: suwaki i wykresy ze wzorów tego dokumentu',
    icon: <ScienceIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'sim' },
          content: [{ type: 'text', text: '{\n  "duration": 10\n}' }],
        })
        .run();
    },
  },
  {
    title: 'Model w skrypcie (baza wiedzy)',
    description: 'Blok simscript: model w TypeScripcie dla zjawisk spoza grafu',
    icon: <ScienceIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'simscript' },
          content: [
            {
              type: 'text',
              text: [
                'return defineModel({',
                "  parameters: [{ name: 'a', unit: 'm/s^2', value: 2, min: 0, max: 10 }],",
                "  observables: [{ name: 'x', kind: 'series', unit: 'm' }],",
                '  run: (values: Record<string, number>, tSpan: [number, number]) => {',
                '    const kroki = 500;',
                '    const h = (tSpan[1] - tSpan[0]) / kroki;',
                '    const x: Array<[number, number]> = [];',
                '    for (let i = 0; i <= kroki; i += 1) {',
                '      const t = tSpan[0] + i * h;',
                '      x.push([t, 0.5 * values.a * t * t]);',
                '    }',
                '    return { series: { x }, scalars: {} };',
                '  },',
                '});',
              ].join('\n'),
            },
          ],
        })
        .run();
    },
  },
  {
    title: 'Zadanie (baza wiedzy)',
    description: 'Blok exercise: dane losowane, klucz liczony z wzorów',
    icon: <ScienceIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: `exercise:zadanie-${Math.random().toString(36).slice(2, 6)}` },
          content: [
            {
              type: 'text',
              text: [
                'Treść zadania. Dane poniżej są losowane, a odpowiedź liczy graf wzorów.',
                '@given L: 0.5..2 m step 0.1',
                '@answer T',
                '@tolerance 2%',
              ].join('\n'),
            },
          ],
        })
        .run();
    },
  },
  {
    title: 'Pole na siatce (baza wiedzy)',
    description: 'Równanie cząstkowe: dyfuzja albo fala na siatce 2D',
    icon: <ScienceIcon />,
    command: ({ editor, range }) => {
      // Dwa bloki naraz, bo pole potrzebuje ich obu: wzoru z równaniem i
      // uruchomienia z nastawami. Wstawienie samego jednego dałoby blok, który
      // od razu zgłasza brak drugiego.
      const id = `pole-${Math.random().toString(36).slice(2, 6)}`;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: 'codeBlock',
            attrs: { language: `formula:${id}` },
            content: [
              {
                type: 'text',
                text: [
                  '@pde',
                  '@field u',
                  '@grid 96 x 96',
                  '@domain x: 0..1 m, y: 0..1 m',
                  '@d u = \\alpha \\cdot \\Delta u',
                  '@init u = \\exp(-60 \\cdot ((x - 0.5)^2 + (y - 0.5)^2))',
                  '@boundary neumann',
                  '@vars u: K, alpha: m^2/s, x: m, y: m',
                ].join('\n'),
              },
            ],
          },
          {
            type: 'codeBlock',
            attrs: { language: `field:${id}` },
            content: [{ type: 'text', text: '{\n  "alpha": 0.01,\n  "duration": 3\n}' }],
          },
        ])
        .run();
    },
  },
  {
    title: 'Przekształcenie liniowe (baza wiedzy)',
    description: 'Scena algebry: siatka, kwadrat jednostkowy, wektory własne',
    icon: <ScienceIcon />,
    command: ({ editor, range }) => {
      // Dwa bloki naraz, jak przy polu: scena bez równania zgłaszałaby brak.
      const id = `scena-${Math.random().toString(36).slice(2, 6)}`;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: 'codeBlock',
            attrs: { language: `formula:${id}` },
            content: [
              {
                type: 'text',
                text: [
                  '@linalg',
                  '@mat A = [[1, 1], [0, 1]]',
                  '@vec v = [1, 1]',
                  'w = A \\cdot v',
                ].join('\n'),
              },
            ],
          },
          {
            type: 'codeBlock',
            attrs: { language: `linalg:${id}` },
            content: [{ type: 'text', text: '{ "eigen": true }' }],
          },
        ])
        .run();
    },
  },
  {
    title: 'Przekształcenie 3D (baza wiedzy)',
    description: 'Scena przestrzenna: sześcian jednostkowy, oś obrotu, jądro',
    icon: <ViewInArIcon />,
    command: ({ editor, range }) => {
      const id = `scena3d-${Math.random().toString(36).slice(2, 6)}`;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: 'codeBlock',
            attrs: { language: `formula:${id}` },
            content: [
              {
                type: 'text',
                text: [
                  '@linalg',
                  '@mat3 R = [[0.5, -0.866, 0], [0.866, 0.5, 0], [0, 0, 1]]',
                  '@vec3 v = [1.5, 0, 0]',
                  'w = R \\cdot v',
                ].join('\n'),
              },
            ],
          },
          {
            type: 'codeBlock',
            attrs: { language: `linalg:${id}` },
            content: [{ type: 'text', text: '{ "eigen": true }' }],
          },
        ])
        .run();
    },
  },
  {
    title: 'Procedura krokowa (baza wiedzy)',
    description: 'Eliminacja Gaussa albo Gram-Schmidt, krok po kroku',
    icon: <ScienceIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: `procedure:gauss-${Math.random().toString(36).slice(2, 6)}` },
          content: [
            {
              type: 'text',
              text: '{\n  "kind": "gauss",\n  "matrix": [[2, 1], [4, 3]],\n  "rhs": [5, 11]\n}',
            },
          ],
        })
        .run();
    },
  },
  {
    title: 'Diagram (Mermaid)',
    description: 'Blok diagramu z przełącznikiem Code / View / Edit',
    icon: <AccountTreeIcon />,
    command: ({ editor, range }) => {
      // Zaczynamy od minimalnego, poprawnego diagramu — pusty blok mermaid
      // renderuje się błędem, co wygląda jak usterka edytora.
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [{ type: 'text', text: 'flowchart TD\n  A[Start] --> B[Koniec]' }],
        })
        .run();
    },
  },
  {
    title: 'Diagram stanów (Mermaid)',
    description: 'stateDiagram-v2 z przełącznikiem Code / View / Edit',
    icon: <AccountTreeIcon sx={{ transform: 'rotate(90deg)' }} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [
            {
              type: 'text',
              text: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Praca: start\n  Praca --> [*]',
            },
          ],
        })
        .run();
    },
  },
  {
    title: 'Code Block',
    description: 'Code with syntax highlighting',
    icon: <CodeIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: 'Divider',
    description: 'Horizontal line',
    icon: <HorizontalRuleIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: 'Link',
    description: 'Insert a hyperlink',
    icon: <LinkIcon />,
    command: ({ editor, range }) => {
      const url = window.prompt('URL');
      if (!url) return;
      const text = window.prompt('Link text', url) ?? url;
      const from = range.from;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContentAt(from, text)
        .setTextSelection({ from, to: from + text.length })
        .setLink({ href: url })
        .setTextSelection(from + text.length)
        .run();
    },
  },
  {
    title: 'Table 2x2',
    description: 'Small table (2 rows, 2 columns)',
    icon: <TableChartIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Table 3x3',
    description: 'Medium table (3 rows, 3 columns)',
    icon: <TableChartIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Table 4x4',
    description: 'Large table (4 rows, 4 columns)',
    icon: <TableChartIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 4, cols: 4, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Table 5x5',
    description: 'Extra large table (5 rows, 5 columns)',
    icon: <TableChartIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 5, cols: 5, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Table View',
    description: 'Zaawansowana tabela z danych env (kolumny, szerokości, wysokość wiersza)',
    icon: <GridOnIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({ type: 'tableView' }).run();
    },
  },
  {
    title: 'Image',
    description: 'Insert an image (editable)',
    icon: <ImageIcon />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setImage({
          src: '',
          alt: '',
        })
        .run();
    },
  },
  {
    title: 'Audio',
    description: 'Insert audio file',
    icon: <AudiotrackIcon color="secondary" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setAudio({
          src: '',
        })
        .run();
    },
  },
  {
    title: 'Video',
    description: 'Insert video file',
    icon: <VideocamIcon color="error" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setVideo({
          src: '',
        })
        .run();
    },
  },
  {
    title: 'YouTube',
    description: 'Osadź film z YouTube',
    icon: <YouTubeIcon sx={{ color: '#c4302b' }} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setYouTube({ videoId: '' }).run();
    },
  },
  {
    title: 'Math Block',
    description: 'Display math equation (LaTeX)',
    icon: <FunctionsIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertMathBlock('E = mc^2').run();
    },
  },
  {
    title: 'Inline Math',
    description: 'Inline math expression',
    icon: <FunctionsIcon sx={{ fontSize: 18 }} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertInlineMath('x^2').run();
    },
  },
  {
    title: 'Person',
    description: 'Embed a person reference',
    icon: <PersonIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertComponentEmbed('person', '').run();
    },
  },
  {
    title: 'Task',
    description: 'Embed a task reference',
    icon: <TaskIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertComponentEmbed('task', '').run();
    },
  },
  {
    title: 'Project',
    description: 'Embed a project reference',
    icon: <FolderIcon />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertComponentEmbed('project', '').run();
    },
  },
  {
    title: 'UI Form',
    description: 'Embed a UI form',
    icon: <DashboardIcon color="info" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertUIForm('').run();
    },
  },
  {
    title: 'Form',
    description: 'Embed a FormEngine form',
    icon: <DynamicFormIcon color="primary" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertFormEngine('').run();
    },
  },
  {
    title: 'CAD View',
    description: 'Embed a CAD / Scene3D / Electronics project',
    icon: <ViewInArIcon color="info" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertCadView('scene3d', '').run();
    },
  },
  {
    title: 'Osadź stronę www',
    description: 'iframe z URL albo komponent z drive/public/lit',
    icon: <LanguageIcon color="info" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertWebEmbed('url', '').run();
    },
  },
  {
    title: 'Plugin Script',
    description: 'Pusty blok skryptu (auth, http, md, table, reactive)',
    icon: <ExtensionIcon sx={{ color: '#7c4dff' }} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertPluginScript(
          '// Available: auth, http, md, table, reactive, display\n// Return a value to show it, or use display.text() for imperative output\n\nreturn `Hello, ${auth.currentUser}!`;',
          { mode: 'manual', label: 'Script' }
        )
        .run();
    },
  },
];

/**
 * Slash-command items for every Plugin Script template contributed by a loaded
 * web plugin (via `api.scripts.registerTemplate()`). Rebuilt on each `/` query so
 * the list reflects whichever plugins are currently loaded.
 */
function buildPluginTemplateCommands(templates: ScriptTemplate[]): CommandItem[] {
  return templates.map((template) => ({
    title: `Plugin Script: ${template.label}`,
    // Always lead the description with the source plugin so it's clear where the template comes from.
    description: template.description
      ? `${template.source} — ${template.description}`
      : `Szablon z ${template.source}`,
    icon: <ExtensionIcon sx={{ color: '#7c4dff' }} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertPluginScript(template.code, {
          mode: template.mode ?? 'manual',
          label: template.label,
        })
        .run();
    },
  }));
}

interface CommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const CommandList = forwardRef<CommandListRef, CommandListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  const downHandler = () => {
    setSelectedIndex((prev) => (prev + 1) % items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    const container = containerRef.current;
    const item = itemRefs.current[selectedIndex];
    if (!container || !item) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    if (itemTop < containerTop) {
      container.scrollTop = itemTop;
    } else if (itemBottom > containerBottom) {
      container.scrollTop = itemBottom - container.clientHeight;
    }
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }
      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }
      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  return (
    <Paper
      ref={containerRef}
      elevation={8}
      sx={{
        width: 300,
        maxHeight: 380,
        overflow: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
        bgcolor: 'background.paper',
      }}
    >
      <Typography
        variant="overline"
        sx={{
          px: 1.5,
          py: 0.75,
          display: 'block',
          color: 'text.secondary',
          fontWeight: 700,
          letterSpacing: 0.4,
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        Wstaw komponent
      </Typography>
      <List dense disablePadding>
        {items.length > 0 ? (
          items.map((item, index) => (
            // Index key: plugin templates from different plugins can share a
            // title (e.g. two galleries both contribute "Status polaczenia"),
            // and duplicate keys leave stale ghost rows on filter changes.
            <ListItem
              key={index}
              disablePadding
              ref={(el) => {
                itemRefs.current[index] = el as HTMLDivElement | null;
              }}
            >
              <ListItemButton
                selected={index === selectedIndex}
                onClick={() => selectItem(index)}
                sx={{
                  '&.Mui-selected': {
                    bgcolor: 'action.selected',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.title}
                  secondary={item.description}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            </ListItem>
          ))
        ) : (
          <ListItem>
            <ListItemText
              primary="No results"
              primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
            />
          </ListItem>
        )}
      </List>
    </Paper>
  );
});

CommandList.displayName = 'CommandList';

function buildSuggestionConfig(
  createPageRef?: { current: ((path: string) => Promise<void>) | undefined },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertEventRef?: { current: ((editor: any, range: any) => void) | undefined },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insertTaskCardRef?: { current: ((editor: any, range: any) => void) | undefined },
  scriptTemplatesRef?: { current: (() => ScriptTemplate[]) | undefined }
): Omit<SuggestionOptions, 'editor'> {
  const pageCommand: CommandItem = {
    title: 'Page',
    description: 'Create and link a new page',
    icon: <InsertDriveFileIcon color="primary" />,
    command: ({ editor, range }) => {
      const input = window.prompt('Page path (e.g. notes/my-page or my-page)');
      if (!input) return;
      const path = input.endsWith('.md') ? input : `${input}.md`;
      const label = path.replace(/\.md$/, '').split('/').pop() ?? path;
      const from = range.from;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContentAt(from, label)
        .setTextSelection({ from, to: from + label.length })
        .setLink({ href: path })
        .setTextSelection(from + label.length)
        .run();
      createPageRef?.current?.(path);
    },
  };

  return {
    char: '/',
    // Puste linie z wczytanego markdownu zawierają twardą spację (U+00A0, z konwersji
    // pustego akapitu na `&nbsp;`). Domyślnie paleta wyzwala się tylko na początku bloku
    // lub po zwykłej spacji — dodajemy twardą spację, by `/` działało też na takich liniach.
    allowedPrefixes: [' ', '\u00A0'],
    command: ({ editor, range, props }) => {
      props.command({ editor, range });
    },
    items: ({ query }) => {
      // Event-from-task — defers to the host (MdEditor) which renders a
      // proper picker dialog. Falls back to a no-op if the host didn't
      // wire `insertEventRef` (older host = command quietly disabled).
      // Important: delete the slash trigger *before* opening the dialog so
      // ProseMirror's Suggestion plugin sees the query disappear and closes
      // the floating palette — otherwise the dialog overlays it.
      const eventCommand: CommandItem = {
        title: 'Event',
        description: 'Wstaw event (datę/czas) powiązany z zadaniem z PIM/Projects',
        icon: <EventIcon color="primary" />,
        command: ({ editor, range }) => {
          const from = range.from;
          editor.chain().focus().deleteRange(range).run();
          // Pass a collapsed range pointing at the deletion site so the
          // dialog inserts exactly where the `/event` trigger used to be.
          insertEventRef?.current?.(editor, { from, to: from });
        },
      };
      // Karta zadania — jak `/event`, gospodarz pokazuje okno wyboru. Trigger
      // kasujemy przed otwarciem, żeby paleta zdążyła się zamknąć i nie
      // została pod oknem.
      const taskCardCommand: CommandItem = {
        title: 'Karta zadania',
        description: 'Wstaw kartę zadania z PIM/Zadania — status, termin, postęp',
        icon: <TaskAltIcon color="primary" />,
        command: ({ editor, range }) => {
          const from = range.from;
          editor.chain().focus().deleteRange(range).run();
          insertTaskCardRef?.current?.(editor, { from, to: from });
        },
      };
      const templates = scriptTemplatesRef?.current?.() ?? [];
      const all = [
        pageCommand,
        eventCommand,
        taskCardCommand,
        ...commands,
        ...buildPluginTemplateCommands(templates),
      ];
      return all.filter((item) => item.title.toLowerCase().startsWith(query.toLowerCase()));
    },
    render: () => {
      let component: ReactRenderer | null = null;
      let popup: TippyInstance[] | null = null;
      // Aktualna funkcja rectu (zmienia się między onStart a onUpdate) + ostatnia sensowna
      // pozycja. Zapobiega „skakaniu" palety gdy clientRect chwilowo zwróci pusty rect.

      let rectFn: (() => DOMRect | null) | null = null;
      let lastRect: DOMRect | null = null;
      const cursorRect = (): DOMRect => {
        const r = rectFn?.() ?? null;
        if (r && (r.width || r.height || r.top || r.left || r.right || r.bottom)) lastRect = r;
        return lastRect ?? new DOMRect(0, 0, 0, 0);
      };
      // Widoczny obszar (na mobile pomniejszony o wysuniętą klawiaturę).
      const vp = () => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        return {
          left: vv ? vv.offsetLeft : 0,
          top: vv ? vv.offsetTop : 0,
          width: vv ? vv.width : typeof window !== 'undefined' ? window.innerWidth : 0,
          height: vv ? vv.height : typeof window !== 'undefined' ? window.innerHeight : 0,
        };
      };
      // Rect referencyjny = PUNKT na środku widoku (poziomo), na wysokości kursora →
      // paleta jest wyśrodkowana na stronie, a nie doklejona do kursora.
      const getRect = (): DOMRect => {
        const c = cursorRect();
        const v = vp();
        return new DOMRect(v.left + v.width / 2, c.top, 0, Math.max(0, c.bottom - c.top));
      };
      // Kursor w górnej ~35% widocznego obszaru → za mało miejsca nad nim → menu POD
      // kursorem; w przeciwnym razie NAD kursorem (uwzględnia wysuniętą klawiaturę).
      const pickPlacement = (): 'top' | 'bottom' => {
        const c = cursorRect();
        const v = vp();
        return c.top - v.top < v.height * 0.35 ? 'bottom' : 'top';
      };

      return {
        onStart: (props) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rectFn = props.clientRect as any;
          component = new ReactRenderer(CommandList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy('body', {
            getReferenceClientRect: getRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: pickPlacement(),
            maxWidth: 'none',
            offset: [0, 6],
            // iOS Safari fixes
            touch: true,
            hideOnClick: false,
            onShow(instance) {
              const vv = window.visualViewport;
              if (!vv) return;
              const update = () => instance.popperInstance?.update();
              // Both `resize` (height change when keyboard opens/closes) AND
              // `scroll` (Android often fires scroll before resize) matter — the
              // popper position needs to track both for a smooth experience.
              vv.addEventListener('resize', update);
              vv.addEventListener('scroll', update);
              (instance as any)._vvCleanup = () => {
                vv.removeEventListener('resize', update);
                vv.removeEventListener('scroll', update);
              };
            },
            onHide(instance) {
              (instance as any)._vvCleanup?.();
            },
            popperOptions: {
              strategy: 'fixed',
              modifiers: [
                {
                  name: 'flip',
                  options: {
                    // Wyłącznie wyśrodkowane warianty — inaczej flip zepsułby
                    // wyśrodkowanie palety na stronie (żadnych -start/-end).
                    fallbackPlacements: ['top', 'bottom'],
                  },
                },
                {
                  name: 'preventOverflow',
                  options: {
                    boundary: 'viewport',
                    padding: 8,
                  },
                },
                // Cap the popper height to whatever the visual viewport can
                // actually show above OR below the cursor. Without this, even
                // a perfect top/bottom flip leaves the bottom half of a tall
                // palette hidden under the keyboard.
                {
                  name: 'capHeight',
                  enabled: true,
                  phase: 'beforeWrite' as const,
                  requires: ['computeStyles'],
                  fn({ state }: { state: any }) {
                    const vv = window.visualViewport;
                    if (!vv) return;
                    const refTop = state.rects?.reference?.top ?? 0;
                    const refBottom = state.rects?.reference?.bottom ?? refTop;
                    const visibleTop = vv.offsetTop;
                    const visibleBottom = vv.offsetTop + vv.height;
                    const spaceAbove = Math.max(0, refTop - visibleTop - 12);
                    const spaceBelow = Math.max(0, visibleBottom - refBottom - 12);
                    const maxH = Math.max(spaceAbove, spaceBelow);
                    const popperEl: HTMLElement | undefined = state.elements?.popper;
                    if (!popperEl) return;
                    // Only constrain if it actually helps — avoid setting maxH on
                    // tall desktops where the palette fits naturally.
                    if (maxH > 100) {
                      popperEl.style.maxHeight = `${Math.min(maxH, 480)}px`;
                      popperEl.style.overflowY = 'auto';
                    }
                  },
                },
                // Keep popup inside the visual viewport. Runs after capHeight
                // so we already know the popper is shrinkable to fit.
                {
                  name: 'visualViewportFix',
                  enabled: true,
                  phase: 'beforeWrite' as const,
                  requires: ['computeStyles'],
                  fn({ state }: { state: any }) {
                    const vv = window.visualViewport;
                    if (!vv) return;
                    const visibleTop = vv.offsetTop + 8;
                    const visibleBottom = vv.offsetTop + vv.height - 8;
                    const styles = state.styles?.popper;
                    if (!styles) return;
                    const top = parseFloat(styles.top ?? '0');
                    const popperEl: HTMLElement | undefined = state.elements?.popper;
                    // After capHeight clamps the element, prefer measured height
                    // over the popper's pre-clamp computed height.
                    const popperHeight =
                      popperEl?.getBoundingClientRect().height ?? state.rects?.popper?.height ?? 0;
                    const refTop = state.rects?.reference?.top ?? top;
                    const refBottom = state.rects?.reference?.bottom ?? refTop;

                    if (top + popperHeight > visibleBottom) {
                      // Try flipping above the caret.
                      const aboveTop = refTop - popperHeight - 8;
                      if (aboveTop >= visibleTop) {
                        styles.top = `${aboveTop}px`;
                      } else {
                        // Doesn't fit either way — pin to top of visible area.
                        styles.top = `${visibleTop}px`;
                      }
                    } else if (top < visibleTop) {
                      // The popper went off the top — pin below the caret instead.
                      if (refBottom + popperHeight + 8 <= visibleBottom) {
                        styles.top = `${refBottom + 8}px`;
                      } else {
                        styles.top = `${visibleTop}px`;
                      }
                    }
                  },
                },
              ],
            },
          });
        },

        onUpdate: (props) => {
          component?.updateProps(props);
          if (!props.clientRect) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rectFn = props.clientRect as any;
          // Przelicz pozycję (środek widoku) i stronę (nad/pod kursorem).
          popup?.[0]?.setProps({ getReferenceClientRect: getRect, placement: pickPlacement() });
        },

        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }

          return (component?.ref as CommandListRef)?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  };
}

const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: buildSuggestionConfig(),
      createPageRef: undefined,
      insertEventRef: undefined,
      insertTaskCardRef: undefined,
      scriptTemplatesRef: undefined,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...buildSuggestionConfig(
          this.options.createPageRef,
          this.options.insertEventRef,
          this.options.insertTaskCardRef,
          this.options.scriptTemplatesRef
        ),
      }),
    ];
  },
});

export default SlashCommands;
