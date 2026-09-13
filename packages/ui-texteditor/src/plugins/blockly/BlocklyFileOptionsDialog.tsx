/**
 * BlocklyFileOptionsDialog — okno „Opcje pliku".
 *
 * Odpowiada na dwa pytania dotyczące **tego** pliku: z których diagramów UML
 * wziąć bloczki i — gdy rozszerzenie nie mówi prawdy — jakim jest językiem.
 *
 * Brak podłączonego źródła UML jest tu stanem normalnym i **nazwanym**. Puste
 * okno bez wyjaśnienia wygląda jak nieudane wczytywanie, a bywa po prostu
 * aplikacją, która nie ma strony Programming/UML.
 */

import React, { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { allDialects, dialectForPath } from './dialects';
import {
    readFileOptions, writeFileOptions, type OptionsStorage,
} from './fileOptions';
import { describeSource, type UmlProjectRef, type UmlProjectSource } from './umlProjectSource';

const dialogTheme = createTheme({
    palette: {
        mode: 'dark',
        background: { paper: '#1e1e1e', default: '#1e1e1e' },
        text: { primary: '#cccccc', secondary: '#9d9d9d' },
        divider: '#3c3c3c',
    },
});

export interface FileOptionsDialogProps {
    file: string;
    storage: OptionsStorage;
    umlSource?: UmlProjectSource;
    onClose(): void;
}

export const BlocklyFileOptionsDialog: React.FC<FileOptionsDialogProps> = (props) => {
    const initial = readFileOptions(props.storage, props.file);
    const [projects, setProjects] = useState<string[]>(initial.projects);
    const [dialectId, setDialectId] = useState<string>(initial.dialectId ?? '');
    const [available, setAvailable] = useState<UmlProjectRef[] | null>(null);
    const [listError, setListError] = useState<string | null>(null);

    useEffect(() => {
        if (!props.umlSource) { setAvailable([]); return; }
        let cancelled = false;
        props.umlSource.list()
            .then((list) => { if (!cancelled) setAvailable(list); })
            .catch((e: unknown) => {
                if (cancelled) return;
                // Błąd listowania musi być widoczny: pusta lista projektów bez
                // powodu jest nieodróżnialna od „nie ma żadnych projektów".
                setAvailable([]);
                setListError((e as Error).message);
            });
        return () => { cancelled = true; };
    }, [props.umlSource]);

    const detected = dialectForPath(props.file);

    const save = (): void => {
        writeFileOptions(props.storage, props.file, {
            projects,
            ...(dialectId ? { dialectId } : {}),
        });
        props.onClose();
    };

    const toggle = (id: string): void => {
        setProjects((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    };

    return (
        <ThemeProvider theme={dialogTheme}>
            <Dialog open onClose={props.onClose} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ pb: 0.5 }}>
                    Opcje pliku
                    <Typography variant="caption" component="div" color="text.secondary">
                        {props.file}
                    </Typography>
                </DialogTitle>

                <DialogContent dividers>
                    <Stack spacing={2}>
                        <TextField
                            select size="small" label="Język bloczków"
                            value={dialectId}
                            onChange={(e) => setDialectId(e.target.value)}
                            helperText={detected
                                ? `Z rozszerzenia pliku: ${detected.label}. Wskazanie tutaj ma pierwszeństwo.`
                                : 'Rozszerzenie tego pliku nic nie mówi o języku — wskaż go ręcznie.'}
                        >
                            <MenuItem value="">
                                {detected ? `Automatycznie (${detected.label})` : 'Automatycznie — nie rozpoznano'}
                            </MenuItem>
                            {allDialects().map((d) => (
                                <MenuItem key={d.id} value={d.id}>{d.label}</MenuItem>
                            ))}
                        </TextField>

                        <div>
                            <Typography variant="subtitle2">Diagramy UML</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {describeSource(props.umlSource)}
                            </Typography>
                        </div>

                        {listError && <Alert severity="error">{listError}</Alert>}

                        {available === null && (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CircularProgress size={16} />
                                <Typography variant="caption">Wczytuję listę projektów…</Typography>
                            </Stack>
                        )}

                        {available?.length === 0 && !listError && props.umlSource && (
                            <Alert severity="info">
                                Nie znaleziono żadnego projektu UML. Utwórz go na stronie Programming/UML —
                                pliki `*.umlproj.json` w katalogu `drive/uml`.
                            </Alert>
                        )}

                        {available?.map((project) => (
                            <FormControlLabel
                                key={project.id}
                                control={<Checkbox
                                    size="small"
                                    checked={projects.includes(project.id)}
                                    onChange={() => toggle(project.id)}
                                />}
                                label={project.label}
                            />
                        ))}

                        {/*
                          Projekt zapisany w ustawieniach, którego nie ma na liście, zostaje
                          pokazany osobno. Ciche pominięcie znaczyłoby, że zapis się gubi:
                          użytkownik otwiera opcje, zatwierdza i traci wybór zrobiony wtedy,
                          gdy źródło było dostępne.
                        */}
                        {projects.filter((p) => available && !available.some((a) => a.id === p)).map((p) => (
                            <FormControlLabel
                                key={p}
                                control={<Checkbox size="small" checked onChange={() => toggle(p)} />}
                                label={`${p} (niedostępny w bieżącym źródle)`}
                            />
                        ))}
                    </Stack>
                </DialogContent>

                <DialogActions>
                    <Button onClick={props.onClose}>Anuluj</Button>
                    <Button variant="contained" onClick={save}>Zapisz</Button>
                </DialogActions>
            </Dialog>
        </ThemeProvider>
    );
};

export default BlocklyFileOptionsDialog;
