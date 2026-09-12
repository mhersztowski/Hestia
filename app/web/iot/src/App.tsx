/**
 * The IoT application's page.
 *
 * It shows the split between two applications: **accounts and files** come from
 * the platform (`app/backend`), while **devices** come from the IoT server
 * (`app/iot`). That is visible in the interface on purpose — so that at the
 * first outage it is clear which part answers for what, instead of everything
 * landing in one bucket labelled "the backend is down".
 */

import { useCallback, useEffect, useState } from 'react';
import {
    Alert, AppBar, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
    Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, LinearProgress,
    Stack, TextField, Toolbar, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import LogoutIcon from '@mui/icons-material/Logout';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import { api, platform, token, saveToken, type DeviceView, type User } from './platform';
import { howLongAgo } from './time';

export function App() {
    const [user, setUser] = useState<User | null>(null);
    const [checking, setChecking] = useState(true);

    // A token from a previous session is sometimes invalid — we ask the
    // platform rather than trusting its presence; otherwise the page enters the
    // list and only falls over there.
    useEffect(() => {
        (async () => {
            if (!token()) { setChecking(false); return; }
            try {
                setUser(await platform.me());
            } catch {
                saveToken(null);
            } finally {
                setChecking(false);
            }
        })();
    }, []);

    if (checking) {
        return <Stack alignItems="center" sx={{ py: 10 }}><CircularProgress /></Stack>;
    }
    if (!user) return <SignIn onSignedIn={setUser} />;
    return <Dashboard user={user} onSignedOut={() => { saveToken(null); setUser(null); }} />;
}

function SignIn({ onSignedIn }: { onSignedIn: (u: User) => void }) {
    const [userName, setUserName] = useState('admin');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [waiting, setWaiting] = useState(false);

    const signIn = async () => {
        setWaiting(true);
        try {
            const { token: t, user } = await platform.signIn(userName, password);
            saveToken(t);
            onSignedIn(user);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setWaiting(false);
        }
    };

    return (
        <Container maxWidth="xs" sx={{ py: 10 }}>
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>Hestia — IoT</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        The account is shared by every Hestia application — the platform checks it.
                    </Typography>
                    <Stack spacing={2}>
                        <TextField label="User" value={userName} onChange={(e) => setUserName(e.target.value)} autoFocus />
                        <TextField label="Password" type="password" value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }} />
                        {error && <Alert severity="error">{error}</Alert>}
                        <Button variant="contained" disabled={waiting || !password} onClick={() => { void signIn(); }}>
                            Sign in
                        </Button>
                    </Stack>
                </CardContent>
            </Card>
        </Container>
    );
}

function Dashboard({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
    const [devices, setDevices] = useState<DeviceView[]>([]);
    const [platformAvailable, setPlatformAvailable] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [health, list] = await Promise.all([api.health(), api.devices()]);
            setPlatformAvailable(health.platform.available);
            setDevices(list.devices);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    // Presence is computed from the time of the last signal, so the list ages
    // by itself — without refreshing, a device would stay "online" for hours.
    useEffect(() => {
        const id = setInterval(() => { void refresh(); }, 30_000);
        return () => clearInterval(id);
    }, [refresh]);

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Toolbar>
                    <ThermostatIcon sx={{ mr: 1 }} />
                    <Typography variant="h6" sx={{ flex: 1 }}>Hestia — IoT</Typography>
                    <Chip size="small" sx={{ mr: 1 }} label={user.userName} />
                    <Tooltip title="Refresh"><IconButton onClick={() => { void refresh(); }}><RefreshIcon /></IconButton></Tooltip>
                    <Tooltip title="Sign out"><IconButton onClick={onSignedOut}><LogoutIcon /></IconButton></Tooltip>
                </Toolbar>
                {loading && <LinearProgress />}
            </AppBar>

            <Container maxWidth="md" sx={{ py: 3 }}>
                <Stack spacing={2}>
                    {platformAvailable === false && (
                        <Alert severity="warning">
                            The platform (<code>app/backend</code>) is not responding — without it there are
                            no files and no MQTT. Start it with <code>pnpm dev:platform</code>.
                        </Alert>
                    )}
                    {error && <Alert severity="error">{error}</Alert>}

                    <Card>
                        <CardContent>
                            <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="subtitle1" sx={{ flex: 1 }}>Devices</Typography>
                                <Button size="small" startIcon={<AddIcon />} onClick={() => setCreating(true)}>Add</Button>
                            </Stack>

                            <Stack divider={<Divider flexItem />}>
                                {devices.map((d) => (
                                    <Stack key={d.deviceName} direction="row" alignItems="center" spacing={1.5} sx={{ py: 1.25 }}>
                                        <Box sx={{
                                            width: 10, height: 10, borderRadius: '50%',
                                            bgcolor: d.online ? 'success.main' : 'text.disabled',
                                        }} />
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography variant="body2" noWrap>{d.label || d.deviceName}</Typography>
                                            <Typography variant="caption" color="text.secondary" fontFamily="monospace" noWrap>
                                                {d.deviceName} · {howLongAgo(d.lastSeen)}
                                            </Typography>
                                        </Box>
                                        <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="flex-end">
                                            {Object.entries(d.metrics).map(([name, value]) => (
                                                <Chip key={name} size="small" variant="outlined"
                                                    label={`${name}: ${value}`} sx={{ fontFamily: 'monospace' }} />
                                            ))}
                                        </Stack>
                                        <IconButton size="small" aria-label="Delete"
                                            onClick={async () => { setDevices((await api.remove(d.deviceName)).devices); }}>
                                            <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                ))}
                                {devices.length === 0 && (
                                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                        No devices. Add the first one, or send a reading to
                                        <code> POST /api/devices/&#123;name&#125;/reading</code> — an unknown device
                                        adds itself.
                                    </Typography>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>

                    <Card variant="outlined">
                        <CardContent>
                            <Typography variant="subtitle2" gutterBottom>Where things come from</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Accounts and files (the device registry) — <code>app/backend</code>; devices and
                                readings — <code>app/iot</code>. This application has no users and no store of its own.
                            </Typography>
                        </CardContent>
                    </Card>
                </Stack>
            </Container>

            <NewDeviceDialog open={creating} onClose={() => setCreating(false)}
                onAdded={(list) => { setDevices(list); setCreating(false); }} />
        </Box>
    );
}

function NewDeviceDialog({ open, onClose, onAdded }: {
    open: boolean;
    onClose: () => void;
    onAdded: (list: DeviceView[]) => void;
}) {
    const [deviceName, setDeviceName] = useState('');
    const [label, setLabel] = useState('');
    const [error, setError] = useState<string | null>(null);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>New device</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField label="Name (the key in MQTT)" value={deviceName} autoFocus
                        onChange={(e) => setDeviceName(e.target.value)} helperText="e.g. sensor-living-room" />
                    <TextField label="Description" value={label} onChange={(e) => setLabel(e.target.value)} />
                    {error && <Alert severity="error">{error}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!deviceName.trim()} onClick={async () => {
                    try {
                        onAdded((await api.add(deviceName.trim(), label.trim())).devices);
                        setDeviceName(''); setLabel('');
                    } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                    }
                }}>Add</Button>
            </DialogActions>
        </Dialog>
    );
}
