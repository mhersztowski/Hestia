import TurndownService from 'turndown';
import Showdown from 'showdown';
import {
  extractCallouts,
  calloutToMarkdown,
  isCalloutVariant,
  type CalloutVariant,
} from './callout';

const showdownConverter = new Showdown.Converter({
  tables: true,
  tasklists: true,
  strikethrough: true,
  ghCodeBlocks: true,
  simplifiedAutoLink: true,
  excludeTrailingPunctuationFromURLs: true,
  literalMidWordUnderscores: true,
  simpleLineBreaks: false,
});

// Helper to escape math content to protect it from showdown
function escapeMathForHtml(content: string): string {
  // Temporarily replace math blocks with placeholders
  const mathBlocks: string[] = [];
  const mathInlines: string[] = [];

  // Replace block math ($$...$$) first
  let result = content.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    mathBlocks.push(latex.trim());
    return `%%MATHBLOCK_${mathBlocks.length - 1}%%`;
  });

  // Replace inline math ($...$) - but not $$ which are already replaced
  result = result.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
    mathInlines.push(latex.trim());
    return `%%MATHINLINE_${mathInlines.length - 1}%%`;
  });

  return JSON.stringify({ result, mathBlocks, mathInlines });
}

// Helper to escape component embeds to protect them from showdown
function escapeComponentEmbedsForHtml(content: string): string {
  const componentEmbeds: { type: string; id: string }[] = [];

  // Replace @[type:id] syntax with placeholders
  // Matches: @[person:uuid-123], @[task:abc], @[project:xyz], @[person:] (empty id)
  const result = content.replace(/@\[(person|task|project):([^\]]*)\]/g, (_, type, id) => {
    componentEmbeds.push({ type, id: id.trim() });
    return `%%COMPONENTEMBED_${componentEmbeds.length - 1}%%`;
  });

  return JSON.stringify({ result, componentEmbeds });
}

// ─── EventBlock fence ────────────────────────────────────────────────────────
// Pulls ```event …``` fences out of the markdown before showdown runs, then
// re-injects them as <div data-type="event-block" data-…="…"> HTML so the
// TipTap EventBlock node can parse them back into structured attrs.

interface EventBlockEscaped {
  eventName: string;
  start: string;
  end: string;
  description: string;
  taskId: string;
  taskName: string;
  projectName: string;
}

function escapeEventBlocksForHtml(content: string): {
  result: string;
  events: EventBlockEscaped[];
} {
  const events: EventBlockEscaped[] = [];
  const result = content.replace(/```event\s*\n([\s\S]*?)```/g, (_, json: string) => {
    let parsed: Partial<EventBlockEscaped> = {};
    try {
      parsed = JSON.parse(json.trim()) as Partial<EventBlockEscaped>;
    } catch {
      /* malformed JSON — store empty event so the placeholder still
                 round-trips instead of bleeding into surrounding markdown. */
    }
    events.push({
      eventName: String(parsed.eventName ?? ''),
      start: String(parsed.start ?? ''),
      end: String(parsed.end ?? ''),
      description: String(parsed.description ?? ''),
      taskId: String(parsed.taskId ?? ''),
      taskName: String(parsed.taskName ?? ''),
      projectName: String(parsed.projectName ?? ''),
    });
    return `%%EVENTBLOCK_${events.length - 1}%%`;
  });
  return { result, events };
}

// ─── TaskCard fence ──────────────────────────────────────────────────────────
// Karta zadania trzyma w pliku wyłącznie `taskId` i nazwę — reszta danych jest
// czytana na żywo przy renderze (patrz TaskCardExtension). Dzięki temu notatka
// sprzed miesiąca pokazuje dzisiejszy stan zadania, a nie zamrożony.

interface TaskCardEscaped {
  taskId: string;
  taskName: string;
}

function escapeTaskCardsForHtml(content: string): { result: string; cards: TaskCardEscaped[] } {
  const cards: TaskCardEscaped[] = [];
  const result = content.replace(/```taskcard\s*\n([\s\S]*?)```/g, (_, json: string) => {
    let parsed: Partial<TaskCardEscaped> = {};
    try {
      parsed = JSON.parse(json.trim()) as Partial<TaskCardEscaped>;
    } catch {
      /* uszkodzony JSON — pusta karta i tak przejdzie w obie strony,
                 zamiast rozlać się po sąsiednim markdownie */
    }
    cards.push({
      taskId: String(parsed.taskId ?? ''),
      taskName: String(parsed.taskName ?? ''),
    });
    return `%%TASKCARD_${cards.length - 1}%%`;
  });
  return { result, cards };
}

function restoreTaskCardsFromHtml(html: string, cards: TaskCardEscaped[]): string {
  let result = html;
  cards.forEach((card, index) => {
    const attrs: string[] = ['data-type="task-card"'];
    if (card.taskId) attrs.push(`data-task-id="${encodeURIComponent(card.taskId)}"`);
    if (card.taskName) attrs.push(`data-task-name="${encodeURIComponent(card.taskName)}"`);
    const htmlTag = `<div ${attrs.join(' ')}></div>`;
    const placeholder = `%%TASKCARD_${index}%%`;
    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    result = result.replace(placeholder, htmlTag);
  });
  return result;
}

function restoreEventBlocksFromHtml(html: string, events: EventBlockEscaped[]): string {
  let result = html;
  events.forEach((ev, index) => {
    const attrs: string[] = ['data-type="event-block"'];
    const push = (key: string, val: string) => {
      if (val) attrs.push(`${key}="${encodeURIComponent(val)}"`);
    };
    push('data-event-name', ev.eventName);
    push('data-start', ev.start);
    push('data-end', ev.end);
    push('data-description', ev.description);
    push('data-task-id', ev.taskId);
    push('data-task-name', ev.taskName);
    push('data-project-name', ev.projectName);
    const htmlTag = `<div ${attrs.join(' ')}></div>`;
    const placeholder = `%%EVENTBLOCK_${index}%%`;
    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    result = result.split(placeholder).join(htmlTag);
  });
  return result;
}

// ─── PhotoMap fence ───────────────────────────────────────────────────────────
// ```photomap {…json config…}``` ⇄ <div data-type="photo-map" data-config="…">
// so the TipTap PhotoMap node round-trips its whole state through markdown.

function escapePhotoMapsForHtml(content: string): { result: string; photoMaps: string[] } {
  const photoMaps: string[] = [];
  const result = content.replace(/```photomap\s*\n([\s\S]*?)```/g, (_, json: string) => {
    photoMaps.push(json.trim());
    return `%%PHOTOMAP_${photoMaps.length - 1}%%`;
  });
  return { result, photoMaps };
}

function restorePhotoMapsFromHtml(html: string, photoMaps: string[]): string {
  let result = html;
  photoMaps.forEach((cfg, index) => {
    const htmlTag = `<div data-type="photo-map" data-config="${encodeURIComponent(cfg)}"></div>`;
    const placeholder = `%%PHOTOMAP_${index}%%`;
    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    result = result.split(placeholder).join(htmlTag);
  });
  return result;
}

// Helper to escape UI form embeds to protect them from showdown
function escapeUIFormsForHtml(content: string): string {
  const uiForms: { id: string; inline?: string }[] = [];

  // Match @[uiform:form-id] syntax (simple reference)
  let result = content.replace(/@\[uiform:([^\]{][^\]]*)\]/g, (_, id) => {
    uiForms.push({ id: id.trim() });
    return `%%UIFORM_${uiForms.length - 1}%%`;
  });

  // Match @[uiform:{...}] inline JSON syntax
  result = result.replace(/@\[uiform:(\{[\s\S]*?\})\]/g, (_, json) => {
    uiForms.push({ id: '', inline: json });
    return `%%UIFORM_${uiForms.length - 1}%%`;
  });

  return JSON.stringify({ result, uiForms });
}

// Helper to restore UI forms after showdown conversion
function restoreUIFormsFromHtml(html: string, uiForms: { id: string; inline?: string }[]): string {
  let result = html;

  uiForms.forEach((form, index) => {
    const attrs = form.inline
      ? `data-type="ui-form-embed" data-inline="${encodeURIComponent(form.inline)}"`
      : `data-type="ui-form-embed" data-form-id="${form.id}"`;

    const htmlTag = `<div ${attrs}></div>`;
    const placeholder = `%%UIFORM_${index}%%`;

    // Handle placeholder wrapped in paragraph
    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    // Handle standalone placeholder
    result = result.split(placeholder).join(htmlTag);
  });

  return result;
}

// Helper to escape CAD view embeds (@[cad:{mode}:{value}]) from showdown.
// `value` is the vfs path for native embeds, or a legacy full viewer URL —
// distinguished on restore by the `http(s)://` prefix.
function escapeCadViewEmbedsForHtml(content: string): string {
  const cadViews: { mode: string; value: string }[] = [];
  const result = content.replace(/@\[cad:([^\]]+)\]/g, (_, params) => {
    const firstColon = params.indexOf(':');
    const mode = firstColon >= 0 ? params.slice(0, firstColon) : params;
    const value = firstColon >= 0 ? params.slice(firstColon + 1) : '';
    cadViews.push({ mode: mode || 'scene3d', value });
    return `%%CADVIEW_${cadViews.length - 1}%%`;
  });
  return JSON.stringify({ result, cadViews });
}

// Helper to restore CAD view embeds after showdown conversion
function restoreCadViewEmbedsFromHtml(
  html: string,
  cadViews: { mode: string; value: string }[]
): string {
  let result = html;
  cadViews.forEach((v, i) => {
    const attr = /^https?:\/\//i.test(v.value) ? `data-url="${v.value}"` : `data-path="${v.value}"`;
    const tag = `<div data-type="cad-view-embed" data-mode="${v.mode}" ${attr}></div>`;
    const ph = `%%CADVIEW_${i}%%`;
    result = result.replace(`<p>${ph}</p>`, tag);
    result = result.split(ph).join(tag);
  });
  return result;
}

// Helper to escape Web embeds (@[web:mode:value]) from showdown.
// Format: @[web:{mode}:{value}] — split only on first colon after mode.
function escapeWebEmbedsForHtml(content: string): string {
  const webEmbeds: { mode: string; value: string }[] = [];
  const result = content.replace(/@\[web:([^\]]+)\]/g, (_, params) => {
    const firstColon = params.indexOf(':');
    const mode = firstColon >= 0 ? params.slice(0, firstColon) : params;
    const value = firstColon >= 0 ? params.slice(firstColon + 1) : '';
    webEmbeds.push({ mode: mode || 'url', value });
    return `%%WEBEMBED_${webEmbeds.length - 1}%%`;
  });
  return JSON.stringify({ result, webEmbeds });
}

