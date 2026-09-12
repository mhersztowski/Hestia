/**
 * Sample page: a monthly overview of the finances.
 *
 * It shows how the whole stack fits together — the model from `@hestia/core`
 * computes the same thing on both sides, the backend hands over one set of data
 * per screen, and the page merely displays it. Every amount goes through
 * `formatAmount`, so nowhere is there a division by 100 done "on the spot".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AppBar, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Dialog,
    DialogActions, DialogContent, DialogTitle, Divider, IconButton, LinearProgress,
    MenuItem, Stack, TextField, Toolbar, Tooltip, Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ACCOUNT_KIND_NAMES, formatAmount, toMinorUnits, type Category, type Transaction } from '@hestia/core';
import { api, type Summary } from './api';
import { currentMonth, monthName, shiftMonth } from './months';

export function App() {
    const [month, setMonth] = useState(currentMonth);
    const [data, setData] = useState<Summary | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            // In parallel: these are three independent requests and there is
            // no reason for them to wait for one another.
            const [p, t, k] = await Promise.all([
                api.summary(month), api.transactions(month), api.categories(),
            ]);
            setData(p); setTransactions(t); setCategories(k); setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [month]);

    useEffect(() => { void refresh(); }, [refresh]);

    const categoryNames = useMemo(
        () => new Map(categories.map((k) => [k.id, k.name])),
        [categories],
    );

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Toolbar>
                    <Typography variant="h6" sx={{ flex: 1 }}>Hestia — Finances</Typography>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        <IconButton onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
                            <ChevronLeftIcon />
                        </IconButton>
                        <Typography sx={{ minWidth: 160, textAlign: 'center', textTransform: 'capitalize' }}>
                            {monthName(month)}
                        </Typography>
                        <IconButton onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
                            <ChevronRightIcon />
                        </IconButton>
                        <Tooltip title="Refresh">
                            <IconButton onClick={() => { void refresh(); }}><RefreshIcon /></IconButton>
                        </Tooltip>
                    </Stack>
                </Toolbar>
                {loading && <LinearProgress />}
            </AppBar>

            <Container maxWidth="lg" sx={{ py: 3 }}>
                {error && (
                    <Card sx={{ mb: 2, borderLeft: '4px solid', borderColor: 'error.main' }}>
                        <CardContent>
                            <Typography color="error" variant="subtitle2">Could not fetch the data</Typography>
                            <Typography variant="body2" color="text.secondary">{error}</Typography>
                        </CardContent>
                    </Card>
                )}

                {!data && loading && (
                    <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress /></Stack>
                )}

                {data && (
                    <Stack spacing={3}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <Tile title="Income" amount={data.summary.income} color="success.main" />
                            <Tile title="Expenses" amount={data.summary.expenses} color="error.main" />
                            <Tile
                                title="Net"
                                amount={data.summary.net}
                                color={data.summary.net >= 0 ? 'success.main' : 'error.main'}
                                caption={`${data.summary.count} transactions`}
                            />
                        </Stack>

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="flex-start">
                            <Card sx={{ flex: 1, width: '100%' }}>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom>Accounts</Typography>
                                    <Stack divider={<Divider flexItem />} spacing={1}>
                                        {data.accounts.map((k) => (
                                            <Stack key={k.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ pt: 1 }}>
                                                <Box>
                                                    <Typography variant="body2">{k.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{ACCOUNT_KIND_NAMES[k.kind]}</Typography>
                                                </Box>
                                                <Typography variant="body2" fontFamily="monospace">{formatAmount(k.balance)}</Typography>
                                            </Stack>
                                        ))}
                                        {data.accounts.length === 0 && <Empty>No accounts</Empty>}
                                    </Stack>
                                </CardContent>
                            </Card>

                            <Card sx={{ flex: 1, width: '100%' }}>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom>Expenses by category</Typography>
                                    <CategoryBars categories={data.categories} />
                                </CardContent>
                            </Card>
                        </Stack>

                        {data.budgets.length > 0 && (
                            <Card>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom>Budgets</Typography>
                                    <Stack spacing={2}>
                                        {data.budgets.map((b) => (
                                            <Box key={b.categoryId}>
                                                <Stack direction="row" justifyContent="space-between">
                                                    <Typography variant="body2">{b.name}</Typography>
                                                    <Typography variant="body2" fontFamily="monospace"
                                                        color={b.exceeded ? 'error.main' : 'text.secondary'}>
                                                        {formatAmount(b.spent)} / {formatAmount(b.limit)}
                                                    </Typography>
                                                </Stack>
                                                <LinearProgress
                                                    variant="determinate"
                                                    // Above the cap the bar stays full and the overrun shows in
                                                    // the colour and the amount — a bar longer than its track
                                                    // makes no sense.
                                                    value={Math.min(100, b.limit === 0 ? 0 : (b.spent / b.limit) * 100)}
                                                    color={b.exceeded ? 'error' : 'primary'}
                                                    sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                                                />
                                            </Box>
                                        ))}
                                    </Stack>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardContent>
                                <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ flex: 1 }}>Transactions</Typography>
                                    <Button size="small" startIcon={<AddIcon />} onClick={() => setCreating(true)}>Add</Button>
                                </Stack>
                                <Stack divider={<Divider flexItem />}>
                                    {transactions.map((t) => (
                                        <Stack key={t.id} direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
                                            <Typography variant="caption" color="text.secondary" fontFamily="monospace" sx={{ width: 88 }}>
                                                {t.date}
                                            </Typography>
                                            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                                                {t.description || <em>no description</em>}
                                            </Typography>
                                            {t.categoryId && (
                                                <Chip size="small" label={categoryNames.get(t.categoryId) ?? t.categoryId} />
                                            )}
                                            <Typography variant="body2" fontFamily="monospace"
                                                color={t.amount < 0 ? 'error.main' : 'success.main'} sx={{ width: 120, textAlign: 'right' }}>
                                                {formatAmount(t.amount)}
                                            </Typography>
                                            <IconButton size="small" aria-label="Delete"
                                                onClick={async () => { await api.deleteTransaction(t.id); await refresh(); }}>
                                                <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </Stack>
                                    ))}
                                    {transactions.length === 0 && <Empty>No transactions this month</Empty>}
                                </Stack>
                            </CardContent>
                        </Card>
                    </Stack>
                )}
            </Container>

            <NewTransactionDialog
                open={creating}
                month={month}
                accounts={data?.accounts ?? []}
                categories={categories}
                onClose={() => setCreating(false)}
                onSaved={async () => { setCreating(false); await refresh(); }}
            />
        </Box>
    );
}

function Tile({ title, amount, color, caption }: { title: string; amount: number; color: string; caption?: string }) {
    return (
        <Card sx={{ flex: 1 }}>
            <CardContent>
                <Typography variant="overline" color="text.secondary">{title}</Typography>
                <Typography variant="h5" color={color} fontFamily="monospace">{formatAmount(amount)}</Typography>
                {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
            </CardContent>
        </Card>
    );
}

/**
 * Bars without a charting library.
 *
 * Five categories scaled as a percentage of the largest — a charting library
 * would weigh more here than the whole rest of the application.
 */
