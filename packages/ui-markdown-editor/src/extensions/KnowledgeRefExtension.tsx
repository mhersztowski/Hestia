/**
 * KnowledgeRef — odsyłacz do hasła słownika albo wzoru bazy wiedzy, w linii.
 *
 * Zapis w markdownie to `((identyfikator))` albo `((identyfikator|podpis))`.
 * **Nie `[[…]]`** — ten nawias jest w tym edytorze zajęty przez obsidianowe
 * linki do plików (`[[notatka]]` → `drive/notatka.md`), więc odsyłacz do wzoru
 * zamieniał się w link do nieistniejącego pliku i „otwórz" nie działało.
 * Podwójny nawias okrągły znaczy w Roam i Logseq „odniesienie do bloku", czyli
 * dokładnie to, czym jest odsyłacz: wskazaniem fragmentu, nie pliku.
 *
 * Cel rozwiązujemy przez indeks bazy wiedzy, budowany **leniwie i raz** —
 * dokument z odsyłaczami bywa otwierany bez potrzeby wchodzenia do bazy, więc
 * skan katalogu nie może się dziać przy montowaniu edytora.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Box, CircularProgress, Popper, Paper, Button, Typography } from '@mui/material';
import { parseTermBlock, parseFormulaBlock } from '@hestia/core-sci';
import { FigureBlock, TableBlock } from '@hestia/ui-sci-blocks';
import { useEditorServices, type ResolvedKnowledgeRef as RozwiazanyOdsylacz } from '../capabilities';

/** Czy urządzenie umie najeżdżać — na dotyku dymek otwiera tapnięcie. */
function czyMysz(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(hover: hover)').matches;
}

/**
 * Widok odsyłacza.
 *
 * Wyeksportowany, żeby dało się go sprawdzić testem bez stawiania całego
 * edytora — komponent czyta z `node` wyłącznie `attrs`.
 */
