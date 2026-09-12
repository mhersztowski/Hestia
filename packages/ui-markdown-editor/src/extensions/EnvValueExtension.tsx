/**
 * EnvValue — a short inline marker that renders the current value of a document
 * env variable as text. Written in markdown as `{{env:name}}`.
 */
import React, { useSyncExternalStore } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { useMdEnv } from './MdEnvContext';

function renderValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}

const EnvValueNodeView: React.FC<NodeViewProps> = ({ node, editor }) => {
  const name = (node.attrs.name as string) || '';
  const env = useMdEnv();
  // Subscribe to the env store directly. A File chip fills the value AFTER this
  // node first renders (async read); React context alone doesn't reliably
  // re-render node views living in TipTap's portals in a production build, so
  // without this the value would arrive but the marker would stay literal — the
  // "works in dev, shows {{env:…}} on prod" symptom. useSyncExternalStore forces
  // the re-render off the store's own subscription.
  const value = useSyncExternalStore(env.subscribe, () => renderValue(env.get(name)));
  return (
    <NodeViewWrapper as="span" className="md-envvalue" title={editor.isEditable ? `env: ${name}` : undefined}>
      {value !== '' ? value : <span className="md-envvalue-empty" contentEditable={false}>{`{{env:${name}}}`}</span>}
    </NodeViewWrapper>
  );
};

export const EnvValue = Node.create({
  name: 'envValue',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: { default: '', parseHTML: (el) => el.getAttribute('data-name') || '', renderHTML: (a) => ({ 'data-name': a.name }) },
    };
  },

  parseHTML() { return [{ tag: 'span[data-type="env-value"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'env-value' })]; },
  addNodeView() { return ReactNodeViewRenderer(EnvValueNodeView); },
});

export default EnvValue;
