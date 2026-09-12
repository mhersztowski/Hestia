import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import React, { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import hljs from 'highlight.js';
import Editor from 'react-simple-code-editor';
import { useEditorFiles, useEditorServices } from '../capabilities';
import CodeFilePickerDialog, { langFromPath } from './CodeFilePickerDialog';
import { blockBeforeCursor } from './selectBlockBefore';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { blockRenderersVersion, rendererFor, subscribeBlockRenderers } from './blockRenderers';
import { replaceBlockText } from './blockText';

/** Zdarzenie wysyłane przez MdEditor przy autosave — bloki z pliku zapisują wtedy swój plik. */
export const MD_AUTOSAVE_EVENT = 'md:autosave';

const LANGS: { label: string; value: string }[] = [
  { label: 'plain', value: '' },
  { label: 'C++ / Arduino', value: 'cpp' },
  { label: 'C', value: 'c' },
  { label: 'Python', value: 'python' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Bash / Shell', value: 'bash' },
  { label: 'JSON', value: 'json' },
  { label: 'YAML', value: 'yaml' },
  { label: 'HTML', value: 'xml' },
  { label: 'CSS', value: 'css' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'INI / TOML', value: 'ini' },
  { label: 'Rust', value: 'rust' },
  { label: 'Go', value: 'go' },
  { label: 'Java', value: 'java' },
  { label: 'SQL', value: 'sql' },
  { label: 'Makefile', value: 'makefile' },
  { label: 'Mermaid (diagram)', value: 'mermaid' },
  { label: 'Projekt UML (.umlproj.json)', value: 'umlproj' },
  { label: 'DOT / Graphviz', value: 'dot' },
  { label: 'PlantUML (diagram klas)', value: 'plantuml' },
];

/**
 * Bloki z własnym widokiem.
 *
 * Infostring takiego bloku ma dwie części: **typ** (`formula`) i **nazwę**
 * (`orbita-okres`). Na liście typów stoi wyłącznie typ — nazwa jest cechą tego
 * konkretnego wzoru, nie osobnym rodzajem bloku, i edytuje się ją obok, w
 * własnym polu. Wrzucenie pełnego infostringu do listy znaczyłoby, że każdy
 * nowy wzór w dokumencie dokłada pozycję do rozwijanego menu.
 */
const NAMED_BLOCKS: Array<{ label: string; prefix: string; needsId: boolean }> = [
  { label: 'Wzór (formula)', prefix: 'formula', needsId: true },
  { label: 'Symulacja (sim)', prefix: 'sim', needsId: false },
  { label: 'Model w skrypcie (simscript)', prefix: 'simscript', needsId: false },
  { label: 'Zadanie (exercise)', prefix: 'exercise', needsId: true },
  { label: 'Pole na siatce (field)', prefix: 'field', needsId: true },
  { label: 'Przekształcenie liniowe (linalg)', prefix: 'linalg', needsId: true },
  { label: 'Procedura krokowa (procedure)', prefix: 'procedure', needsId: true },
];

/** Rozkłada infostring na typ i nazwę: `formula:okres` → `['formula', 'okres']`. */
function splitInfostring(language: string): { prefix: string; id: string } {
  const colon = language.indexOf(':');
  return colon < 0
    ? { prefix: language, id: '' }
    : { prefix: language.slice(0, colon), id: language.slice(colon + 1) };
}

/**
 * Nazwa dopuszczalna w infostringu.
 *
 * Spacje i znaki spoza zakresu rozbiłyby parsowanie bloku, więc zamieniamy je
 * po cichu zamiast odrzucać wpisany tekst — autor pisze „okres wahadła", a
 * dostaje `okres-wahadla`, co jest tym, o co mu chodziło.
 */
function sanitizeId(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/gi, 'l')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .toLowerCase();
}

/** Nazwa robocza dla nowego bloku — krótka i łatwa do podmiany. */
function draftId(): string {
  return `nowy-${Math.random().toString(36).slice(2, 6)}`;
}

// Widok bloku dla `mermaid` (i kolejnych języków) przychodzi z rejestru —
// patrz `blockRenderers.ts`. Edytor nie zna już listy takich języków.

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

/** Podświetlanie składni przez highlight.js (własne — działa natychmiast po zmianie języka). */
function highlightCode(code: string, lang: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
  } catch { /* fall through */ }
  return escapeHtml(code);
}

