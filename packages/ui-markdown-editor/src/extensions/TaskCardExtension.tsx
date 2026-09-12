/**
 * TaskCard — karta zadania osadzona w dokumencie.
 *
 * Notatka odsyłająca do zadania zwykłym linkiem zmusza do klikania, żeby
 * dowiedzieć się rzeczy, które i tak są krótkie: czy zrobione, na kiedy,
 * ile zostało. Karta pokazuje je od razu.
 *
 * ## Co jest w pliku, a co czytane na żywo
 *
 * W markdownie zapisujemy **tylko `taskId` i nazwę**. Reszta — status,
 * priorytet, termin, postęp — jest czytana z bieżących danych przy każdym
 * renderze. Zapisanie ich w pliku znaczyłoby, że notatka sprzed miesiąca
 * pokazuje stan sprzed miesiąca i kłamie tym pewniej, im dłużej leży.
 *
 * Nazwa jest zapisana mimo to, bo jest jedynym, co zostaje, gdy zadanie
 * zniknie: karta powie wtedy „zadanie usunięte" zamiast pustego miejsca.
 *
 * Zapis w markdownie: ```taskcard z JSON-em (patrz markdownConverter).
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Node, mergeAttributes } from '@tiptap/core';
import {
    NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps,
} from '@tiptap/react';
import { Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EventIcon from '@mui/icons-material/Event';
import ScheduleIcon from '@mui/icons-material/Schedule';
import FlagIcon from '@mui/icons-material/Flag';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { DEFAULT_TASK_STATUSES } from '@hestia/core';

import TaskCardDialog from '../TaskCardDialog';
import { formatMinutes, useTaskCard, type RelatedTask } from '../useTaskCard';

export interface TaskCardAttrs {
    taskId: string;
    taskName: string;
}

/** Kolory priorytetów — te same, co w PIM/Projects2. */
const PRIORITY: Record<string, { label: string; color: string }> = {
    urgent: { label: 'Pilne',   color: '#e5484d' },
    high:   { label: 'Wysoki',  color: '#f5a623' },
    normal: { label: 'Zwykły',  color: '#4194f6' },
    low:    { label: 'Niski',   color: '#87909e' },
};