function CategoryBars({ categories }: { categories: Array<{ categoryId: string; name: string; total: number; color?: string }> }) {
    if (categories.length === 0) return <Empty>No expenses this month</Empty>;
    const largest = Math.max(...categories.map((k) => k.total));
    return (
        <Stack spacing={1.25}>
            {categories.map((k) => (
                <Box key={k.categoryId}>
                    <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2">{k.name}</Typography>
                        <Typography variant="body2" fontFamily="monospace">{formatAmount(k.total)}</Typography>
                    </Stack>
                    <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', mt: 0.5 }}>
                        <Box sx={{
                            height: '100%', borderRadius: 3,
                            width: `${(k.total / largest) * 100}%`,
                            bgcolor: k.color ?? 'primary.main',
                        }} />
                    </Box>
                </Box>
            ))}
        </Stack>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{children}</Typography>;
}

function NewTransactionDialog({ open, month, accounts, categories, onClose, onSaved }: {
    open: boolean;
    month: string;
    accounts: Array<{ id: string; name: string }>;
    categories: Category[];
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [date, setDate] = useState(`${month}-01`);
    const [amount, setKwota] = useState('');
    const [description, setOpis] = useState('');
    const [accountId, setKontoId] = useState('');
    const [categoryId, setKategoriaId] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) { setDate(`${month}-01`); setError(null); setKontoId(accounts[0]?.id ?? ''); }
    }, [open, month, accounts]);

    const save = async () => {
        try {
            // The amount arrives as text and goes to `toMinorUnits` as text —
            // going through `Number` would lose a unit on input like "1,005".
            await api.addTransaction({
                date, amount: toMinorUnits(amount), description, accountId,
                categoryId: categoryId || undefined,
            });
            setKwota(''); setOpis('');
            await onSaved();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>New transaction</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }} />
                    <TextField label="Amount" value={amount} onChange={(e) => setKwota(e.target.value)}
                        helperText="Negative means an expense, e.g. -312.45" />
                    <TextField label="Description" value={description} onChange={(e) => setOpis(e.target.value)} />
                    <TextField select label="Account" value={accountId} onChange={(e) => setKontoId(e.target.value)}>
                        {accounts.map((k) => <MenuItem key={k.id} value={k.id}>{k.name}</MenuItem>)}
                    </TextField>
                    <TextField select label="Category" value={categoryId} onChange={(e) => setKategoriaId(e.target.value)}>
                        <MenuItem value="">— no category —</MenuItem>
                        {categories.map((k) => <MenuItem key={k.id} value={k.id}>{k.name}</MenuItem>)}
                    </TextField>
                    {error && <Typography color="error" variant="body2">{error}</Typography>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!amount.trim() || !accountId} onClick={() => { void save(); }}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