const bar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  padding: '4px 8px', fontSize: 12, borderBottom: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(0,0,0,0.03)', userSelect: 'none',
};
const sel: React.CSSProperties = { fontSize: 12, padding: '2px 4px', borderRadius: 4, cursor: 'pointer' };
const MONO = "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace";
// `white-space: pre` + `tab-size` → zachowuje wcięcia; `overflow: auto` → poziomy scroll.
const preStyle: React.CSSProperties = {
  margin: 0, padding: '10px 12px', overflow: 'auto', fontSize: 13, lineHeight: 1.5,
  whiteSpace: 'pre', tabSize: 2, MozTabSize: 2, fontFamily: MONO,
} as React.CSSProperties;

const CodeBlockView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, getPos }) => {
  const language: string = node.attrs.language || '';
  const { prefix: selectedType, id: blockId } = splitInfostring(language);
  const namedBlock = NAMED_BLOCKS.find((b) => b.prefix === selectedType);
  // Subskrypcja rejestru: widok bloku może zostać zarejestrowany po pierwszym
  // renderze (moduł ładowany asynchronicznie, ponowna próba po błędzie). Bez
  // niej blok zostałby zwykłym kodem mimo dostępnego widoku.
  useSyncExternalStore(subscribeBlockRenderers, blockRenderersVersion, blockRenderersVersion);
  const blockRenderer = rendererFor(language);

  /**
   * Wszystkie bloki kodu dokumentu — czytane wprost z ProseMirror.
   *
   * Świadomie bez konwersji całego dokumentu do markdownu: interesują nas same
   * bloki, a konwersja przy każdym renderze bloku symulacji byłaby najdroższą
   * rzeczą na stronie.
   */
  /**
   * Podmienia treść **innego** bloku dokumentu, wskazanego infostringiem.
   *
   * Potrzebne blokom sterującym czymś zapisanym gdzie indziej: rysunek warunku
   * początkowego powstaje przy bloku `field`, ale jego miejscem jest `formula`.
   * Bez tego rysunek musiałby żyć obok równania i mogłyby się rozejść.
   */
  const replaceOtherBlock = useCallback((language: string, next: string) => {
    if (!editor) return;

    let pozycja: number | undefined;
    let wezel: ProseMirrorNode | undefined;
    editor.state.doc.descendants((child, pos) => {
      if (child.type.name === 'codeBlock' && (child.attrs.language || '') === language) {
        pozycja = pos;
        wezel = child;
        return false;
      }
      return true;
    });
    if (pozycja === undefined || !wezel) return;

    editor.chain().focus().command(({ tr }) => {
      // Zamiana samej treści węzła; atrybuty (język, identyfikator) zostają,
      // bo zmieniamy warunek początkowy, a nie rodzaj bloku.
      tr.replaceWith(
        pozycja! + 1,
        pozycja! + wezel!.nodeSize - 1,
        next ? editor.schema.text(next) : [],
      );
      return true;
    }).run();
  }, [editor]);

  const collectCodeBlocks = useCallback(() => {
    const blocks: Array<{ language: string; code: string }> = [];
    editor?.state.doc.descendants((child) => {
      if (child.type.name === 'codeBlock') {
        blocks.push({ language: child.attrs.language || '', code: child.textContent });
      }
      return true;
    });
    return blocks;
  }, [editor]);
  const externalSrc: string = node.attrs.externalSrc || '';
  const { readFile, writeFile } = useEditorFiles() ?? {};
  const { modelWorkerFactory } = useEditorServices();

  const [pickerOpen, setPickerOpen] = useState(false);
  // Zewnętrzny plik: treść trzymana lokalnie (nie w dokumencie md).
  const [extCode, setExtCode] = useState('');
  const [extState, setExtState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [extErr, setExtErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const dirtyRef = useRef(false);
  const extCodeRef = useRef('');
  extCodeRef.current = extCode;

  // Wczytanie pliku przy loadzie / zmianie ścieżki.
  useEffect(() => {
    if (!externalSrc) { setExtCode(''); setExtState('idle'); return; }
    let alive = true;
    setExtState('loading'); setExtErr('');
    if (!readFile) return;
    Promise.resolve(readFile(externalSrc))
      .then((res: unknown) => {
        if (!alive) return;
        const c = typeof res === 'string' ? res : ((res as { content?: string })?.content ?? '');
        setExtCode(c); setExtState('idle');
      })
      .catch((e: unknown) => { if (alive) { setExtErr(e instanceof Error ? e.message : String(e)); setExtState('error'); } });
    return () => { alive = false; };
  }, [externalSrc, readFile]);

  // Zapis pliku zewnętrznego przy autosave dokumentu md (jeśli były zmiany).
  useEffect(() => {
    if (!externalSrc) return;
    const onSave = () => {
      if (!dirtyRef.current || !writeFile) return;
      dirtyRef.current = false;
      Promise.resolve(writeFile(externalSrc, extCodeRef.current)).catch(() => { /* best effort */ });
    };
    window.addEventListener(MD_AUTOSAVE_EVENT, onSave);
    return () => window.removeEventListener(MD_AUTOSAVE_EVENT, onSave);
  }, [externalSrc, writeFile]);

  const beginEdit = useCallback(() => { setDraft(extCode); setEditing(true); }, [extCode]);
  const commitEdit = useCallback(() => {
    setEditing(false);
    if (draft !== extCode) {
      setExtCode(draft);
      dirtyRef.current = true;
      if (!writeFile) return;
      // Zapis natychmiastowy + i tak zapisze się ponownie przy autosave md.
      Promise.resolve(writeFile(externalSrc, draft)).then(() => { dirtyRef.current = false; }).catch(() => { /* zapisze przy autosave */ });
    }
  }, [draft, extCode, externalSrc, writeFile]);

  /**
   * Podmiana całej treści bloku (zapis z edytora graficznego).
   *
   * Idzie transakcją ProseMirror, a nie `insertContent`: treść bloku kodu jest
   * czystym tekstem i musi nim zostać — `insertContent` rozbiłby wielolinijkowy
   * diagram na osobne akapity.
   */
  const zapiszTresc = useCallback((next: string) => {
    replaceBlockText(editor, typeof getPos === 'function' ? getPos() : null, node, next);
  }, [editor, getPos, node]);

  const isExternal = !!externalSrc;
  const displayCode = isExternal ? extCode : node.textContent;

  return (
    <NodeViewWrapper
      className="md-editor-code-block-wrap"
      style={{ position: 'relative', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, overflow: 'hidden', margin: '0.5rem 0' }}
    >
      <div style={bar} contentEditable={false}>
        <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>{'</>'}</span>
        <select
          value={selectedType}
          onChange={(e) => {
            const wybrane = e.target.value;
            const named = NAMED_BLOCKS.find((b) => b.prefix === wybrane);
            // Blok z nazwą dostaje roboczą od razu: sam typ (`formula`) nie
            // jest poprawnym infostringiem i widok by się nie pojawił.
            updateAttributes({
              language: named
                ? (named.needsId ? `${named.prefix}:${blockId || draftId()}` : named.prefix)
                : wybrane || null,
            });
          }}
          style={sel}
          title="Typ bloku: język do podświetlania albo blok z własnym widokiem"
        >
          {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          {NAMED_BLOCKS.map((b) => (
            <option key={b.prefix} value={b.prefix}>{b.label}</option>
          ))}
          {/* Typ spoza listy (np. `haskell` z cudzego pliku) pokazujemy wprost,
              żeby select nie twierdził, że blok jest zwykłym tekstem. */}
          {selectedType && !LANGS.some((l) => l.value === selectedType)
            && !NAMED_BLOCKS.some((b) => b.prefix === selectedType) && (
            <option value={selectedType}>{selectedType}</option>
          )}
        </select>

        {/* Nazwa bloku — osobne pole, bo to parametr tego wzoru, a nie rodzaj
            bloku. Po niej odwołują się do niego inne wzory i zadania. */}
        {namedBlock?.needsId && (
          <input
            value={blockId}
            onChange={(e) => {
              const czysta = sanitizeId(e.target.value);
              // Pusta nazwa nie jest poprawnym infostringiem — zostawiamy
              // poprzednią, żeby kasowanie tekstu nie psuło bloku.
              if (czysta) updateAttributes({ language: `${namedBlock.prefix}:${czysta}` });
            }}
            placeholder="nazwa wzoru"
            title="Nazwa, po której odwołują się do tego bloku inne wzory i zadania"
            style={{ ...sel, minWidth: 140, fontFamily: 'monospace' }}
          />
        )}

        <span style={{ flex: 1 }} />

        {isExternal && (
          <>
            <span title={externalSrc} style={{ fontFamily: 'monospace', opacity: 0.75, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📄 {externalSrc}
            </span>
            <button type="button" style={sel} onClick={editing ? commitEdit : beginEdit} title="Edytuj zawartość (zapis pod autosave md)">
              {editing ? '💾 Zapisz' : '✏️ Edytuj'}
            </button>
          </>
        )}
        <button type="button" style={sel} onClick={() => setPickerOpen(true)} title="Wybierz zewnętrzny plik (osadzenie jego treści)">
          🔗 plik
        </button>
        {isExternal && (
          <button type="button" style={sel} onClick={() => { updateAttributes({ externalSrc: null }); }} title="Odłącz plik (blok wraca do trybu edytowalnego)">
            ✖
          </button>
        )}
      </div>

      {blockRenderer ? (
        // Blok z własnym widokiem (diagram, wzór, symulacja). Treść w trybie
        // „Code" zostaje dokładnie taka jak dla zwykłego bloku, więc edycja
        // tekstu działa jak dotąd.
        <blockRenderer.Component
          code={displayCode}
          language={language}
          documentBlocks={collectCodeBlocks}
          onBlockChange={replaceOtherBlock}
          onLanguageChange={(next) => updateAttributes({ language: next })}
          workerFactory={modelWorkerFactory ?? undefined}
          onChange={isExternal
            ? (next) => { setExtCode(next); dirtyRef.current = true; }
            : (next) => zapiszTresc(next)}
        >
          {() => (
            isExternal ? (
              <pre className={`hljs language-${language}`} style={preStyle} contentEditable={false} onDoubleClick={beginEdit}>
                <code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: highlightCode(displayCode, language) }} />
              </pre>
            ) : (
              <pre className="md-editor-code-block" style={preStyle}>
                <NodeViewContent as={'code' as unknown as 'div'} className={`hljs language-${language}`} />
              </pre>
            )
          )}
        </blockRenderer.Component>
      ) : isExternal ? (
        editing ? (
          <div contentEditable={false} style={{ maxHeight: 460, overflow: 'auto' }}>
            <Editor
              value={draft}
              onValueChange={setDraft}
              onBlur={commitEdit}
              highlight={(c) => highlightCode(c, language)}
              padding={12}
              tabSize={2}
              insertSpaces
              textareaId="cb-editor"
              autoFocus
              className="hljs"
              preClassName={`hljs language-${language}`}
              style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.5, minHeight: 160 }}
            />
          </div>
        ) : (
          <pre className={`hljs language-${language}`} style={preStyle} contentEditable={false} onDoubleClick={beginEdit} title="Kliknij dwukrotnie, aby edytować">
            <code
              className={`hljs language-${language}`}
              dangerouslySetInnerHTML={{
                __html: extState === 'loading' ? '⏳ Ładowanie pliku…'
                  : extState === 'error' ? `⚠️ Błąd: ${escapeHtml(extErr)}`
                  : highlightCode(displayCode, language),
              }}
            />
          </pre>
        )
      ) : (
        // Tryb inline — edycja w dokumencie; podświetlanie hljs (własne) na read-only warstwie
        // nie jest możliwe nad edytowalną treścią, więc treść jest edytowalna, a klasy hljs/language
        // pozwalają motywowi z MdEditor.css kolorować dekoracje lowlight.
        <pre className="md-editor-code-block" style={preStyle}>
          <NodeViewContent as={'code' as unknown as 'div'} className={`hljs language-${language}`} />
        </pre>
      )}

      <CodeFilePickerDialog
        open={pickerOpen}
        selectedPath={externalSrc}
        onClose={() => setPickerOpen(false)}
        onSelect={(p: string) => {
          // Auto-wykrycie typu (np. .ino/.cpp → C++/Arduino) — jeśli rozpoznane.
          const lang = langFromPath(p);
          updateAttributes({ externalSrc: p || null, ...(lang ? { language: lang } : {}) });
          setPickerOpen(false);
        }}
      />
    </NodeViewWrapper>
  );
};

/**
 * Blok kodu z: (1) selektorem JĘZYKA (kolorowanie hljs), (2) opcjonalnym
 * ZEWNĘTRZNYM PLIKIEM wybieranym z dialogu — jego treść jest wczytywana przy
 * loadzie i osadzana; można ją edytować, a zapis idzie pod autosave dokumentu md.
 */
export function makeCodeBlockWithLang(lowlight: unknown) {
  return CodeBlockLowlight.extend({
    addAttributes() {
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(this.parent?.() as any),
        externalSrc: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-external-src'),
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.externalSrc ? { 'data-external-src': String(attrs.externalSrc) } : {},
        },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView);
    },
    addKeyboardShortcuts() {
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((this.parent?.() ?? {}) as any),
        /**
         * Backspace tuż pod blokiem: pierwszy raz zaznacza blok, drugi go
         * usuwa. Domyślnie ProseMirror wciągał kursor do środka bloku i
         * wyglądało to, jakby klawisz nie działał — bloku z własnym widokiem
         * nie dało się wtedy skasować klawiaturą.
         */
        Backspace: ({ editor }: { editor: TiptapEditor }) => {
          const target = blockBeforeCursor(editor.state, [this.name]);
          if (!target) return false;
          return editor.commands.setNodeSelection(target.pos);
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }).configure({ lowlight, HTMLAttributes: { class: 'md-editor-code-block' } } as any);
}