/** `2026-08-20T10:00` → `20.08.2026`. Sam dzień wystarcza na karcie. */
function prettyDate(value?: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function TaskCardNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
    const attrs = node.attrs as TaskCardAttrs;
    const [editing, setEditing] = useState(false);
    const { task, projectName, trackedMinutes, waitsFor, blocks } = useTaskCard(attrs.taskId);

    // Nawigacja routerem, a nie `window.open`: edytor zawsze żyje wewnątrz
    // routera aplikacji, a twarde przeładowanie startowałoby ją od nowa —
    // ta sama pułapka, którą opisuje KnowledgeRefExtension.
    const navigate = useNavigate();
    const { userName } = useParams();

    /** Otwiera wskazane zadanie w PIM. `undefined`, gdy nie ma dokąd iść. */
    const openTask = userName
        ? (id: string) => navigate(
            `/user/${encodeURIComponent(userName)}/pim/projects2`
            + `?task=${encodeURIComponent(id)}`,
        )
        : undefined;

    const status = task?.status
        ? DEFAULT_TASK_STATUSES.find(s => s.id === task.status)
        : undefined;
    const priority = task?.priority ? PRIORITY[task.priority] : undefined;
    const estimateMinutes = task?.duration ? Math.round(task.duration * 60) : 0;
    const overdue = task?.dueDate
        && status?.kind !== 'done'
        && new Date(task.dueDate).getTime() < Date.now();

    return (
        <NodeViewWrapper data-task-card>
            <Paper
                variant="outlined"
                sx={{
                    p: 1.25, my: 1, borderRadius: 2, display: 'flex', gap: 1.25,
                    alignItems: 'flex-start',
                    borderLeft: `3px solid ${status?.color ?? '#87909e'}`,
                    '&:hover .task-card-actions': { opacity: 1 },
                }}
            >
                <TaskAltIcon sx={{ fontSize: 18, color: status?.color ?? '#87909e', mt: '2px' }} />

                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                            {task?.name ?? attrs.taskName}
                        </Typography>
                        {!task && (
                            <Chip size="small" label="zadanie usunięte"
                                  sx={{ height: 18, fontSize: 10 }} color="warning" />
                        )}
                        {status && (
                            <Chip
                                size="small"
                                label={status.name}
                                sx={{
                                    height: 18, fontSize: 10, color: '#fff',
                                    bgcolor: status.color,
                                }}
                            />
                        )}
                    </Stack>

                    {projectName && (
                        <Typography sx={{ fontSize: 11, opacity: .65, mt: .25 }}>
                            {projectName}
                        </Typography>
                    )}

                    {task?.description && (
                        <Typography sx={{
                            fontSize: 12, opacity: .8, mt: .5,
                            display: '-webkit-box', WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                            {task.description}
                        </Typography>
                    )}

                    <Stack direction="row" sx={{ gap: 1.5, mt: .75, flexWrap: 'wrap' }}>
                        {priority && (
                            <Stack direction="row" sx={{ alignItems: 'center', gap: .35 }}>
                                <FlagIcon sx={{ fontSize: 13, color: priority.color }} />
                                <Typography sx={{ fontSize: 11, opacity: .8 }}>{priority.label}</Typography>
                            </Stack>
                        )}
                        {task?.dueDate && (
                            <Stack direction="row" sx={{ alignItems: 'center', gap: .35 }}>
                                <EventIcon sx={{ fontSize: 13, color: overdue ? '#e5484d' : undefined, opacity: .8 }} />
                                <Typography sx={{
                                    fontSize: 11, opacity: .8,
                                    color: overdue ? '#e5484d' : undefined,
                                    fontWeight: overdue ? 600 : 400,
                                }}>
                                    {prettyDate(task.dueDate)}{overdue ? ' — po terminie' : ''}
                                </Typography>
                            </Stack>
                        )}
                        {(trackedMinutes > 0 || estimateMinutes > 0) && (
                            <Stack direction="row" sx={{ alignItems: 'center', gap: .35 }}>
                                <ScheduleIcon sx={{ fontSize: 13, opacity: .8 }} />
                                <Typography sx={{ fontSize: 11, opacity: .8 }}>
                                    {formatMinutes(trackedMinutes) || '0m'}
                                    {estimateMinutes ? ` z ${formatMinutes(estimateMinutes)}` : ''}
                                </Typography>
                            </Stack>
                        )}
                    </Stack>

                    {(waitsFor.length > 0 || blocks.length > 0) && (
                        <Stack sx={{ gap: .35, mt: .75 }}>
                            <Dependencies
                                label="Czeka na"
                                icon={<ArrowBackIcon sx={{ fontSize: 12, opacity: .7 }} />}
                                tasks={waitsFor}
                                onOpen={openTask}
                            />
                            <Dependencies
                                label="Blokuje"
                                icon={<ArrowForwardIcon sx={{ fontSize: 12, opacity: .7 }} />}
                                tasks={blocks}
                                onOpen={openTask}
                            />
                        </Stack>
                    )}
                </Box>

                <Stack
                    direction="row"
                    className="task-card-actions"
                    sx={{ opacity: 0, transition: 'opacity .15s' }}
                >
                    <Tooltip title="Otwórz w PIM/Zadania">
                        <span>
                            <IconButton
                                size="small"
                                disabled={!task || !openTask}
                                onClick={() => openTask?.(attrs.taskId)}
                            >
                                <OpenInNewIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Zmień zadanie">
                        <IconButton size="small" onClick={() => setEditing(true)}>
                            <EditIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Usuń kartę">
                        <IconButton size="small" onClick={() => deleteNode()}>
                            <DeleteIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Paper>

            {editing && (
                <TaskCardDialog
                    open
                    initialTaskId={attrs.taskId}
                    onClose={() => setEditing(false)}
                    onPick={next => updateAttributes(next)}
                />
            )}
        </NodeViewWrapper>
    );
}

/**
 * Jedna strona zależności.
 *
 * Zrobione poprzedniki są przekreślone i wyblakłe — po to, żeby jednym
 * spojrzeniem dało się odpowiedzieć na pytanie, które zadaje się naprawdę:
 * „czy mogę już zacząć?". Sama lista nazw tego nie mówi.
 */
const Dependencies: React.FC<{
    label: string;
    icon: React.ReactNode;
    tasks: RelatedTask[];
    /** Przejście do zadania. Brak — chipy zostają nieklikalne. */
    onOpen?: ((id: string) => void) | undefined;
}> = ({ label, icon, tasks, onOpen }) => {
    if (tasks.length === 0) return null;

    return (
        <Stack direction="row" sx={{ alignItems: 'flex-start', gap: .5, flexWrap: 'wrap' }}>
            {icon}
            <Typography sx={{ fontSize: 11, opacity: .6, flexShrink: 0 }}>
                {label}:
            </Typography>
            <Stack direction="row" sx={{ gap: .5, flexWrap: 'wrap' }}>
                {tasks.map(t => (
                    <Tooltip key={t.id} title={onOpen ? `Otwórz: ${t.name}` : t.name}>
                        <Chip
                            size="small"
                            label={t.name}
                            variant="outlined"
                            // `clickable` daje kursor i podświetlenie — bez tego
                            // chip w środku dokumentu wygląda jak tekst do
                            // zaznaczenia i nikt nie próbuje w niego kliknąć.
                            clickable={Boolean(onOpen)}
                            onClick={onOpen
                                ? (e) => { e.stopPropagation(); onOpen(t.id); }
                                : undefined}
                            sx={{
                                height: 18,
                                fontSize: 10,
                                maxWidth: 220,
                                opacity: t.done ? .5 : 1,
                                '& .MuiChip-label': {
                                    textDecoration: t.done ? 'line-through' : 'none',
                                },
                            }}
                        />
                    </Tooltip>
                ))}
            </Stack>
        </Stack>
    );
};

export const TaskCard = Node.create({
    name: 'taskCard',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
        return {
            taskId: { default: '' },
            taskName: { default: '' },
        };
    },

    parseHTML() {
        return [{
            tag: 'div[data-type="task-card"]',
            getAttrs: (node) => {
                if (typeof node === 'string') return false;
                const el = node as HTMLElement;
                const dec = (name: string) => {
                    const raw = el.getAttribute(name);
                    if (!raw) return '';
                    try { return decodeURIComponent(raw); } catch { return raw; }
                };
                return { taskId: dec('data-task-id'), taskName: dec('data-task-name') };
            },
        }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const a = node.attrs as TaskCardAttrs;
        const enc: Record<string, string> = { 'data-type': 'task-card' };
        if (a.taskId) enc['data-task-id'] = encodeURIComponent(a.taskId);
        if (a.taskName) enc['data-task-name'] = encodeURIComponent(a.taskName);
        return ['div', mergeAttributes(HTMLAttributes, enc)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(TaskCardNodeView);
    },
});