export const KnowledgeRefView: React.FC<NodeViewProps> = ({ node }) => {
  const refId = String(node.attrs.refId ?? '');
  const label = String(node.attrs.label ?? '');
  const kotwica = useRef<HTMLSpanElement>(null);
  const dymek = useRef<HTMLDivElement>(null);
  const [mysz] = useState(czyMysz);
  const navigate = useNavigate();
  const [otwarty, setOtwarty] = useState(false);
  const [cel, setCel] = useState<RozwiazanyOdsylacz | null | undefined>(undefined);
  const { knowledgeRefs } = useEditorServices();
  const zamkniecie = useRef<ReturnType<typeof setTimeout>>();

  const anulujZamkniecie = useCallback(() => {
    if (zamkniecie.current) clearTimeout(zamkniecie.current);
    zamkniecie.current = undefined;
  }, []);

  /**
   * Zamknięcie odroczone.
   *
   * Dymek jest tu w portalu (`Popper`), więc kursor **zawsze** opuszcza kotwicę
   * w drodze do niego. Natychmiastowe zamknięcie sprawiało, że przycisku
   * „otwórz" nie dało się kliknąć w ogóle.
   */
  const odlozZamkniecie = useCallback(() => {
    anulujZamkniecie();
    zamkniecie.current = setTimeout(() => setOtwarty(false), 180);
  }, [anulujZamkniecie]);

  useEffect(() => anulujZamkniecie, [anulujZamkniecie]);

  // Indeks bazy czytamy dopiero wtedy, gdy czytelnik naprawdę chce zobaczyć cel.
  const pokaz = useCallback(() => {
    anulujZamkniecie();
    setOtwarty(true);
    if (cel === undefined && knowledgeRefs) void knowledgeRefs.resolve(refId).then((c) => setCel(c ?? null));
  }, [anulujZamkniecie, cel, refId, knowledgeRefs]);

  useEffect(() => {
    if (!otwarty || mysz) return undefined;
    const pozaDymkiem = (e: Event) => {
      const cel = e.target as Node;
      // Dymek jest w **portalu**, więc nie jest potomkiem kotwicy. Sprawdzanie
      // samej kotwicy uznawało kliknięcie w przycisk „otwórz" za kliknięcie
      // obok: dymek zamykał się na `pointerdown`, zanim kliknięcie dotarło,
      // i na dotyku przycisk nie działał w ogóle.
      if (kotwica.current?.contains(cel) || dymek.current?.contains(cel)) return;
      setOtwarty(false);
    };
    const naEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOtwarty(false); };
    document.addEventListener('pointerdown', pozaDymkiem);
    document.addEventListener('keydown', naEscape);
    return () => {
      document.removeEventListener('pointerdown', pozaDymkiem);
      document.removeEventListener('keydown', naEscape);
    };
  }, [otwarty, mysz]);

  /**
   * Przejście do celu — **nawigacją aplikacji**, nie `window.location`.
   *
   * Twarde przeładowanie startowało całą aplikację od nowa, a strona bazy
   * skanuje katalog przy montowaniu — trafiała więc w moment, w którym MQTT
   * jeszcze się nie połączył, i kończyła komunikatem „Not connected to MQTT
   * broker". Edytor zawsze żyje wewnątrz routera aplikacji, więc `useNavigate`
   * jest tu bezpieczne.
   */
  const przejdz = useCallback(() => {
    // Kotwica w adresie, żeby po przejściu było widać **do czego** kliknięto,
    // a nie tylko sam dokument.
    if (cel?.path) navigate(`/knowledge/${cel.path}#ref-${refId}`);
  }, [cel, navigate, refId]);

  const haslo = cel?.kind === 'term' && cel.code ? parseTermBlock(refId, cel.code) : undefined;
  const wzor = cel?.kind === 'formula' && cel.code ? parseFormulaBlock(refId, cel.code) : undefined;
  const rysunek = cel?.kind === 'figure' ? cel.code : undefined;
  const tablica = cel?.kind === 'table' ? cel.code : undefined;
  const paragraf = cel?.kind === 'section';

  const czego = haslo ? 'hasło'
    : rysunek ? 'rysunek'
      : tablica ? 'tablicę'
        : paragraf ? 'paragraf'
          : 'wzór';

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      <Box
        component="span"
        ref={kotwica}
        onMouseEnter={mysz ? pokaz : undefined}
        onMouseLeave={mysz ? odlozZamkniecie : undefined}
        onClick={() => (mysz ? pokaz() : (otwarty ? setOtwarty(false) : pokaz()))}
        sx={{
          fontStyle: 'italic',
          color: '#4338ca',
          borderBottom: '1px dotted #c7d2fe',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label || refId}
      </Box>

      <Popper
        open={otwarty}
        anchorEl={kotwica.current}
        placement="top-start"
        style={{ zIndex: 1400 }}
        modifiers={[
          // Popper sam odbija dymek pod słowo i domyka go do widoku, ale trzeba
          // mu to włączyć jawnie razem z marginesem od krawędzi.
          { name: 'flip', enabled: true },
          { name: 'preventOverflow', enabled: true, options: { padding: 8 } },
        ]}
        onMouseEnter={mysz ? anulujZamkniecie : undefined}
        onMouseLeave={mysz ? odlozZamkniecie : undefined}
      >
        <Paper
          ref={dymek}
          elevation={4}
          sx={{
            p: 1.25,
            mb: 1,
            maxWidth: 'min(320px, calc(100vw - 32px))',
            // Rysunek na całą stronę urósłby ponad wysokość ekranu — dymek
            // przewija się w środku zamiast wychodzić poza widok.
            maxHeight: 'min(60vh, 420px)',
            overflowY: 'auto',
            fontStyle: 'normal',
          }}
        >
          {cel === undefined && <CircularProgress size={14} />}
          {cel === null && (
            <Typography variant="caption" color="error">
              Nie ma „{refId}" w bazie wiedzy.
            </Typography>
          )}
          {haslo && (
            <>
              <Typography variant="subtitle2">{haslo.term}</Typography>
              <Typography variant="body2" sx={{ fontSize: 12, mt: 0.25 }}>{haslo.definition}</Typography>
              {haslo.source && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  {haslo.source}
                </Typography>
              )}
            </>
          )}
          {wzor && (
            <>
              <Typography variant="caption" color="text.secondary" display="block">{refId}</Typography>
              <Typography variant="body2" sx={{ fontSize: 12, mt: 0.25 }}>
                {wzor.target} = {wzor.chain?.join(' = ') ?? wzor.expression}
              </Typography>
            </>
          )}
          {rysunek && <FigureBlock id={refId} code={rysunek} compact />}
          {tablica && <TableBlock id={refId} code={tablica} compact />}
          {paragraf && (
            <Typography variant="subtitle2">{cel?.documentTitle ?? refId}</Typography>
          )}
          {cel && (
            <Button size="small" sx={{ mt: 0.75, fontSize: 11 }} onClick={przejdz}>
              {paragraf ? 'przejdź do paragrafu' : `otwórz ${czego}`}
            </Button>
          )}
        </Paper>
      </Popper>
    </NodeViewWrapper>
  );
};

export const KnowledgeRef = TiptapNode.create({
  name: 'knowledgeRef',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      refId: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-ref-id') ?? '' },
      label: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="knowledge-ref"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'knowledge-ref',
        'data-ref-id': node.attrs.refId,
        'data-label': node.attrs.label,
      }),
      node.attrs.label || node.attrs.refId,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KnowledgeRefView);
  },
});

export default KnowledgeRef;