function restoreWebEmbedsFromHtml(
  html: string,
  webEmbeds: { mode: string; value: string }[]
): string {
  let result = html;
  webEmbeds.forEach((v, i) => {
    const tag = `<div data-type="web-embed" data-mode="${v.mode}" data-value="${v.value}"></div>`;
    const ph = `%%WEBEMBED_${i}%%`;
    result = result.replace(`<p>${ph}</p>`, tag);
    result = result.split(ph).join(tag);
  });
  return result;
}

// Gallery embeds: @[gallery:{provider}:{source}] — provider is immich|gphotos,
// source is the public share URL (may contain ':' and '/', so split once).
function escapeGalleriesForHtml(content: string): {
  result: string;
  galleries: { provider: string; source: string; selected: string }[];
} {
  const galleries: { provider: string; source: string; selected: string }[] = [];
  const result = content.replace(/@\[gallery:([^\]]+)\]/g, (_m, params: string) => {
    const firstColon = params.indexOf(':');
    const provider = firstColon >= 0 ? params.slice(0, firstColon) : params;
    const rest = firstColon >= 0 ? params.slice(firstColon + 1) : '';
    // Optional `|selectedKeys` after the source (URLs never contain a raw '|').
    const pipeIdx = rest.indexOf('|');
    const source = pipeIdx >= 0 ? rest.slice(0, pipeIdx) : rest;
    const selected = pipeIdx >= 0 ? rest.slice(pipeIdx + 1) : '';
    galleries.push({ provider, source, selected });
    return `%%GALLERY_${galleries.length - 1}%%`;
  });
  return { result, galleries };
}

function restoreGalleriesFromHtml(
  html: string,
  galleries: { provider: string; source: string; selected: string }[]
): string {
  let result = html;
  const enc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  galleries.forEach((g, i) => {
    const selAttr = g.selected ? ` data-selected="${enc(g.selected)}"` : '';
    const tag = `<div data-type="gallery-embed" data-provider="${enc(g.provider)}" data-source="${enc(g.source)}"${selAttr}></div>`;
    result = result.split(`<p>%%GALLERY_${i}%%</p>`).join(tag).split(`%%GALLERY_${i}%%`).join(tag);
  });
  return result;
}

// TableView blocks: @[tableview:<encodeURIComponent(JSON)>] — config already
// URI-encoded so it never contains a raw ']'.
function escapeTableViewsForHtml(content: string): { result: string; tables: string[] } {
  const tables: string[] = [];
  const result = content.replace(/@\[tableview:([^\]]+)\]/g, (_m, cfg: string) => {
    tables.push(cfg);
    return `%%TABLEVIEW_${tables.length - 1}%%`;
  });
  return { result, tables };
}

function restoreTableViewsFromHtml(html: string, tables: string[]): string {
  let result = html;
  const enc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  tables.forEach((cfg, i) => {
    const tag = `<div data-type="table-view" data-config="${enc(cfg)}"></div>`;
    result = result
      .split(`<p>%%TABLEVIEW_${i}%%</p>`)
      .join(tag)
      .split(`%%TABLEVIEW_${i}%%`)
      .join(tag);
  });
  return result;
}

// ─── InfoMark inline embed ──────────────────────────────────────────────────
// Format: @[info:{encodedText}:{encodedTitle}:{encodedBody}:{encodedBodyPath}]
// — four URL-encoded segments joined by ':'. Older 3-segment infomarks
// (without bodyPath) parse correctly too (4th segment defaults to '').
// Encoding each segment individually means colons, brackets, newlines and
// slashes (paths!) in any segment don't break the bracket-paired syntax.
function escapeInfoMarksForHtml(content: string): string {
  const infoMarks: { text: string; title: string; body: string; bodyPath: string }[] = [];
  const result = content.replace(/@\[info:([^\]]+)\]/g, (_, params: string) => {
    const parts = params.split(':');
    const dec = (s: string | undefined) => {
      if (!s) return '';
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    infoMarks.push({
      text: dec(parts[0]),
      title: dec(parts[1]),
      body: dec(parts[2]),
      bodyPath: dec(parts[3]),
    });
    return `%%INFOMARK_${infoMarks.length - 1}%%`;
  });
  return JSON.stringify({ result, infoMarks });
}

function restoreInfoMarksFromHtml(
  html: string,
  infoMarks: { text: string; title: string; body: string; bodyPath: string }[]
): string {
  let result = html;
  infoMarks.forEach((m, i) => {
    // Both data-text AND inner text so a non-TipTap renderer (raw markdown
    // preview, search) still shows the visible label. data-text is canonical.
    const tag =
      `<span data-type="info-mark"` +
      ` data-text="${encodeURIComponent(m.text)}"` +
      ` data-title="${encodeURIComponent(m.title)}"` +
      ` data-body="${encodeURIComponent(m.body)}"` +
      ` data-body-path="${encodeURIComponent(m.bodyPath)}">` +
      // Escape HTML-significant chars in the visible text so a "<" in a
      // user-typed marker doesn't get interpreted as a tag during the
      // showdown → TipTap reparse.
      m.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
      `</span>`;
    const ph = `%%INFOMARK_${i}%%`;
    // InfoMark is INLINE — no `<p>${ph}</p>` wrapping cleanup needed; just
    // splice the raw placeholder wherever showdown left it inside <p>/<li>.
    result = result.split(ph).join(tag);
  });
  return result;
}

// File chips: @[file:path|env|format] (inline span). Path may contain '/' and ':'
// so segments are split on '|' (never URL-safe in a path).
function escapeFileRefsForHtml(content: string): {
  result: string;
  files: { path: string; env: string; format: string }[];
} {
  const files: { path: string; env: string; format: string }[] = [];
  const result = content.replace(/@\[file:([^\]]+)\]/g, (_m, params: string) => {
    const [path = '', env = '', format = ''] = params.split('|');
    files.push({ path, env, format });
    return `%%FILEREF_${files.length - 1}%%`;
  });
  return { result, files };
}
function restoreFileRefsFromHtml(
  html: string,
  files: { path: string; env: string; format: string }[]
): string {
  let result = html;
  const enc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  files.forEach((f, i) => {
    const tag = `<span data-type="file-ref" data-path="${enc(f.path)}"${f.env ? ` data-env="${enc(f.env)}"` : ''}${f.format ? ` data-format="${enc(f.format)}"` : ''}></span>`;
    result = result.split(`%%FILEREF_${i}%%`).join(tag);
  });
  return result;
}

// Env-value markers: {{env:name}} (inline span).
function escapeEnvValuesForHtml(content: string): { result: string; envs: string[] } {
  const envs: string[] = [];
  const result = content.replace(/\{\{env:([^}]+)\}\}/g, (_m, name: string) => {
    envs.push(name.trim());
    return `%%ENVVAL_${envs.length - 1}%%`;
  });
  return { result, envs };
}
function restoreEnvValuesFromHtml(html: string, envs: string[]): string {
  let result = html;
  const enc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  envs.forEach((name, i) => {
    result = result
      .split(`%%ENVVAL_${i}%%`)
      .join(`<span data-type="env-value" data-name="${enc(name)}"></span>`);
  });
  return result;
}

// Helper to escape form-engine embeds (@[form:path]) to protect them from showdown
function escapeFormEngineEmbedsForHtml(content: string): string {
  const formEmbeds: string[] = [];
  const result = content.replace(/@\[form:([^\]]+)\]/g, (_, path) => {
    formEmbeds.push(path.trim());
    return `%%FORMEMBED_${formEmbeds.length - 1}%%`;
  });
  return JSON.stringify({ result, formEmbeds });
}

// Helper to restore form-engine embeds after showdown conversion
function restoreFormEngineEmbedsFromHtml(html: string, formEmbeds: string[]): string {
  let result = html;
  formEmbeds.forEach((path, index) => {
    const htmlTag = `<div data-type="form-engine-embed" data-form-path="${path}"></div>`;
    const placeholder = `%%FORMEMBED_${index}%%`;
    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    result = result.split(placeholder).join(htmlTag);
  });
  return result;
}

// Helper to restore component embeds after showdown conversion
function restoreComponentEmbedsFromHtml(
  html: string,
  componentEmbeds: { type: string; id: string }[]
): string {
  let result = html;

  componentEmbeds.forEach((embed, index) => {
    // Use zero-width space inside span to ensure Tiptap recognizes it as a node
    const htmlTag = `<span data-type="component-embed" data-component-type="${embed.type}" data-component-id="${embed.id}">\u200B</span>`;
    const placeholder = `%%COMPONENTEMBED_${index}%%`;

    // Replace all occurrences of the placeholder with the HTML tag
    // This handles placeholders inside paragraphs, standalone, or wrapped
    result = result.split(placeholder).join(htmlTag);
  });

  return result;
}

// Helper to restore math content after showdown conversion
function restoreMathFromHtml(
  html: string,
  mathData: { mathBlocks: string[]; mathInlines: string[] }
): string {
  let result = html;

  // Restore block math
  mathData.mathBlocks.forEach((latex, index) => {
    result = result.replace(
      `%%MATHBLOCK_${index}%%`,
      `<div data-type="math-block" data-latex="${encodeURIComponent(latex)}"></div>`
    );
    // Also handle if it was wrapped in a paragraph
    result = result.replace(
      `<p>%%MATHBLOCK_${index}%%</p>`,
      `<div data-type="math-block" data-latex="${encodeURIComponent(latex)}"></div>`
    );
  });

  // Restore inline math
  mathData.mathInlines.forEach((latex, index) => {
    result = result.replace(
      `%%MATHINLINE_${index}%%`,
      `<span data-type="inline-math" data-latex="${encodeURIComponent(latex)}"></span>`
    );
  });

  return result;
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  // Markdown collapses consecutive blank lines, so an intentionally-empty
  // paragraph (user pressed Enter for vertical spacing) would vanish on reload.
  // Emit a non-breaking-space paragraph for empty <p> so the blank line survives
  // the round-trip. Other blank blocks keep the default behaviour.
  blankReplacement: (_content, node) =>
    (node as unknown as Node).nodeName === 'P'
      ? '\n\n&nbsp;\n\n'
      : (node as { isBlock?: boolean }).isBlock
        ? '\n\n'
        : '',
});

// Preserve relative hrefs — DOMParser resolves relative URLs to absolute,
// but getAttribute('href') returns the original attribute value.
// We use it explicitly to avoid losing relative workspace links.
turndownService.addRule('links', {
  filter: (node) =>
    node.nodeName === 'A' &&
    !!(node as HTMLAnchorElement).getAttribute('href') &&
    (node as HTMLElement).getAttribute('data-wikilink') !== 'true', // wikilinks handled below
  replacement: (content, node) => {
    const href = (node as HTMLAnchorElement).getAttribute('href') ?? '';
    const title = (node as HTMLAnchorElement).getAttribute('title');
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : '';
    return `[${content}](${href}${titlePart})`;
  },
});

