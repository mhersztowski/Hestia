import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { IconButton, Tooltip, Box } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { MathEditorDialog } from './MathEditorDialog';

// Inline Math Node View Component
const InlineMathNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(node.attrs.latex || 'x', containerRef.current, {
          throwOnError: false,
          displayMode: false,
        });
      } catch (e) {
        containerRef.current.innerHTML = `<span style="color: red;">${node.attrs.latex}</span>`;
      }
    }
  }, [node.attrs.latex]);

  return (
    <NodeViewWrapper as="span" className="inline-math-wrapper">
      <Tooltip title="Kliknij aby edytować LaTeX" arrow placement="top">
        <span
          ref={containerRef}
          onClick={() => setDialogOpen(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`inline-math ${selected ? 'selected' : ''}`}
          style={{
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: selected || isHovered ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.05)',
            border: selected ? '1px solid #1976d2' : '1px solid transparent',
            transition: 'all 0.2s ease',
          }}
        />
      </Tooltip>
      <MathEditorDialog
        open={dialogOpen}
        initialLatex={node.attrs.latex}
        displayMode={false}
        onSave={(latex) => { updateAttributes({ latex }); setDialogOpen(false); }}
        onClose={() => setDialogOpen(false)}
      />
    </NodeViewWrapper>
  );
};

// Block Math Node View Component
const MathBlockNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(node.attrs.latex || 'E = mc^2', containerRef.current, {
          throwOnError: false,
          displayMode: true,
        });
      } catch (e) {
        containerRef.current.innerHTML = `<span style="color: red;">Błąd LaTeX: ${node.attrs.latex}</span>`;
      }
    }
  }, [node.attrs.latex]);

  return (
    <NodeViewWrapper className="math-block-wrapper">
      <Box
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          position: 'relative',
          textAlign: 'center',
          padding: '20px',
          margin: '8px 0',
          backgroundColor: selected || isHovered ? 'rgba(25, 118, 210, 0.05)' : '#fafafa',
          borderRadius: '8px',
          cursor: 'pointer',
          border: selected ? '2px solid #1976d2' : '1px solid #e0e0e0',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(25, 118, 210, 0.08)',
            borderColor: '#1976d2',
          },
        }}
        onClick={() => setDialogOpen(true)}
      >
        {/* Edit button overlay */}
        {(isHovered || selected) && (
          <Tooltip title="Edytuj równanie" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setDialogOpen(true);
              }}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: '#1976d2',
                color: 'white',
                '&:hover': {
                  backgroundColor: '#1565c0',
                },
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <div ref={containerRef} className="math-block-content" />

        {/* Hint text */}
        {(isHovered || selected) && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '11px',
              color: '#666',
              backgroundColor: 'rgba(255,255,255,0.9)',
              padding: '2px 8px',
              borderRadius: '4px',
            }}
          >
            Kliknij aby edytować
          </Box>
        )}
      </Box>
      <MathEditorDialog
        open={dialogOpen}
        initialLatex={node.attrs.latex}
        displayMode
        onSave={(latex) => { updateAttributes({ latex }); setDialogOpen(false); }}
        onClose={() => setDialogOpen(false)}
      />
    </NodeViewWrapper>
  );
};

// Inline Math Extension
export const InlineMath = Node.create({
  name: 'inlineMath',

  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: 'x',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-math"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          const latex = element.getAttribute('data-latex');
          return latex ? { latex: decodeURIComponent(latex) } : {};
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-type': 'inline-math',
      'data-latex': encodeURIComponent(node.attrs.latex || ''),
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineMathNodeView);
  },

  addCommands() {
    return {
      insertInlineMath: (latex = 'x') => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { latex },
        });
      },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /\$([^$\s][^$]*[^$\s]?)\$$/,
        type: this.type,
        getAttributes: (match) => ({
          latex: match[1],
        }),
      }),
    ];
  },
});

// Block Math Extension
export const MathBlock = Node.create({
  name: 'mathBlock',

  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: 'E = mc^2',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-block"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          const latex = element.getAttribute('data-latex');
          return latex ? { latex: decodeURIComponent(latex) } : {};
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'math-block',
      'data-latex': encodeURIComponent(node.attrs.latex || ''),
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockNodeView);
  },

  addCommands() {
    return {
      insertMathBlock: (latex = 'E = mc^2') => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { latex },
        });
      },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /^\$\$(.+)\$\$$/,
        type: this.type,
        getAttributes: (match) => ({
          latex: match[1],
        }),
      }),
    ];
  },
});

// Add type declarations for the commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineMath: {
      insertInlineMath: (latex?: string) => ReturnType;
    };
    mathBlock: {
      insertMathBlock: (latex?: string) => ReturnType;
    };
  }
}
