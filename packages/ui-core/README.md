# `@hestia/ui-core`

React components meant to be used in more than one place. The rule for what
belongs here is the same as for `@hestia/core`: **nothing about any one
application**. A component lands here when a second application needs it, or
when it is plainly general from the start — not in the hope that one day
something might.

React, MUI and Emotion are peers: the host has them anyway, and a second copy of
React breaks hooks in a way whose symptom (a blank screen) says nothing about the
cause.

## `Toolbar`

One tree of nodes, drawn as a **menu bar** or as a **floating palette**, in
either orientation.

```tsx
import { Toolbar, item, submenu, separator, toggle } from '@hestia/ui-core';

const menu = [
  submenu('file', 'File', [
    item('new', 'New', { shortcut: 'Ctrl+N', onSelect: startNew }),
    item('open', 'Open…', { onSelect: open }),
    separator('s1'),
    submenu('export', 'Export', [
      item('png', 'PNG', { onSelect: () => exportAs('png') }),
      item('svg', 'SVG', { onSelect: () => exportAs('svg') }),
    ]),
  ]),
  submenu('view', 'View', [
    toggle('grid', 'Grid', showGrid, { onChange: setShowGrid }),
  ]),
];

<Toolbar nodes={menu} />                                   {/* a menu bar */}
<Toolbar nodes={tools} variant="floating" orientation="vertical" />  {/* a palette */}
```

### The tree

Four kinds of node, and the kind is what a node **is**, not how it looks:

| Kind | What it is |
| ---- | ---------- |
| `item` | Something to do (`onSelect`), or to open (`children`), or both |
| `toggle` | Something that is on or off; `group` makes a set behave as radio buttons. With `children` it is a **split button**: the button turns the thing on, the arrow offers the variants |
| `separator` | A line between groups |
| `custom` | Anything the tree has no vocabulary for — a colour picker, a zoom readout — handed back to the host to render |

`splitToggle(id, label, checked, variants)` names that last case; it is the same
node as `toggle(..., { children })`. A tool palette is what it is for: the
button shows and sets which tool is on, while the arrow offers the kinds of it —
without it, the node showing the state would not be the node being clicked.

There is **no separate `menu` or `submenu` kind**. A submenu is an item that
happens to have children, which is how menus behave everywhere: the top-level
"File" is the same kind of thing as "Export" inside it. Nesting goes as deep as
the tree does.

Every node may carry `label`, `icon`, `title`, `shortcut`, `disabled` and
`hidden`. The icon is kept without being looked at — a React element, an SVG, a
name for the host to resolve — and handed back through `renderIcon` when drawn,
so the package needs no opinion about what an icon is.

### The model is separate from the drawing

`model.ts` is plain TypeScript: constructors (`item`, `submenu`, `toggle`,
`separator`, `custom`), readers (`findNode`, `findPath`, `walk`, `hasSubmenu`,
`isActionable`, `titleOf`) and two rules worth being sure of:

- **`visibleNodes`** drops hidden nodes, and with them the separators that would
  be left leading, trailing or doubled. A menu that adapts to what is going on
  grows stray lines otherwise: hide the only item between two separators and the
  result is two rules against each other.
- **`applyToggle`** sets one toggle and turns off its siblings in the same
  group, returning a new tree. The radio rule lives here rather than in the
  drawing, because a caller keeping its toggles in state needs the same rule,
  and a rule written twice is a rule that will differ. A group is allowed to end
  up with nothing chosen — turning the chosen one off is something a person can
  do, and choosing another in its place would be the toolbar deciding for them.

Because the tree is data, it can be built on a server, kept in a file, or
checked in a test without rendering anything.

### Props