// Odsyłacz bazy wiedzy: <span data-type="knowledge-ref"> → ((id)) albo
// ((id|podpis)). Musi stać PRZED regułą linków, bo to osobny element, ale
// kolejność reguł turndown i tak jest po nazwie — trzymamy je razem dla jasności.
turndownService.addRule('knowledgeRef', {
  filter: (node) =>
    node.nodeName === 'SPAN' && (node as HTMLElement).getAttribute('data-type') === 'knowledge-ref',
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const id = el.getAttribute('data-ref-id') ?? '';
    const label = el.getAttribute('data-label') ?? '';
    return label ? `((${id}|${label}))` : `((${id}))`;
  },
});

// Internal (Obsidian-style) links: <a data-wikilink href="drive/notatka.md#…"> →
// [[notatka#…]] (or [[notatka#…|label]] when the visible text was edited). The
// href keeps the full workspace path for navigation; we strip it to the short
// `[[…]]` target here and rebuild it on the way back (see escapeWikiLinksForHtml).
turndownService.addRule('wikiLink', {
  filter: (node) =>
    node.nodeName === 'A' && (node as HTMLElement).getAttribute('data-wikilink') === 'true',
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const href = el.getAttribute('href') ?? '';
    const hashIdx = href.indexOf('#');
    const filePart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    const anchorPart = hashIdx >= 0 ? href.slice(hashIdx) : '';
    const target = filePart.replace(/^drive\//, '').replace(/\.md$/i, '') + anchorPart;
    // Use the RAW text (not turndown's escaped `content`, which would turn e.g.
    // `wl_target` into `wl\_target` and look "edited"). Only emit an alias when
    // the user actually changed the visible text.
    const text = (el.textContent ?? '').trim();
    return text && text !== target ? `[[${target}|${text}]]` : `[[${target}]]`;
  },
});

// Obsidian embed node (<div data-type="md-embed" data-target="…">) → ![[target]]
turndownService.addRule('mdEmbed', {
  filter: (node) =>
    node.nodeName === 'DIV' && (node as HTMLElement).getAttribute('data-type') === 'md-embed',
  replacement: (_content, node) => {
    const target = (node as HTMLElement).getAttribute('data-target') ?? '';
    return target ? `\n\n![[${target}]]\n\n` : '';
  },
});

turndownService.addRule('taskListItems', {
  filter: (node) => {
    return (
      node.nodeName === 'LI' &&
      node.parentNode?.nodeName === 'UL' &&
      (node.parentNode as HTMLElement).classList?.contains('md-editor-task-list')
    );
  },
  replacement: (content, node) => {
    const li = node as HTMLLIElement;
    const checkbox = li.querySelector('input[type="checkbox"]');
    const checked = checkbox?.hasAttribute('checked') || (checkbox as HTMLInputElement)?.checked;
    const marker = checked ? '[x]' : '[ ]';
    return `- ${marker} ${content.trim()}\n`;
  },
});

turndownService.addRule('highlight', {
  filter: 'mark',
  replacement: (content) => `==${content}==`,
});

// Audio rule - handles both NodeView wrappers and plain audio elements from renderHTML
turndownService.addRule('audioNodeView', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Match NodeView wrapper elements
    if (element.classList?.contains('audio-node-wrapper')) return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const audio = element.querySelector('audio');
      if (audio) return true;
    }
    // Match plain audio elements (from renderHTML output)
    if (element.nodeName === 'AUDIO') return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Get the audio element - either from wrapper or direct
    const audio =
      element.nodeName === 'AUDIO'
        ? (element as HTMLAudioElement)
        : (element.querySelector('audio') as HTMLAudioElement);
    if (!audio) return '';

    const src = audio.getAttribute('src') || '';
    const title = audio.getAttribute('data-title') || audio.getAttribute('title') || '';
    const controls = audio.hasAttribute('controls');
    const autoplay = audio.hasAttribute('autoplay');
    const loop = audio.hasAttribute('loop');

    // Skip empty audio
    if (!src) return '';

    // Build HTML audio tag with all attributes
    const attrs: string[] = [`src="${src}"`];
    if (title) attrs.push(`data-title="${title}"`);
    if (controls) attrs.push('controls');
    if (autoplay) attrs.push('autoplay');
    if (loop) attrs.push('loop');

    return `\n<audio ${attrs.join(' ')}></audio>\n`;
  },
});

// Video rule - handles both NodeView wrappers and plain video elements from renderHTML
turndownService.addRule('videoNodeView', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Match NodeView wrapper elements
    if (element.classList?.contains('video-node-wrapper')) return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const video = element.querySelector('video');
      if (video) return true;
    }
    // Match plain video elements (from renderHTML output)
    if (element.nodeName === 'VIDEO') return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Get the video element - either from wrapper or direct
    const video =
      element.nodeName === 'VIDEO'
        ? (element as HTMLVideoElement)
        : (element.querySelector('video') as HTMLVideoElement);
    if (!video) return '';

    const src = video.getAttribute('src') || '';
    const title = video.getAttribute('data-title') || video.getAttribute('title') || '';
    const poster = video.getAttribute('poster') || '';
    const controls = video.hasAttribute('controls');
    const autoplay = video.hasAttribute('autoplay');
    const loop = video.hasAttribute('loop');
    const muted = video.hasAttribute('muted');
    const style = video.getAttribute('style') || '';

    // Skip empty video
    if (!src) return '';

    // Extract width from style
    const widthMatch = style.match(/width:\s*(\d+%?)/);
    const width = widthMatch ? widthMatch[1] : null;

    // Extract alignment from style (default center for video)
    // renderHTML outputs: left = "margin-left: 0; margin-right: auto"
    //                     right = "margin-left: auto; margin-right: 0"
    //                     center = "margin-left: auto; margin-right: auto"
    let align = 'center';
    const hasMarginLeftAuto = style.includes('margin-left: auto');
    const hasMarginRightAuto = style.includes('margin-right: auto');
    const hasMarginLeft0 = style.includes('margin-left: 0');
    const hasMarginRight0 = style.includes('margin-right: 0');

    if (hasMarginLeft0 && hasMarginRightAuto) align = 'left';
    else if (hasMarginLeftAuto && hasMarginRight0) align = 'right';

    // Build HTML video tag with all attributes
    const attrs: string[] = [`src="${src}"`];
    if (title) attrs.push(`data-title="${title}"`);
    if (poster) attrs.push(`poster="${poster}"`);
    if (controls) attrs.push('controls');
    if (autoplay) attrs.push('autoplay');
    if (loop) attrs.push('loop');
    if (muted) attrs.push('muted');

    // Build style - replicate the same format as renderHTML for consistency
    const styleParts: string[] = [];
    if (width) styleParts.push(`width: ${width}`);
    if (align === 'left') {
      styleParts.push('margin-left: 0', 'margin-right: auto');
    } else if (align === 'right') {
      styleParts.push('margin-left: auto', 'margin-right: 0');
    } else {
      styleParts.push('margin-left: auto', 'margin-right: auto');
    }
    styleParts.push('display: block');

    attrs.push(`style="${styleParts.join('; ')}"`);

    return `\n<video ${attrs.join(' ')}></video>\n`;
  },
});

// Helper to pre-process column content - convert math blocks to markdown syntax before turndown
function preprocessColumnContent(html: string): string {
  // Convert math blocks to $$...$$ syntax before turndown processes them
  let result = html;

  // Match math block divs and convert to markdown
  result = result.replace(
    /<div[^>]*data-type="math-block"[^>]*data-latex="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_, encodedLatex) => {
      const latex = decodeURIComponent(encodedLatex || '');
      return latex ? `\n$$${latex}$$\n` : '';
    }
  );

  // Match inline math spans and convert to markdown
  result = result.replace(
    /<span[^>]*data-type="inline-math"[^>]*data-latex="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_, encodedLatex) => {
      const latex = decodeURIComponent(encodedLatex || '');
      return latex ? `$${latex}$` : '';
    }
  );

  return result;
}

// Callout rule — blok wyróżnienia zapisujemy jako alert GitHuba (`> [!NOTE]`).
// Musi być PRZED regułą blockquote turndown-a, bo inaczej straciłby typ i stał
// się zwykłym cytatem.
turndownService.addRule('callout', {
  filter: (node) => {
    const el = node as HTMLElement;
    if (el.hasAttribute?.('data-callout')) return true;
    // NodeView opakowuje blok dodatkowym <div data-node-view-wrapper>.
    if (
      el.getAttribute?.('data-node-view-wrapper') !== null &&
      el.querySelector?.('[data-callout]')
    )
      return true;
    return false;
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const box = el.hasAttribute('data-callout')
      ? el
      : (el.querySelector('[data-callout]') as HTMLElement);
    if (!box) return '';
    const raw = (box.getAttribute('data-callout') || 'note').toLowerCase();
    const variant: CalloutVariant = isCalloutVariant(raw) ? raw : 'note';
    // Treść przez turndown osobno — w środku bywają listy, kod i tabele.
    const body = turndownService.turndown(box.innerHTML).trim();
    return `\n\n${calloutToMarkdown(variant, body)}\n\n`;
  },
});

// Column layout rule - handles the column layout container
// Save content as markdown for better portability and viewer compatibility
turndownService.addRule('columnLayout', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Match NodeView wrapper elements
    if (element.classList?.contains('column-layout-wrapper')) return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const layout = element.querySelector('[data-column-layout]');
      if (layout) return true;
    }
    // Match direct column layout div
    if (element.hasAttribute('data-column-layout')) return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Get the column layout element - either from wrapper or direct
    const layout = element.hasAttribute('data-column-layout')
      ? element
      : (element.querySelector('[data-column-layout]') as HTMLElement);

    if (!layout) return '';

    // Find all column divs
    const columns = layout.querySelectorAll('[data-column]');
    if (columns.length === 0) return '';

    let result = '\n<div data-column-layout class="md-editor-columns">\n';

    columns.forEach((column) => {
      const colElement = column as HTMLElement;
      const width = colElement.getAttribute('data-width') || colElement.style.width || '';

      // Pre-process math blocks before turndown (turndown has issues with empty divs)
      const preprocessedHtml = preprocessColumnContent(colElement.innerHTML);

      // Convert inner content to markdown
      const columnMarkdown = turndownService.turndown(preprocessedHtml).trim();

      result += `<div data-column${width ? ` style="width: ${width}"` : ''}>\n\n${columnMarkdown}\n\n</div>\n`;
    });

    result += '</div>\n';
    return result;
  },
});

