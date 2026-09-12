/**
 * Wybór zadania do wstawienia jako karta.
 *
 * Lista bywa długa, więc szukanie jest tu pierwszą rzeczą, a nie ozdobą:
 * pole filtruje po nazwie zadania i po nazwie projektu, bo ludzie pamiętają
 * albo jedno, albo drugie. Grupowanie po projekcie zostaje, żeby dało się też
 * przewinąć wzrokiem, gdy nazwy się nie pamięta wcale.
 */

import { useMemo, useState } from 'react';
import {
    Box, Dialog, DialogActions, DialogContent, DialogTitle, Button, List, ListItemButton,
    ListItemText, Stack, TextField, Typography,
} from '@mui/material';

import { useTaskOptions, type TaskOption } from './useTaskOptions';

export interface TaskCardDialogProps {
    open: boolean;
    /** Zadanie już wybrane — przy edycji istniejącej karty. */
    initialTaskId?: string;
    onClose: () => void;
    onPick: (task: { taskId: string; taskName: string }) => void;
}

export default function TaskCardDialog({
    open, initialTaskId, onClose, onPick,
}: TaskCardDialogProps) {
    const { tasks, projectName } = useTaskOptions(open);
    const [query, setQuery] = useState('');
    const [chosen, setChosen] = useState<string>(initialTaskId ?? '');

    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const matching = needle
            ? tasks.filter(t =>
                t.name.toLowerCase().includes(needle) ||
                (projectName(t.projectId) ?? '').toLowerCase().includes(needle))
            : tasks;

        const byProject = new Map<string, TaskOption[]>();
        for (const task of matching) {
            const label = projectName(task.projectId) ?? 'Bez projektu';
            const list = byProject.get(label);
            if (list) list.push(task);
            else byProject.set(label, [task]);
        }
        return [...byProject.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pl'));
    }, [tasks, query, projectName]);

    const pick = (task: TaskOption) => {
        onPick({ taskId: task.id, taskName: task.name });
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
                PaperProps={{ sx: { height: '70vh' } }}>
            <DialogTitle sx={{ fontSize: 16 }}>Wstaw kartę zadania</DialogTitle>

            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <TextField
                    size="small"
                    autoFocus
                    placeholder="Szukaj po nazwie zadania albo projektu…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />

                <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    {groups.length === 0 ? (
                        <Typography sx={{ fontSize: 13, opacity: 0.7, p: 2 }}>
                            {tasks.length === 0
                                ? 'Nie ma jeszcze żadnych zadań.'
                                : 'Nic nie pasuje do wyszukiwania.'}
                        </Typography>
                    ) : groups.map(([project, items]) => (
                        <Box key={project}>
                            <Typography sx={{
                                fontSize: 11, textTransform: 'uppercase', letterSpacing: .5,
                                opacity: .6, px: 1, pt: 1.5, pb: 0.5,
                            }}>
                                {project}
                            </Typography>
                            <List dense disablePadding>
                                {items.map(task => (
                                    <ListItemButton
                                        key={task.id}
                                        selected={chosen === task.id}
                                        onClick={() => setChosen(task.id)}
                                        onDoubleClick={() => pick(task)}
                                        sx={{ borderRadius: 1 }}
                                    >
                                        <ListItemText
                                            primary={task.name}
                                            secondary={task.description || undefined}
                                            primaryTypographyProps={{ fontSize: 13 }}
                                            secondaryTypographyProps={{
                                                fontSize: 11, noWrap: true,
                                            }}
                                        />
                                    </ListItemButton>
                                ))}
                            </List>
                        </Box>
                    ))}
                </Box>
            </DialogContent>

            <DialogActions>
                <Stack direction="row" sx={{ flex: 1, px: 1 }}>
                    <Typography sx={{ fontSize: 11, opacity: .6 }}>
                        Dwuklik wstawia od razu.
                    </Typography>
                </Stack>
                <Button size="small" onClick={onClose}>Anuluj</Button>
                <Button
                    size="small"
                    variant="contained"
                    disabled={!chosen}
                    onClick={() => {
                        const task = tasks.find(t => t.id === chosen);
                        if (task) pick(task);
                    }}
                >
                    Wstaw
                </Button>
            </DialogActions>
        </Dialog>
    );
}
