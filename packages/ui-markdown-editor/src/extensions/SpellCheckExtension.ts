/**
 * SpellCheckExtension — TipTap plugin that decorates text with
 * spelling/grammar issues from LanguageTool.
 *
 * Lifecycle:
 *   1. Document changes (or language toggle) → debounced 1500 ms
 *   2. Service request → matches
 *   3. Dispatch transaction with `meta.decorations` → ProseMirror paints
 *      red wavy underline at each match's character range
 *
 * Click handling lives outside this extension. The decoration includes
 * `data-spell-error` + serialised match payload so a parent component can
 * mount its own popover (suggestions list, accept/ignore actions).
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorSpellChecker, SpellMatch } from '../capabilities';

const spellCheckKey = new PluginKey('spellcheck');

export interface SpellCheckExtensionOptions {
  /** Live getter for the active language. Called every check tick so a
   *  language switch in the UI takes effect on the very next debounce
   *  cycle without remounting the editor. */
  getLanguage: () => string;
  /** Live getter for the on/off flag. Same rationale as getLanguage. */
  getEnabled: () => boolean;
  /** Debounce window in ms. 1500 is a good balance: long enough to
   *  avoid spamming on every keystroke, short enough that the user
   *  sees the underline before they look away. */
  debounceMs?: number;
  /** Notify the host when new matches arrive (or are cleared). Lets
   *  toolbar / status bar show a "N issues" pill. */
  onMatchesChange?: (matches: SpellMatch[]) => void;
  /**
   * The host's spell checker. Absent means this extension marks nothing —
   * which is not the same claim as marking everything correct, and looks the
   * same on screen, so there is no default that returns an empty list.
   */
  spellChecker?: EditorSpellChecker | null;
}

export const SpellCheckExtension = Extension.create<SpellCheckExtensionOptions>({
  name: 'spellcheck',

  addOptions() {
    return {
      // Sensible no-op defaults so the extension can be added without
      // any wiring (it just stays idle).
      getLanguage: () => 'pl',
      getEnabled: () => false,
      debounceMs: 1500,
      onMatchesChange: undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    // Module-scope state shared across the view's lifecycle. Kept here
    // instead of in plugin state so the timer survives intermediate
    // transactions (which the plugin state's apply() recreates).
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let latestRequestId = 0;

    return [
      new Plugin({
        key: spellCheckKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, oldState) {
            // A meta-tagged transaction carries fresh decorations from
            // the async check. Anything else we map through the
            // mapping so highlights ride along with insertions/
            // deletions until the next check runs.
            const meta = tr.getMeta(spellCheckKey) as { decorations?: DecorationSet } | undefined;
            if (meta?.decorations) return meta.decorations;
            return oldState.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return spellCheckKey.getState(state) as DecorationSet;
          },
        },
        view(editorView) {
          /** Run a check now. Cancellable through requestId — a newer
           *  request supersedes an older one so we don't show stale
           *  decorations after fast typing. */
          const runCheck = async () => {
            // Read live values — the host's React state can change since
            // the extension was configured.
            const enabled = options.getEnabled();
            const language = options.getLanguage();
            if (!enabled) {
              editorView.dispatch(
                editorView.state.tr.setMeta(spellCheckKey, { decorations: DecorationSet.empty }),
              );
              options.onMatchesChange?.([]);
              return;
            }
            // textBetween with '\n' separator preserves paragraph
            // boundaries so LT's sentence-boundary logic doesn't
            // splice unrelated paragraphs.
            const text = editorView.state.doc.textBetween(
              0, editorView.state.doc.content.size, '\n', '\n',
            );
            const myId = ++latestRequestId;
            const checker = options.spellChecker;
            if (!checker) return;
            const matches = await checker.checkSpelling(text, language);
            if (myId !== latestRequestId) return; // a newer request took over

            // ProseMirror positions: doc starts at 1 (position 0 is
            // BEFORE the first node). LanguageTool gives 0-based byte
            // offsets into our plain-text projection. We add 1 to align.
            const decorations = matches.map(m =>
              Decoration.inline(m.offset + 1, m.offset + m.length + 1, {
                class: 'md-spell-error',
                'data-spell-error': 'true',
                'data-match-offset': String(m.offset),
                'data-match-length': String(m.length),
                'data-match-message': m.message,
                'data-match-category': m.category,
                'data-match-rule': m.ruleId,
                'data-match-replacements': JSON.stringify(m.replacements),
              }),
            );
            editorView.dispatch(
              editorView.state.tr.setMeta(spellCheckKey, {
                decorations: DecorationSet.create(editorView.state.doc, decorations),
              }),
            );
            options.onMatchesChange?.(matches);
          };

          const schedule = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runCheck, options.debounceMs ?? 1500);
          };

          // First-run kick: in case the editor mounts with content
          // already present. Without this the user has to type a
          // character before any check fires.
          schedule();

          return {
            update: () => {
              schedule();
            },
            destroy: () => {
              if (debounceTimer) clearTimeout(debounceTimer);
            },
          };
        },
      }),
    ];
  },
});

export type { SpellMatch };