// Image rule - handles both NodeView wrappers and plain img elements from renderHTML
turndownService.addRule('imageNodeView', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Match NodeView wrapper elements
    if (element.classList?.contains('image-node-wrapper')) return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const img = element.querySelector('img');
      if (img) return true;
    }
    // Match plain img elements (from renderHTML output)
    if (element.nodeName === 'IMG') return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Get the img element - either from wrapper or direct
    const img =
      element.nodeName === 'IMG'
        ? (element as HTMLImageElement)
        : (element.querySelector('img') as HTMLImageElement);
    if (!img) return '';

    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    const title = img.getAttribute('title');
    const style = img.getAttribute('style') || '';

    // Skip empty or placeholder images
    if (!src || src.includes('placeholder.com')) return '';

    // Extract width from style
    const widthMatch = style.match(/width:\s*(\d+%?)/);
    const width = widthMatch ? widthMatch[1] : null;

    // Extract alignment from style
    let align = '';
    if (style.includes('float: left')) align = 'left';
    else if (style.includes('float: right')) align = 'right';
    else if (style.includes('display: inline-block')) align = 'inline';

    // Build style attribute parts
    const styleParts: string[] = [];
    if (width && width !== '100%') styleParts.push(`width: ${width}`);
    if (align === 'left') styleParts.push('float: left');
    else if (align === 'right') styleParts.push('float: right');
    else if (align === 'inline') styleParts.push('display: inline-block');

    // Build markdown image - use HTML if we need width or alignment
    let result: string;
    if (styleParts.length > 0) {
      // Use HTML img tag for custom width/alignment
      result = `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''} style="${styleParts.join('; ')}" />`;
    } else if (title) {
      result = `![${alt}](${src} "${title}")`;
    } else {
      result = `![${alt}](${src})`;
    }

    return result;
  },
});

turndownService.addRule('tables', {
  filter: 'table',
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    // Check if table has custom column widths or cell alignments
    const hasCustomStyles = Array.from(table.querySelectorAll('th, td')).some((cell) => {
      const style = (cell as HTMLElement).getAttribute('style') || '';
      const colwidth = (cell as HTMLElement).getAttribute('colwidth');
      return style.includes('width') || style.includes('text-align') || colwidth;
    });

    // If table has custom styles, output as HTML to preserve them
    if (hasCustomStyles) {
      let html = '\n<table>\n';
      rows.forEach((row) => {
        html += '  <tr>\n';
        const cells = Array.from(row.querySelectorAll('th, td'));
        cells.forEach((cell) => {
          const tag = cell.tagName.toLowerCase();
          const style = (cell as HTMLElement).getAttribute('style') || '';
          const colwidth = (cell as HTMLElement).getAttribute('colwidth');

          // Build style string
          let styleAttr = '';
          const styles: string[] = [];

          // Extract width from colwidth attribute or style
          if (colwidth) {
            styles.push(`width: ${colwidth}px`);
          } else if (style.includes('width')) {
            const widthMatch = style.match(/width:\s*([^;]+)/);
            if (widthMatch) styles.push(`width: ${widthMatch[1].trim()}`);
          }

          // Extract text-align
          if (style.includes('text-align')) {
            const alignMatch = style.match(/text-align:\s*([^;]+)/);
            if (alignMatch) styles.push(`text-align: ${alignMatch[1].trim()}`);
          }

          if (styles.length > 0) {
            styleAttr = ` style="${styles.join('; ')}"`;
          }

          const content = cell.textContent?.trim() || '';
          html += `    <${tag}${styleAttr}>${content}</${tag}>\n`;
        });
        html += '  </tr>\n';
      });
      html += '</table>\n';
      return html;
    }

    // Simple markdown table (no custom widths)
    let markdown = '\n';
    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      const cellContents = cells.map((cell) => cell.textContent?.trim() || '');
      markdown += '| ' + cellContents.join(' | ') + ' |\n';

      if (rowIndex === 0) {
        markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
      }
    });
    return markdown + '\n';
  },
});

// Math block rule - handles both direct elements and NodeView wrappers
turndownService.addRule('mathBlock', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Direct match
    if (element.getAttribute('data-type') === 'math-block') return true;
    // NodeView wrapper match
    if (element.classList?.contains('math-block-wrapper')) return true;
    // Check for data-node-view-wrapper with mathBlock type
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="math-block"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Try to find latex in various places
    let latex = '';

    // Direct attribute
    const encodedLatex = element.getAttribute('data-latex');
    if (encodedLatex) {
      latex = decodeURIComponent(encodedLatex);
    } else {
      // Look in nested element
      const inner = element.querySelector('[data-latex]');
      if (inner) {
        const innerLatex = inner.getAttribute('data-latex');
        latex = innerLatex ? decodeURIComponent(innerLatex) : '';
      }
    }

    // Fallback to text content if no latex attribute found
    if (!latex) {
      // Try to get KaTeX rendered text
      const katexElement = element.querySelector('.katex-mathml annotation');
      if (katexElement) {
        latex = katexElement.textContent || '';
      } else {
        latex = element.textContent || '';
      }
    }

    return latex ? `\n$$${latex}$$\n` : '';
  },
});

// Inline math rule - handles both direct elements and NodeView wrappers
turndownService.addRule('inlineMath', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Direct match
    if (element.getAttribute('data-type') === 'inline-math') return true;
    // NodeView wrapper match
    if (element.classList?.contains('inline-math-wrapper')) return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    let latex = '';

    // Direct attribute
    const encodedLatex = element.getAttribute('data-latex');
    if (encodedLatex) {
      latex = decodeURIComponent(encodedLatex);
    } else {
      // Look in nested element
      const inner = element.querySelector('[data-latex]');
      if (inner) {
        const innerLatex = inner.getAttribute('data-latex');
        latex = innerLatex ? decodeURIComponent(innerLatex) : '';
      }
    }

    // Fallback to KaTeX annotation
    if (!latex) {
      const katexElement = element.querySelector('.katex-mathml annotation');
      if (katexElement) {
        latex = katexElement.textContent || '';
      }
    }

    return latex ? `$${latex}$` : '';
  },
});

// InfoMark inline span — covers the cases where the pre-processor regex
// missed (e.g. extra attributes inside the tag perturbed the placeholder
// swap). Defensive: emits the same @[info:...] syntax the placeholder
// pipeline would have, so the round-trip works either way.
turndownService.addRule('infoMark', {
  filter: (node) => {
    const el = node as HTMLElement;
    return el.tagName === 'SPAN' && el.getAttribute('data-type') === 'info-mark';
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const dec = (s: string | null) => {
      if (!s) return '';
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    const text = dec(el.getAttribute('data-text')) || el.textContent || '';
    const title = dec(el.getAttribute('data-title'));
    const body = dec(el.getAttribute('data-body'));
    const bodyPath = dec(el.getAttribute('data-body-path'));
    return `@[info:${encodeURIComponent(text)}:${encodeURIComponent(title)}:${encodeURIComponent(body)}:${encodeURIComponent(bodyPath)}]`;
  },
});

// Component embed rule - converts back to @[type:id] syntax
turndownService.addRule('componentEmbed', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Direct match
    if (element.getAttribute('data-type') === 'component-embed') return true;
    // NodeView wrapper match
    if (element.classList?.contains('component-embed-wrapper')) return true;
    // Check for data-node-view-wrapper with componentEmbed type
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="component-embed"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    let componentType: string;
    let componentId: string;

    // Direct attributes
    componentType = element.getAttribute('data-component-type') || '';
    componentId = element.getAttribute('data-component-id') || '';

    // Look in nested element if not found
    if (!componentType || !componentId) {
      const inner = element.querySelector('[data-type="component-embed"]');
      if (inner) {
        componentType = inner.getAttribute('data-component-type') || '';
        componentId = inner.getAttribute('data-component-id') || '';
      }
    }

    // Always save component embed if type is valid, even with empty ID
    if (componentType) {
      return `@[${componentType}:${componentId || ''}]`;
    }

    return '';
  },
});

// UI Form embed rule - converts back to @[uiform:id] or @[uiform:{...}] syntax
turndownService.addRule('uiFormEmbed', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Direct match
    if (element.getAttribute('data-type') === 'ui-form-embed') return true;
    // NodeView wrapper match
    if (element.classList?.contains('ui-form-wrapper')) return true;
    // Check for data-node-view-wrapper with uiFormEmbed type
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="ui-form-embed"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    let formId: string;
    let inlineData = '';

    // Direct attributes
    formId = element.getAttribute('data-form-id') || '';
    const encodedInline = element.getAttribute('data-inline');
    if (encodedInline) {
      inlineData = decodeURIComponent(encodedInline);
    }

    // Look in nested element if not found
    if (!formId && !inlineData) {
      const inner = element.querySelector('[data-type="ui-form-embed"]');
      if (inner) {
        formId = inner.getAttribute('data-form-id') || '';
        const innerEncodedInline = inner.getAttribute('data-inline');
        if (innerEncodedInline) {
          inlineData = decodeURIComponent(innerEncodedInline);
        }
      }
    }

    // Return appropriate markdown format
    if (inlineData) {
      return `\n@[uiform:${inlineData}]\n`;
    }
    if (formId) {
      return `\n@[uiform:${formId}]\n`;
    }

    return '';
  },
});