| Prop | Default | What it is |
| ---- | ------- | ---------- |
| `nodes` | — | The tree |
| `orientation` | `horizontal` | `horizontal` or `vertical` |
| `variant` | `bar` | `bar` sits in the layout; `floating` hovers over what it acts on |
| `display` | `label` in a bar, `icon` when floating | `icon`, `label` or `both`. Inside an open menu there is always a label |
| `renderCustom` | — | Draws a `custom` node |
| `renderIcon` | — | Turns whatever `icon` holds into something to draw |
| `onAction` | — | Called after any item is chosen |
| `scrollable` | `true` | A toolbar too long for its space scrolls, and a finger drags it |
| `sx` | — | Styles for the container; this is how a floating palette is positioned |

`MenuBar` and `FloatingToolbar` are the same component with `variant` fixed.

### Where the arrow goes

A node that opens a submenu shows an arrow. Beside the label when there is one;
**inside the button, in its corner** when there is not. Inline on an icon-only
button the arrow widens it past the strip that holds it, and in a narrow
vertical palette the arrows end up hanging off the side, over whatever is
underneath — which is exactly what FreeCAD's corner mark avoids.

### When it does not fit

A row of buttons wider than the window simply ends, and the ones past the edge
are not merely hard to reach — they are invisible and unreachable. So a toolbar
scrolls along its own length by default: a finger drags it (`touchAction` allows
that axis and leaves the other to the page), a wheel and a trackpad work as they
do anywhere, and the scrollbar is kept thin and out of the way, because a grey
band across a toolbar of six buttons looks like a fault. Nothing wraps onto a
second line: that would move every button below it while somebody is reaching
for one.

## `Drive`

A file list on the left, what the file holds on the right. MyCastle's Drive page
without what was wrapped around it — no Monaco and its plugins, no AI agent, no
Markdown or JSON editors. What is left is walking the tree, the ordinary file
operations (new folder, new file, rename, delete) and **seeing** a file: text,
an image, a PDF, and an honest "no preview for this kind" for the rest.

```tsx
<Drive store={store} />
```

Editing is deliberately absent. A page that only ever looks at a file would
otherwise carry the whole of Monaco; when an editor is wanted it can arrive as a
slot, for the host to fill with whichever one it already has.

### `DriveStore`

The component **cannot reach for a file system itself** — the one in
`@hestia/node-core` is Node code (`node:fs`), and this runs in a page. So the
host supplies a store, and in Hestia that store talks to the platform over
`/platform/api/vfs/*`, where the thing answering is exactly that `FileSystem`.

| Member | Required | Used for |
| ------ | -------- | -------- |
| `list(dir)` | yes | The listing. A directory that does not exist yet is `[]`, not an error. |
| `read(path)` | yes | Text files. |
| `readBytes?(path)` | no | Images and PDFs. Absent: they are listed, and the panel says why it cannot draw them. |
| `write?` / `remove?` / `rename?` / `createDir?` | no | The file operations. **A missing one draws no button** — one that always ends in an error promises something that will not happen. |
| `urlFor?(path)` | no | An address to open a file at, for what the drive cannot show itself. |
| `startDir?` | no | Where it opens. |

Paths are relative to the store's own root, `/` between segments, no leading
slash. Where that root sits is the host's business.

## Status

- ✅ The model is covered by tests — the visibility and toggle rules in
  particular, because those are what a caller would otherwise get subtly wrong.
- The components are not rendered in tests: that needs jsdom and a testing
  library, and what would be asserted (a menu opens below its button) is mostly
  what MUI's `Popper` does rather than what this code does.
- 🚧 Keyboard navigation inside an open menu (arrows, Home/End, type-ahead) is
  not there yet; Escape closes and Tab moves through the bar as it would through
  buttons.

## What moved out

`viewer/sci-core/` and `viewer/sci-blocks/` were here and are now
`@hestia/core-sci` and `@hestia/ui-sci-blocks`; `viewer/scene3d/` and
`viewer/layout/` are `@hestia/ui-scene3d`. Between them they had put mathjs, a
computer-algebra engine, KaTeX, MathLive and three into this package's
manifest — and a package of React components used across applications is the
wrong place for any of it. What is left has no dependency beyond its peers: the
toolbar and the drive.