// Round-trip the EventBlock TipTap node back to an `event` code fence with
// JSON attrs so the markdown file on disk stays the single source of truth.
// Handles both the bare <div data-type="event-block"> and TipTap's
// NodeViewWrapper-wrapped form.
turndownService.addRule('eventBlock', {
  filter: (node) => {
    const element = node as HTMLElement;
    if (element.getAttribute && element.getAttribute('data-type') === 'event-block') return true;
    if (element.getAttribute && element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="event-block"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    const source: HTMLElement =
      element.getAttribute('data-type') === 'event-block'
        ? element
        : ((element.querySelector('[data-type="event-block"]') as HTMLElement | null) ?? element);
    const dec = (name: string) => {
      const raw = source.getAttribute(name);
      if (!raw) return '';
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    };
    const attrs = {
      eventName: dec('data-event-name'),
      start: dec('data-start'),
      end: dec('data-end'),
      description: dec('data-description'),
      taskId: dec('data-task-id'),
      taskName: dec('data-task-name'),
      projectName: dec('data-project-name'),
    };
    return `\n\`\`\`event\n${JSON.stringify(attrs, null, 2)}\n\`\`\`\n`;
  },
});

// Karta zadania — jak eventBlock: obsługuje formę gołą i opakowaną przez
// NodeViewWrapper TipTapa.
turndownService.addRule('taskCard', {
  filter: (node) => {
    const element = node as HTMLElement;
    if (element.getAttribute && element.getAttribute('data-type') === 'task-card') return true;
    if (element.getAttribute && element.getAttribute('data-node-view-wrapper') !== null) {
      if (element.querySelector('[data-type="task-card"]')) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    const source: HTMLElement =
      element.getAttribute('data-type') === 'task-card'
        ? element
        : ((element.querySelector('[data-type="task-card"]') as HTMLElement | null) ?? element);
    const dec = (name: string) => {
      const raw = source.getAttribute(name);
      if (!raw) return '';
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    };
    const attrs = { taskId: dec('data-task-id'), taskName: dec('data-task-name') };
    return `\n\`\`\`taskcard\n${JSON.stringify(attrs, null, 2)}\n\`\`\`\n`;
  },
});

// Plugin script block helpers — format: ```pscript:blockId:mode:encodedLabel
type PluginScriptEntry = { code: string; blockId: string; mode: string; label: string };

function escapePluginScriptsForHtml(content: string): string {
  const scripts: PluginScriptEntry[] = [];
  const result = content.replace(/```pscript(?::([^\n]*))?\n([\s\S]*?)```/g, (_, params, code) => {
    const parts = (params?.trim() || '').split(':');
    const blockId = parts[0] || '';
    const mode = parts[1] || 'manual';
    const label = parts[2] ? decodeURIComponent(parts[2]) : 'Script';
    scripts.push({ code: code.trimEnd(), blockId, mode, label });
    return `%%PLUGINSCRIPT_${scripts.length - 1}%%`;
  });
  return JSON.stringify({ result, scripts });
}

function restorePluginScriptsFromHtml(html: string, scripts: PluginScriptEntry[]): string {
  let result = html;
  scripts.forEach((s, index) => {
    const blockIdAttr = s.blockId ? ` data-block-id="${s.blockId}"` : '';
    const tag = `<div data-type="plugin-script-block"${blockIdAttr} data-mode="${s.mode}" data-label="${s.label}" data-collapsed="false" data-code="${encodeURIComponent(s.code)}"></div>`;
    const ph = `%%PLUGINSCRIPT_${index}%%`;
    result = result.replace(`<p>${ph}</p>`, tag);
    result = result.split(ph).join(tag);
  });
  return result;
}

// Plugin script block rule — converts back to ```pscript code fence
turndownService.addRule('pluginScriptBlock', {
  filter: (node) => {
    const el = node as HTMLElement;
    if (el.getAttribute('data-type') === 'plugin-script-block') return true;
    if (el.getAttribute('data-node-view-wrapper') !== null) {
      return !!el.querySelector('[data-type="plugin-script-block"]');
    }
    return false;
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    let target: HTMLElement = el;
    if (!target.getAttribute('data-type')) {
      const inner = target.querySelector('[data-type="plugin-script-block"]') as HTMLElement | null;
      if (inner) target = inner;
    }
    const code = target.getAttribute('data-code')
      ? decodeURIComponent(target.getAttribute('data-code')!)
      : '';
    const blockId = target.getAttribute('data-block-id') || '';
    const mode = target.getAttribute('data-mode') || 'manual';
    const label = encodeURIComponent(target.getAttribute('data-label') || 'Script');
    const params = [blockId, mode, label].join(':');
    return `\n\`\`\`pscript:${params}\n${code}\n\`\`\`\n`;
  },
});

// Helper to process markdown inside column divs
function processColumnLayouts(html: string): string {
  // Use DOM parser to properly handle nested elements
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstChild as HTMLElement;

  // Find all column layout divs
  const columnLayouts = container.querySelectorAll('[data-column-layout]');

  columnLayouts.forEach((layout) => {
    // Find all column divs inside this layout
    const columns = layout.querySelectorAll('[data-column]');

    columns.forEach((column) => {
      const content = column.textContent?.trim() || '';
      if (content) {
        // Convert markdown content inside the column to HTML
        let columnHtml = showdownConverter.makeHtml(content);
        // Handle highlight syntax
        columnHtml = columnHtml.replace(/==([^=]+)==/g, '<mark>$1</mark>');
        column.innerHTML = columnHtml;
      } else {
        column.innerHTML = '<p></p>';
      }
    });
  });

  return container.innerHTML;
}

// Obsidian wikilinks: [[target]] / [[target|label]] are pulled out before
// showdown and re-emitted as <a data-wikilink href="drive/<file>.md#anchor">.
// The short `target` (drive-relative, no .md) is expanded to the full workspace
// path so the link navigates; htmlToMarkdown's wikiLink rule reverses this.
// Obsidian embeds `![[target]]` (content transclusion). Escaped BEFORE wikilinks
// so the inner `[[…]]` isn't mistaken for a plain link. Restored as a block
// <div data-type="md-embed"> that the MdEmbed NodeView renders.
function escapeEmbedsForHtml(content: string): { result: string; embeds: string[] } {
  const embeds: string[] = [];
  const result = content.replace(/!\[\[([^\]\n|]+?)\]\]/g, (_m, target: string) => {
    embeds.push(String(target).trim());
    return `%%MDEMBED${embeds.length - 1}%%`;
  });
  return { result, embeds };
}

function restoreEmbedsToHtml(html: string, embeds: string[]): string {
  let result = html;
  const enc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  embeds.forEach((target, i) => {
    const div = `<div data-type="md-embed" data-target="${enc(target)}"></div>`;
    // Showdown wraps the lone placeholder in a paragraph — unwrap it (block node).
    result = result.split(`<p>%%MDEMBED${i}%%</p>`).join(div).split(`%%MDEMBED${i}%%`).join(div);
  });
  return result;
}

// ─── Odsyłacz bazy wiedzy ((id)) / ((id|podpis)) ────────────────────────────
// Osobny nawias, bo `[[…]]` znaczy tu link do pliku w Drive — odsyłacz do
// hasła zamieniał się przez to w link do nieistniejącego dokumentu.
// Identyfikator zaczyna się od litery i nie ma spacji, więc zwykły nawias
// w zdaniu („(patrz (a) wyżej)") nie jest brany za odsyłacz.
function escapeKnowledgeRefsForHtml(content: string): {
  result: string;
  refs: { id: string; label: string }[];
} {
  const refs: { id: string; label: string }[] = [];
  const result = content.replace(
    // Podpis wolno złamać na wiersze — plik źródłowy jest zawijany, więc
    // „paragrafu\n6-3" jest zapisem normalnym. Nie może zawierać nawiasu
    // zamykającego, bo `))` kończy odsyłacz.
    /\(\(([A-Za-z][A-Za-z0-9_-]*)(?:\|([^)]+))?\)\)/g,
    (_m, id: string, label?: string) => {
      // Złamanie wiersza jest zapisem, nie treścią — akapit składa się na nowo.
      refs.push({ id, label: (label ?? '').replace(/\s+/g, ' ').trim() });
      return `%%KNOWREF${refs.length - 1}%%`;
    }
  );
  return { result, refs };
}

function restoreKnowledgeRefsToHtml(html: string, refs: { id: string; label: string }[]): string {
  let result = html;
  const enc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  refs.forEach((r, i) => {
    const tag = `<span data-type="knowledge-ref" data-ref-id="${enc(r.id)}" data-label="${enc(r.label)}">${enc(r.label || r.id)}</span>`;
    result = result.split(`%%KNOWREF${i}%%`).join(tag);
  });
  return result;
}

function escapeWikiLinksForHtml(content: string): {
  result: string;
  wikiLinks: { href: string; label: string }[];
} {
  const wikiLinks: { href: string; label: string }[] = [];
  const result = content.replace(
    /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g,
    (_m, target: string, label?: string) => {
      const t = String(target).trim();
      const hashIdx = t.indexOf('#');
      const filePart = (hashIdx >= 0 ? t.slice(0, hashIdx) : t).replace(/^\/+/, '');
      const anchorPart = hashIdx >= 0 ? t.slice(hashIdx) : '';
      // No file part → a same-document anchor ([[#heading]]); otherwise a link to
      // another note (drive/<file>.md#…).
      const href = filePart ? `drive/${filePart}.md${anchorPart}` : anchorPart;
      wikiLinks.push({ href, label: (label ?? t).trim() });
      return `%%WIKILINK${wikiLinks.length - 1}%%`;
    }
  );
  return { result, wikiLinks };
}

function restoreWikiLinksToHtml(
  html: string,
  wikiLinks: { href: string; label: string }[]
): string {
  let result = html;
  const enc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  wikiLinks.forEach((l, i) => {
    const tag = `<a href="${enc(l.href)}" data-wikilink="true" class="md-editor-link">${enc(l.label)}</a>`;
    result = result.split(`%%WIKILINK${i}%%`).join(tag);
  });
  return result;
}

/**
 * Odcina nagłówek YAML z początku dokumentu.
 *
 * Front matter to **metadane, nie treść** — TipTap nie ma dla niego węzła i
 * zamienia `---` na poziomą linię, a listę tagów na akapit. Dokument bazy
 * wiedzy otwarty w edytorze tracił w ten sposób tytuł, tagi i prerekwizyty, a
 * autosave zapisywał uszkodzoną wersję na dysk.
 *
 * Rozdzielenie i sklejenie są osobnymi funkcjami, bo edytor musi trzymać
 * nagłówek po swojej stronie przez cały czas edycji — konwerter jest
 * bezstanowy i nie ma gdzie go przechować.
 */
export function splitFrontMatter(markdown: string): { frontMatter?: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { body: markdown };
  return { frontMatter: match[0], body: markdown.slice(match[0].length) };
}

/** Skleja nagłówek z treścią; brak nagłówka zwraca samą treść. */
export function withFrontMatter(frontMatter: string | undefined, body: string): string {
  if (!frontMatter) return body;
  // Nagłówek zachowuje własne zakończenie linii, więc doklejamy wprost —
  // dodatkowa pusta linia rosłaby przy każdym zapisie.
  return frontMatter.endsWith('\n') ? `${frontMatter}${body}` : `${frontMatter}\n${body}`;
}

export function markdownToHtml(markdown: string): string {
  if (!markdown || markdown.trim() === '') {
    return '';
  }

  // Strip any stray %%BID:xxx%% literals that may appear in files saved by old/broken code
  markdown = markdown.replace(/%%BID:[^%\n]*%%\n?/g, '');

  // Protect <!-- bid:id --> block ID markers from showdown processing
  // Accept any ID format (UUID or legacy slug)
  const blockIds: string[] = [];
  const markdownWithBlockIds = markdown.replace(
    /^<!--\s*bid:([^\s>-][^\s>]*)?\s*-->[ \t]*$/gm,
    (_, id) => {
      if (!id) return '';
      const ph = `%%BID${blockIds.length}%%`;
      blockIds.push(id);
      return ph;
    }
  );

  // Callouty (`> [!NOTE]`) wyjmujemy przed showdownem — inaczej zrobiłby z nich
  // zwykły <blockquote> i typ wyróżnienia by przepadł.
  const { result: markdownWithoutCallouts, callouts } = extractCallouts(markdownWithBlockIds);

  // First, protect plugin script blocks from showdown processing
  const pluginScriptDataStr = escapePluginScriptsForHtml(markdownWithoutCallouts);
  const { result: markdownWithoutPluginScripts, scripts: pluginScripts } =
    JSON.parse(pluginScriptDataStr);

  // Protect event blocks (```event {…json…}``` code fences) from showdown
  // — replace with `%%EVENTBLOCK_N%%` before showdown sees the fence
  // marker, then re-emit as <div data-type="event-block" data-…> after html.
  const { result: markdownWithoutEvents, events: eventBlocks } = escapeEventBlocksForHtml(
    markdownWithoutPluginScripts
  );

  // Karty zadań — ta sama droga co bloki zdarzeń.
  const { result: markdownWithoutTaskCards, cards: taskCards } =
    escapeTaskCardsForHtml(markdownWithoutEvents);

  // Protect photo-map blocks (```photomap {…json…}``` fences) from showdown.
  const { result: markdownWithoutPhotoMaps, photoMaps } =
    escapePhotoMapsForHtml(markdownWithoutTaskCards);

  // Protect UI form embeds from showdown processing
  const uiFormDataStr = escapeUIFormsForHtml(markdownWithoutPhotoMaps);
  const { result: markdownWithoutUIForms, uiForms } = JSON.parse(uiFormDataStr);

  // Protect CAD view embeds from showdown processing
  const cadViewDataStr = escapeCadViewEmbedsForHtml(markdownWithoutUIForms);
  const { result: markdownWithoutCadViews, cadViews } = JSON.parse(cadViewDataStr);

  // Protect Web embeds from showdown processing
  const webEmbedDataStr = escapeWebEmbedsForHtml(markdownWithoutCadViews);
  const { result: markdownWithoutWebEmbeds, webEmbeds } = JSON.parse(webEmbedDataStr) as {
    result: string;
    webEmbeds: { mode: string; value: string }[];
  };

  // Protect gallery embeds (Immich / Google Photos) from showdown processing
  const { result: markdownWithoutGalleries, galleries } =
    escapeGalleriesForHtml(markdownWithoutWebEmbeds);

  // Protect TableView blocks from showdown processing
  const { result: markdownWithoutTableViews, tables: tableViews } =
    escapeTableViewsForHtml(markdownWithoutGalleries);

  // Protect form-engine embeds from showdown processing
  const formEngineDataStr = escapeFormEngineEmbedsForHtml(markdownWithoutTableViews);
  const { result: markdownWithoutFormEngine, formEmbeds } = JSON.parse(formEngineDataStr);

  // Protect InfoMark inline embeds from showdown processing
  const infoMarkDataStr = escapeInfoMarksForHtml(markdownWithoutFormEngine);
  const { result: markdownWithoutInfoMarks, infoMarks } = JSON.parse(infoMarkDataStr) as {
    result: string;
    infoMarks: { text: string; title: string; body: string; bodyPath: string }[];
  };

  // Protect File chips @[file:…] and env-value markers {{env:…}} from showdown
  const { result: markdownWithoutFiles, files } = escapeFileRefsForHtml(markdownWithoutInfoMarks);
  const { result: markdownWithoutEnvVals, envs } = escapeEnvValuesForHtml(markdownWithoutFiles);

  // Then, protect component embeds from showdown processing
  const componentDataStr = escapeComponentEmbedsForHtml(markdownWithoutEnvVals);
  const { result: markdownWithoutComponents, componentEmbeds } = JSON.parse(componentDataStr);

  // Protect Obsidian embeds ![[…]] BEFORE wikilinks (they share [[…]] syntax)
  const { result: markdownWithoutEmbeds, embeds } = escapeEmbedsForHtml(markdownWithoutComponents);

  // Protect Obsidian wikilinks [[…]] from showdown
  const { result: markdownWithoutRefs, refs: knowledgeRefs } =
    escapeKnowledgeRefsForHtml(markdownWithoutEmbeds);
  const { result: markdownWithoutWikiLinks, wikiLinks } =
    escapeWikiLinksForHtml(markdownWithoutRefs);

  // Then, protect math content from showdown processing
  const mathDataStr = escapeMathForHtml(markdownWithoutWikiLinks);
  const { result: escapedMarkdown, mathBlocks, mathInlines } = JSON.parse(mathDataStr);

  // Protect external-code fences ` ```lang file=path ` — po showdown odtwarzane jako
  // <pre data-external-src="path"><code class="language-lang"></code></pre> (blok kodu z pliku).
  const extCodeBlocks: { lang: string; src: string }[] = [];
  const markdownWithExtCodes = escapedMarkdown.replace(
    /^```([\w+#.-]*)[ \t]+file=(\S+)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm,
    (_m: string, lang: string, src: string) => {
      const i = extCodeBlocks.length;
      extCodeBlocks.push({ lang, src });
      return `%%EXTCODE${i}%%`;
    }
  );

  // Osadzenia YouTube: ` ```youtube {json} ` → marker → po showdown <iframe data-youtube-id>.
  const ytBlocks: { videoId: string; start?: number | string; width?: string; align?: string }[] =
    [];
  const markdownWithYt = markdownWithExtCodes.replace(
    /^```youtube[ \t]*\n([\s\S]*?)^```[ \t]*$/gm,
    (_m: string, body: string) => {
      try {
        const cfg = JSON.parse(body.trim());
        const i = ytBlocks.length;
        ytBlocks.push(cfg);
        return `%%YOUTUBE${i}%%`;
      } catch {
        return _m;
      }
    }
  );

  let html = showdownConverter.makeHtml(markdownWithYt);

  // Odtworzenie bloków kodu z zewnętrznym plikiem.
  extCodeBlocks.forEach(({ lang, src }, i) => {
    const el = `<pre data-external-src="${src}"><code class="language-${lang}"></code></pre>`;
    html = html.replace(`<p>%%EXTCODE${i}%%</p>`, el).replace(`%%EXTCODE${i}%%`, el);
  });

  // Odtworzenie osadzeń YouTube.
  ytBlocks.forEach((cfg, i) => {
    const start = cfg.start ? Number(cfg.start) : 0;
    const src = `https://www.youtube.com/embed/${cfg.videoId}${start > 0 ? `?start=${start}` : ''}`;
    const el =
      `<iframe src="${src}" class="md-editor-youtube" data-youtube-id="${cfg.videoId}"` +
      (start > 0 ? ` data-start="${start}"` : '') +
      ` data-align="${cfg.align || 'center'}" frameborder="0" allowfullscreen="true"` +
      ` style="aspect-ratio: 16 / 9; width: ${cfg.width || '100%'}; max-width: 100%; display: block"></iframe>`;
    html = html.replace(`<p>%%YOUTUBE${i}%%</p>`, el).replace(`%%YOUTUBE${i}%%`, el);
  });

  // Process markdown inside column layouts (showdown doesn't process content inside HTML tags)
  html = processColumnLayouts(html);

  // Restore math content
  html = restoreMathFromHtml(html, { mathBlocks, mathInlines });

  // Restore component embeds
  html = restoreComponentEmbedsFromHtml(html, componentEmbeds);

  // Restore Obsidian wikilinks
  html = restoreWikiLinksToHtml(html, wikiLinks);
  html = restoreKnowledgeRefsToHtml(html, knowledgeRefs);

  // Restore Obsidian embeds ![[…]]
  html = restoreEmbedsToHtml(html, embeds);

  // Restore UI form embeds
  html = restoreUIFormsFromHtml(html, uiForms);

  // Restore CAD view embeds
  html = restoreCadViewEmbedsFromHtml(html, cadViews);
  html = restoreWebEmbedsFromHtml(html, webEmbeds);

  // Restore gallery embeds
  html = restoreGalleriesFromHtml(html, galleries);
  html = restoreTableViewsFromHtml(html, tableViews);

  // Restore form-engine embeds
  html = restoreFormEngineEmbedsFromHtml(html, formEmbeds);

  // Restore InfoMark inline embeds
  html = restoreInfoMarksFromHtml(html, infoMarks);

  // Restore File chips + env-value markers
  html = restoreFileRefsFromHtml(html, files);
  html = restoreEnvValuesFromHtml(html, envs);

  // Restore event blocks (insert <div data-type="event-block" data-…>)
  html = restoreEventBlocksFromHtml(html, eventBlocks);

  // Restore task cards (insert <div data-type="task-card" data-…>)
  html = restoreTaskCardsFromHtml(html, taskCards);

  // Restore photo-map blocks (insert <div data-type="photo-map" data-config="…">)
  html = restorePhotoMapsFromHtml(html, photoMaps);

  // Restore plugin script blocks
  html = restorePluginScriptsFromHtml(html, pluginScripts);

  // Callouty: treść przechodzi przez showdown osobno, żeby listy i kod w środku
  // zamieniły się w HTML tak samo jak w reszcie dokumentu.
  callouts.forEach((c, index) => {
    const inner = c.body.trim() ? showdownConverter.makeHtml(c.body) : '<p></p>';
    const tag = `<div data-callout="${c.variant}">${inner}</div>`;
    const placeholder = `%%CALLOUT${index}%%`;
    html = html.replace(`<p>${placeholder}</p>`, tag).split(placeholder).join(tag);
  });

  html = html.replace(/<li>\s*\[([ xX])\]\s*/g, (_, checked) => {
    const isChecked = checked.toLowerCase() === 'x';
    return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox"${isChecked ? ' checked' : ''}></label><div>`;
  });

  html = html.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  // Restore block IDs: apply each %%BIDn%% placeholder's UUID to the next block tag
  if (blockIds.length > 0) {
    // Placeholders may be wrapped in <p> by showdown
    blockIds.forEach((id, i) => {
      html = html
        .replace(`<p>%%BID${i}%%</p>`, `%%BIDREADY:${id}%%`)
        .replace(`%%BID${i}%%`, `%%BIDREADY:${id}%%`);
    });
    html = html.replace(
      /%%BIDREADY:([^%]+)%%\s*(<(?:h[1-6]|p|ul|ol|blockquote|pre|table)[^>]*>)/gi,
      (_, id, openTag) => openTag.replace(/^(<\w+)/, `$1 data-block-id="${id}"`)
    );
    html = html.replace(/%%BIDREADY:[^%]*%%/g, '');
  }

  return html;
}

export function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === '' || html === '<p></p>') {
    return '';
  }

  // Bloki kodu z zewnętrznym plikiem: zbieramy je i zastępujemy markerem PRZED turndown
  // (turndown gubi puste <pre><code> + atrybut). Po turndown marker → ` ```lang file=src `.
  const extCodeMarkers: { lang: string; src: string }[] = [];
  const ytMarkers: { videoId: string; start?: string; width?: string; align?: string }[] = [];

  // Pre-process: extract data-block-id from top-level blocks and insert text placeholders
  // (empty divs are skipped by Turndown's isBlank check, so we use <p> with text content)
  let processedHtml = (() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // Najpierw wyłuskaj bloki kodu z pliku (zanim inne przetwarzanie ruszy <pre>).
    Array.from(doc.querySelectorAll('pre[data-external-src]')).forEach((pre) => {
      const src = pre.getAttribute('data-external-src') || '';
      const cls = pre.querySelector('code')?.getAttribute('class') || '';
      const lang = cls.match(/language-(\S+)/)?.[1] || '';
      const i = extCodeMarkers.length;
      extCodeMarkers.push({ lang, src });
      const marker = doc.createElement('p');
      marker.textContent = `%%EXTCODE${i}%%`;
      pre.replaceWith(marker);
    });
    // Osadzenia YouTube (turndown gubi <iframe>) → marker.
    Array.from(doc.querySelectorAll('iframe[data-youtube-id]')).forEach((f) => {
      const el = f as HTMLElement;
      const i = ytMarkers.length;
      ytMarkers.push({
        videoId: el.getAttribute('data-youtube-id') || '',
        start: el.getAttribute('data-start') || undefined,
        align: el.getAttribute('data-align') || undefined,
        width: el.style.width || undefined,
      });
      const marker = doc.createElement('p');
      marker.textContent = `%%YOUTUBE${i}%%`;
      f.replaceWith(marker);
    });
    Array.from(doc.body.children).forEach((el) => {
      const id = el.getAttribute('data-block-id');
      if (id) {
        el.removeAttribute('data-block-id');
        const marker = doc.createElement('p');
        marker.textContent = `%%BID:${id}%%`;
        doc.body.insertBefore(marker, el);
      }
    });
    // Preserve "extra" whitespace that Markdown would otherwise collapse: leading
    // spaces, trailing spaces and interior runs of 2+ spaces become non-breaking
    // spaces (U+00A0), which Turndown/Markdown keep verbatim. Single interior
    // spaces stay normal so ordinary prose remains clean Markdown. Skip code/pre
    // (their whitespace is already fenced and significant).
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parentTag = n.parentElement?.closest('pre, code');
      if (!parentTag) textNodes.push(n as Text);
    }
    for (const t of textNodes) {
      const v = t.nodeValue ?? '';
      if (!/ {2,}| $|^ /.test(v)) continue;
      t.nodeValue = v
        .replace(/^ +/, (m) => ' '.repeat(m.length)) // leading run
        .replace(/ +$/, (m) => ' '.repeat(m.length)) // trailing run
        .replace(/ {2,}/g, (m) => ' ' + ' '.repeat(m.length - 1)); // interior run: keep 1 space, pad rest
    }
    return doc.body.innerHTML;
  })();

  // Pre-process: Replace UI form embeds with placeholders before Turndown
  const uiForms: { id: string; inline?: string }[] = [];

  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="ui-form-embed"[^>]*data-form-id="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_, formId) => {
      uiForms.push({ id: formId });
      return `##UIFORMEMBED${uiForms.length - 1}##`;
    }
  );

  // Match inline form data
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="ui-form-embed"[^>]*data-inline="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_, encodedInline) => {
      uiForms.push({ id: '', inline: decodeURIComponent(encodedInline) });
      return `##UIFORMEMBED${uiForms.length - 1}##`;
    }
  );

  // Pre-process: raw-markdown-block "source view". The block carries its markdown
  // verbatim in data-source; emit that source directly (its block-id marker is
  // already produced by the generic bid handling above), so the raw view is a
  // transient display state that saves back to plain markdown.
  const rawMdBlocks: string[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="raw-markdown-block"[^>]*>(?:[\s\S]*?<\/div>)?/gi,
    (m) => {
      const s = m.match(/data-source="([^"]*)"/i);
      rawMdBlocks.push(s ? decodeURIComponent(s[1]) : '');
      return `<p>##RAWMDBLOCK${rawMdBlocks.length - 1}##</p>`;
    }
  );

  // Pre-process: Obsidian embeds. Turndown drops EMPTY <div>s (isBlank check) so
  // the mdEmbed rule never fires — swap them for a text placeholder now and
  // restore `![[target]]` after turndown (matches the event-block approach).
  const mdEmbedTargets: string[] = [];
  processedHtml = processedHtml.replace(/<div[^>]*data-type="md-embed"[^>]*><\/div>/gi, (m) => {
    const t = m.match(/data-target="([^"]*)"/i);
    mdEmbedTargets.push(t ? t[1] : '');
    return `<p>##MDEMBEDOUT${mdEmbedTargets.length - 1}##</p>`;
  });

  // Pre-process: Replace form-engine embeds with placeholders before Turndown
  const formEngineEmbeds: string[] = [];

  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="form-engine-embed"[^>]*data-form-path="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_, path) => {
      formEngineEmbeds.push(path);
      return `##FORMEMBED${formEngineEmbeds.length - 1}##`;
    }
  );

  // Also handle self-closing variant
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="form-engine-embed"[^>]*data-form-path="([^"]*)"[^>]*\/>/gi,
    (_, path) => {
      formEngineEmbeds.push(path);
      return `##FORMEMBED${formEngineEmbeds.length - 1}##`;
    }
  );

  // Pre-process: Replace CAD view embeds with placeholders before Turndown.
  // Prefer the FULL url (it carries the CAD backend origin, so the embed renders
  // on other devices / after reload — the bare path would fall back to the
  // per-browser localStorage base, which is unreachable on e.g. mobile).
  const cadViews: { mode: string; value: string }[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="cad-view-embed"[^>]*>(?:[\s\S]*?<\/div>)?/gi,
    (match) => {
      const modeM = match.match(/data-mode="([^"]*)"/);
      const pathM = match.match(/data-path="([^"]*)"/);
      const urlM = match.match(/data-url="([^"]*)"/);
      cadViews.push({ mode: modeM?.[1] || 'scene3d', value: urlM?.[1] || pathM?.[1] || '' });
      return `##CADVIEW${cadViews.length - 1}##`;
    }
  );

  // Pre-process: Replace Web embeds with placeholders before Turndown
  const webEmbeds: { mode: string; value: string }[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="web-embed"[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const modeM = match.match(/data-mode="([^"]*)"/);
      const valM = match.match(/data-value="([^"]*)"/);
      webEmbeds.push({ mode: modeM?.[1] || 'url', value: valM?.[1] || '' });
      return `##WEBEMBED${webEmbeds.length - 1}##`;
    }
  );

  // Pre-process: Replace gallery embeds (empty <div>, dropped by Turndown as blank)
  const galleries: { provider: string; source: string; selected: string }[] = [];
  const decodeAttr = (s: string) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="gallery-embed"[^>]*>(?:[\s\S]*?<\/div>)?/gi,
    (match) => {
      const provM = match.match(/data-provider="([^"]*)"/);
      const srcM = match.match(/data-source="([^"]*)"/);
      const selM = match.match(/data-selected="([^"]*)"/);
      galleries.push({
        provider: provM?.[1] || 'immich',
        source: decodeAttr(srcM?.[1] || ''),
        selected: decodeAttr(selM?.[1] || ''),
      });
      return `<p>##GALLERY${galleries.length - 1}##</p>`;
    }
  );

  // Pre-process: Replace TableView blocks (empty <div>, dropped by Turndown as blank)
  const tableViews: string[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="table-view"[^>]*>(?:[\s\S]*?<\/div>)?/gi,
    (match) => {
      const cfgM = match.match(/data-config="([^"]*)"/);
      tableViews.push(decodeAttr(cfgM?.[1] || ''));
      return `<p>##TABLEVIEW${tableViews.length - 1}##</p>`;
    }
  );

  // Pre-process: Replace InfoMark inline spans with placeholders before
  // Turndown — span is inline so the regex matches without consuming a
  // surrounding paragraph; placeholder gets swapped back to @[info:…]
  // post-Turndown.
  const infoMarks: { text: string; title: string; body: string; bodyPath: string }[] = [];
  processedHtml = processedHtml.replace(
    /<span[^>]*data-type="info-mark"[^>]*>[\s\S]*?<\/span>/gi,
    (match) => {
      const dec = (s: string | undefined) => {
        if (!s) return '';
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      };
      const textM = match.match(/data-text="([^"]*)"/);
      const titleM = match.match(/data-title="([^"]*)"/);
      const bodyM = match.match(/data-body="([^"]*)"/);
      const pathM = match.match(/data-body-path="([^"]*)"/);
      infoMarks.push({
        text: dec(textM?.[1]),
        title: dec(titleM?.[1]),
        body: dec(bodyM?.[1]),
        bodyPath: dec(pathM?.[1]),
      });
      return `##INFOMARK${infoMarks.length - 1}##`;
    }
  );

  // Pre-process: File chips (inline span) → placeholder → @[file:path|env|format]
  const fileRefs: { path: string; env: string; format: string }[] = [];
  const decAttr = (s: string) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  processedHtml = processedHtml.replace(
    /<span[^>]*data-type="file-ref"[^>]*>(?:[\s\S]*?<\/span>)?/gi,
    (match) => {
      const pathM = match.match(/data-path="([^"]*)"/);
      const envM = match.match(/data-env="([^"]*)"/);
      const fmtM = match.match(/data-format="([^"]*)"/);
      fileRefs.push({
        path: decAttr(pathM?.[1] || ''),
        env: decAttr(envM?.[1] || ''),
        format: decAttr(fmtM?.[1] || ''),
      });
      return `##FILEREF${fileRefs.length - 1}##`;
    }
  );

  // Pre-process: env-value markers (inline span) → placeholder → {{env:name}}
  const envValues: string[] = [];
  processedHtml = processedHtml.replace(
    /<span[^>]*data-type="env-value"[^>]*>(?:[\s\S]*?<\/span>)?/gi,
    (match) => {
      const nameM = match.match(/data-name="([^"]*)"/);
      envValues.push(decAttr(nameM?.[1] || ''));
      return `##ENVVAL${envValues.length - 1}##`;
    }
  );

  // Pre-process: Replace plugin script blocks with placeholders before Turndown
  const pluginScriptsHtml: PluginScriptEntry[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="plugin-script-block"[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const codeM = match.match(/data-code="([^"]*)"/);
      const blockIdM = match.match(/data-block-id="([^"]*)"/);
      const modeM = match.match(/data-mode="([^"]*)"/);
      const labelM = match.match(/data-label="([^"]*)"/);
      pluginScriptsHtml.push({
        code: codeM ? decodeURIComponent(codeM[1]) : '',
        blockId: blockIdM ? blockIdM[1] : '',
        mode: modeM ? modeM[1] : 'manual',
        label: labelM ? labelM[1] : 'Script',
      });
      return `##PLUGINSCRIPT${pluginScriptsHtml.length - 1}##`;
    }
  );

  // Pre-process: Replace event blocks with placeholders before Turndown.
  // EventBlock renders as an EMPTY <div data-type="event-block" data-…>, and
  // Turndown drops empty (isBlank) divs before any custom rule can run — so
  // without this escape the event silently disappears on save. Restored to a
  // ```event fence after Turndown (see below).
  const eventBlocks: EventBlockEscaped[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="event-block"[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const dec = (name: string) => {
        const m = match.match(new RegExp(`${name}="([^"]*)"`));
        if (!m) return '';
        try {
          return decodeURIComponent(m[1]);
        } catch {
          return m[1];
        }
      };
      eventBlocks.push({
        eventName: dec('data-event-name'),
        start: dec('data-start'),
        end: dec('data-end'),
        description: dec('data-description'),
        taskId: dec('data-task-id'),
        taskName: dec('data-task-name'),
        projectName: dec('data-project-name'),
      });
      return `##EVENTBLOCK${eventBlocks.length - 1}##`;
    }
  );

  // Pre-process: karty zadań. Pusty <div data-type="task-card"> turndown
  // uznaje za blank i wyrzuca, zanim jakakolwiek reguła zdąży go zobaczyć —
  // stąd znacznik, tak samo jak przy blokach zdarzeń.
  const taskCards: TaskCardEscaped[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="task-card"[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const dec = (name: string) => {
        const m = match.match(new RegExp(`${name}="([^"]*)"`));
        if (!m) return '';
        try {
          return decodeURIComponent(m[1]);
        } catch {
          return m[1];
        }
      };
      taskCards.push({ taskId: dec('data-task-id'), taskName: dec('data-task-name') });
      return `##TASKCARD${taskCards.length - 1}##`;
    }
  );

  // Pre-process: Replace photo-map blocks with placeholders before Turndown
  // (empty <div data-type="photo-map"> would otherwise be dropped as blank).
  const photoMaps: string[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="photo-map"[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const m = match.match(/data-config="([^"]*)"/);
      let cfg = '';
      if (m) {
        try {
          cfg = decodeURIComponent(m[1]);
        } catch {
          cfg = m[1];
        }
      }
      photoMaps.push(cfg);
      return `##PHOTOMAP${photoMaps.length - 1}##`;
    }
  );

  // Pre-process: Replace component embeds with placeholders before Turndown
  // This ensures they survive Turndown processing
  // Using placeholder without underscores to avoid Turndown escaping them
  const componentEmbeds: { type: string; id: string }[] = [];

  // Match both formats: with data- prefix and without (Tiptap generates both)
  processedHtml = processedHtml.replace(
    /<span[^>]*data-type="component-embed"[^>]*data-component-type="([^"]*)"[^>]*data-component-id="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_, type, id) => {
      componentEmbeds.push({ type, id });
      return `##COMPEMBED${componentEmbeds.length - 1}##`;
    }
  );

  // Also match if attributes are in different order
  processedHtml = processedHtml.replace(
    /<span[^>]*data-component-type="([^"]*)"[^>]*data-component-id="([^"]*)"[^>]*data-type="component-embed"[^>]*>[\s\S]*?<\/span>/gi,
    (_, type, id) => {
      componentEmbeds.push({ type, id });
      return `##COMPEMBED${componentEmbeds.length - 1}##`;
    }
  );

  // Pre-process math → PLACEHOLDERY (nie tekst!). Puste math-divy turndown gubi
  // (isBlank), więc nie można ich zostawić dla reguły. Ale gdybyśmy — jak wcześniej —
  // wstawili tu surowy `$$latex$$` jako TEKST, turndown zescapowałby markdownowe znaki
  // w LaTeX-u (`\Delta`→`\\Delta`, `x_{2}`→`x\_{2}`), psując wzór przy zapisie.
  // Dlatego wyciągamy LaTeX do tokenów i przywracamy `$$…$$`/`$…$` DOPIERO po turndownie.
  const mathBlockLatex: string[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="math-block"[^>]*>(?:[\s\S]*?<\/div>)?/gi,
    (m) => {
      const dl = m.match(/data-latex="([^"]*)"/i);
      mathBlockLatex.push(dl ? decodeURIComponent(dl[1]) : '');
      return `<p>##MATHBLOCK${mathBlockLatex.length - 1}##</p>`;
    }
  );
  const mathInlineLatex: string[] = [];
  processedHtml = processedHtml.replace(
    /<span[^>]*data-type="inline-math"[^>]*>(?:[\s\S]*?<\/span>)?/gi,
    (m) => {
      const dl = m.match(/data-latex="([^"]*)"/i);
      mathInlineLatex.push(dl ? decodeURIComponent(dl[1]) : '');
      return `##MATHINLINE${mathInlineLatex.length - 1}##`;
    }
  );
  // Kolumny (i inne osadzenia) — bez zmian. Math jest już w placeholderach.
  processedHtml = preprocessColumnContent(processedHtml);

  let markdown = turndownService.turndown(processedHtml);

  // Post-process: przywróć równania (LaTeX verbatim, bez markdownowego escapowania).
  mathBlockLatex.forEach((latex, i) => {
    markdown = markdown.split(`##MATHBLOCK${i}##`).join(latex ? `$$${latex}$$` : '');
  });
  mathInlineLatex.forEach((latex, i) => {
    markdown = markdown.split(`##MATHINLINE${i}##`).join(latex ? `$${latex}$` : '');
  });

  // Post-process: replace %%BID:id%% text placeholders with <!-- bid:id --> comments
  // Accept any ID format (UUID or legacy slug) so old documents round-trip correctly
  markdown = markdown.replace(/%%BID:([^%\n]+)%%/g, (_, id) => `<!-- bid:${id} -->`);

  // Post-process: Restore raw-markdown blocks — inject the stored source verbatim.
  rawMdBlocks.forEach((src, index) => {
    markdown = markdown.split(`##RAWMDBLOCK${index}##`).join(src);
  });

  // Post-process: Restore Obsidian embeds as ![[target]]
  mdEmbedTargets.forEach((target, index) => {
    const dec = target
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    markdown = markdown.split(`##MDEMBEDOUT${index}##`).join(dec ? `![[${dec}]]` : '');
  });

  // Post-process: Restore UI form embeds as @[uiform:...] syntax
  uiForms.forEach((form, index) => {
    const placeholder = `##UIFORMEMBED${index}##`;
    const replacement = form.inline
      ? `@[uiform:${form.inline}]`
      : form.id
        ? `@[uiform:${form.id}]`
        : '';
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore component embeds as @[type:id] syntax
  componentEmbeds.forEach((embed, index) => {
    const placeholder = `##COMPEMBED${index}##`;
    const replacement = embed.type ? `@[${embed.type}:${embed.id || ''}]` : '';
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore form-engine embeds as @[form:path] syntax
  formEngineEmbeds.forEach((path, index) => {
    const placeholder = `##FORMEMBED${index}##`;
    const replacement = path ? `@[form:${path}]` : '';
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore CAD view embeds as @[cad:{mode}:{path|url}]
  cadViews.forEach((v, index) => {
    const placeholder = `##CADVIEW${index}##`;
    const replacement = `@[cad:${v.mode}:${v.value}]`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore Web embeds as @[web:mode:value]
  webEmbeds.forEach((v, index) => {
    const placeholder = `##WEBEMBED${index}##`;
    const replacement = `@[web:${v.mode}:${v.value}]`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore gallery embeds as @[gallery:provider:source[|selected]]
  galleries.forEach((g, index) => {
    const tail = g.selected ? `|${g.selected}` : '';
    markdown = markdown
      .split(`##GALLERY${index}##`)
      .join(`@[gallery:${g.provider}:${g.source}${tail}]`);
  });

  // Post-process: Restore TableView blocks as @[tableview:<encoded>]
  tableViews.forEach((cfg, index) => {
    markdown = markdown.split(`##TABLEVIEW${index}##`).join(`@[tableview:${cfg}]`);
  });

  // Post-process: Restore InfoMark inline embeds as
  // @[info:text:title:body:bodyPath], each segment URL-encoded so colons /
  // brackets / newlines / slashes don't collide with the @[…] bracket parser.
  // Restore File chips + env-value markers
  fileRefs.forEach((f, index) => {
    const tail = `${f.env || f.format ? '|' + f.env : ''}${f.format ? '|' + f.format : ''}`;
    markdown = markdown.split(`##FILEREF${index}##`).join(`@[file:${f.path}${tail}]`);
  });
  envValues.forEach((name, index) => {
    markdown = markdown.split(`##ENVVAL${index}##`).join(`{{env:${name}}}`);
  });

  infoMarks.forEach((m, index) => {
    const placeholder = `##INFOMARK${index}##`;
    const enc = (s: string) => encodeURIComponent(s);
    const replacement = `@[info:${enc(m.text)}:${enc(m.title)}:${enc(m.body)}:${enc(m.bodyPath)}]`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore plugin script blocks as ```pscript code fences
  pluginScriptsHtml.forEach((s, index) => {
    const placeholder = `##PLUGINSCRIPT${index}##`;
    const label = encodeURIComponent(s.label);
    const replacement = `\n\`\`\`pscript:${s.blockId}:${s.mode}:${label}\n${s.code}\n\`\`\`\n`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore event blocks as ```event JSON fences (parsed back on
  // load by escapeEventBlocksForHtml — same shape as EventBlockEscaped).
  eventBlocks.forEach((ev, index) => {
    const placeholder = `##EVENTBLOCK${index}##`;
    const replacement = `\n\`\`\`event\n${JSON.stringify(ev, null, 2)}\n\`\`\`\n`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: karty zadań z powrotem do ```taskcard.
  taskCards.forEach((card, index) => {
    const placeholder = `##TASKCARD${index}##`;
    const replacement = `\n\`\`\`taskcard\n${JSON.stringify(card, null, 2)}\n\`\`\`\n`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore photo-map blocks as ```photomap JSON fences.
  photoMaps.forEach((cfg, index) => {
    const placeholder = `##PHOTOMAP${index}##`;
    const replacement = `\n\`\`\`photomap\n${cfg}\n\`\`\`\n`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: bloki kodu z pliku → ` ```lang file=src ` (puste ciało).
  extCodeMarkers.forEach(({ lang, src }, i) => {
    markdown = markdown.split(`%%EXTCODE${i}%%`).join(`\`\`\`${lang} file=${src}\n\`\`\``);
  });

  // Post-process: osadzenia YouTube → ` ```youtube {json} `.
  ytMarkers.forEach((yt, i) => {
    const cfg: Record<string, unknown> = { videoId: yt.videoId };
    if (yt.start) cfg.start = Number(yt.start);
    if (yt.width && yt.width !== '100%') cfg.width = yt.width;
    if (yt.align && yt.align !== 'center') cfg.align = yt.align;
    markdown = markdown
      .split(`%%YOUTUBE${i}%%`)
      .join(`\`\`\`youtube\n${JSON.stringify(cfg)}\n\`\`\``);
  });

  return markdown;
}
