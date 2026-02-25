import { useState, useMemo, useCallback } from 'react';
import { useInventory } from '../hooks/useInventoryData';
import { useNavigate } from 'react-router-dom';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import ClipboardPaste from 'lucide-react/dist/esm/icons/clipboard-paste';
import Search from 'lucide-react/dist/esm/icons/search';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { type InventoryItem } from '../schemas/inventory.schema';

// ─── Types ────────────────────────────────────────────────────────────────────
interface InputItem {
    sku: string;
    quantity?: number;
    [key: string]: any;
}

interface CountRow {
    sku: string;
    inputQty: number | null;
    foundItems: InventoryItem[];
    found: boolean;
    suggestions: InventoryItem[];
}

// ─── Similarity helper ────────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
}

function getSimilarSkus(targetSku: string, allItems: InventoryItem[], maxResults = 5): InventoryItem[] {
    const target = targetSku.toUpperCase();
    const seen = new Set<string>();
    return allItems
        .filter(i => {
            if (seen.has(i.sku)) return false;
            seen.add(i.sku);
            return true;
        })
        .map(i => ({ item: i, dist: levenshtein(target, i.sku.toUpperCase()) }))
        .filter(({ dist }) => dist <= Math.max(4, Math.floor(target.length * 0.4)))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, maxResults)
        .map(({ item }) => item);
}

// ─── Parse the pasted JSON input ─────────────────────────────────────────────
function parseInput(raw: string): InputItem[] | null {
    try {
        const parsed = JSON.parse(raw.trim());
        // Accept array of objects, array of strings, or object with items key
        if (Array.isArray(parsed)) {
            return parsed.map((entry: any) => {
                if (typeof entry === 'string') return { sku: entry.trim().toUpperCase() };
                const sku = (entry.sku || entry.SKU || entry.Sku || entry.item || '').toString().trim().toUpperCase();
                const quantity = entry.quantity ?? entry.qty ?? entry.Quantity ?? null;
                return { sku, quantity: quantity !== null ? Number(quantity) : null, ...entry };
            }).filter(e => e.sku);
        }
        return null;
    } catch {
        return null;
    }
}

// ─── Count Row Component ──────────────────────────────────────────────────────
const CountRowItem = ({
    row,
    index,
    updateQuantity,
}: {
    row: CountRow;
    index: number;
    updateQuantity: (sku: string, delta: number, warehouse?: string | null, location?: string | null) => Promise<void>;
}) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [localQty, setLocalQty] = useState<Record<string, number>>({});

    const handleQtyInput = (item: InventoryItem, newQty: number) => {
        const delta = newQty - (localQty[String(item.id)] ?? item.quantity);
        if (delta === 0) return;
        setLocalQty(prev => ({ ...prev, [String(item.id)]: newQty }));
        updateQuantity(item.sku, delta, item.warehouse, item.location);
    };

    return (
        <div
            className={`rounded-2xl border transition-all ${row.found
                ? 'bg-card border-subtle'
                : 'bg-red-500/5 border-red-500/30'
                }`}
        >
            {/* Main Row */}
            <div className="flex items-center gap-3 p-4">
                {/* Index */}
                <span className="text-[10px] font-black text-muted w-6 text-center shrink-0">{index + 1}</span>

                {/* Status Icon */}
                <div className="shrink-0">
                    {row.found ? (
                        <CheckCircle2 size={18} className="text-green-500" />
                    ) : (
                        <XCircle size={18} className="text-red-500" />
                    )}
                </div>

                {/* SKU */}
                <div className="flex-1 min-w-0">
                    <button
                        onClick={() => !row.found && setShowSuggestions(s => !s)}
                        className={`text-left w-full ${!row.found ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                        <p className={`font-black text-lg tracking-tighter uppercase truncate ${!row.found ? 'text-red-400' : 'text-content'}`}>
                            {row.sku}
                        </p>
                        {row.found ? (
                            <p className="text-[9px] text-muted font-bold uppercase tracking-widest">
                                {row.foundItems.length} location{row.foundItems.length !== 1 ? 's' : ''}
                            </p>
                        ) : (
                            <p className="text-[9px] text-red-500/70 font-bold uppercase tracking-widest flex items-center gap-1">
                                <AlertCircle size={9} /> Not found — tap for suggestions
                            </p>
                        )}
                    </button>
                </div>

                {/* Input Qty */}
                {row.inputQty !== null && (
                    <span className="text-xs font-black text-muted bg-surface border border-subtle px-2 py-1 rounded-lg shrink-0">
                        {row.inputQty} req
                    </span>
                )}
            </div>

            {/* Locations */}
            {row.found && row.foundItems.map(item => (
                <div
                    key={`${item.id}`}
                    className="flex items-center gap-3 px-4 pb-3 border-t border-subtle/50 pt-3 mx-2 mb-2 last:mb-0 bg-surface/30 rounded-xl"
                >
                    {/* Location info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-accent">{item.location || '—'}</p>
                        <p className="text-[9px] text-muted font-bold uppercase">{item.warehouse}</p>
                    </div>

                    {/* Qty editor */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleQtyInput(item, Math.max(0, (localQty[String(item.id)] ?? item.quantity) - 1))}
                            className="w-8 h-8 rounded-lg bg-main border border-subtle flex items-center justify-center text-muted hover:text-red-500 hover:border-red-500/30 active:scale-90 transition-all font-bold text-lg"
                        >−</button>
                        <input
                            type="number"
                            value={localQty[String(item.id)] ?? item.quantity}
                            onChange={e => handleQtyInput(item, parseInt(e.target.value) || 0)}
                            className="w-14 h-8 text-center font-black text-content bg-main border border-subtle rounded-lg text-sm focus:border-accent focus:outline-none"
                        />
                        <button
                            onClick={() => handleQtyInput(item, (localQty[String(item.id)] ?? item.quantity) + 1)}
                            className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent hover:bg-accent hover:text-white active:scale-90 transition-all font-bold text-lg"
                        >+</button>
                    </div>
                </div>
            ))}

            {/* Suggestions for not-found SKUs */}
            {!row.found && showSuggestions && (
                <div className="px-4 pb-4">
                    {row.suggestions.length > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-2">
                                Similar SKUs found:
                            </p>
                            {row.suggestions.map(s => (
                                <div key={s.id} className="flex items-center gap-3 p-2.5 bg-surface/50 border border-subtle rounded-xl">
                                    <div className="flex-1">
                                        <p className="font-black text-sm text-content uppercase tracking-tight">{s.sku}</p>
                                        <p className="text-[9px] text-muted font-bold uppercase">{s.location} · {s.warehouse}</p>
                                    </div>
                                    <span className="font-black text-accent text-sm">{s.quantity}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[10px] text-muted font-bold uppercase text-center py-2">
                            No similar SKUs found in inventory
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export const StockCountScreen = () => {
    const navigate = useNavigate();
    const { inventoryData, updateQuantity } = useInventory();
    const { profile } = useAuth();

    const [rawInput, setRawInput] = useState('');
    const [parsed, setParsed] = useState<InputItem[] | null>(null);
    const [parseError, setParseError] = useState('');
    const [searchFilter, setSearchFilter] = useState('');
    const [showOnlyMissing, setShowOnlyMissing] = useState(false);

    // Build count rows from parsed input vs inventory
    const countRows = useMemo<CountRow[]>(() => {
        if (!parsed) return [];
        return parsed.map(entry => {
            const foundItems = inventoryData.filter(
                item => item.sku.toUpperCase() === entry.sku.toUpperCase() && item.is_active !== false
            );
            const found = foundItems.length > 0;
            const suggestions = found ? [] : getSimilarSkus(entry.sku, inventoryData);
            return {
                sku: entry.sku,
                inputQty: entry.quantity ?? null,
                foundItems,
                found,
                suggestions,
            };
        });
    }, [parsed, inventoryData]);

    const filteredRows = useMemo(() => {
        let rows = countRows;
        if (showOnlyMissing) rows = rows.filter(r => !r.found);
        if (searchFilter) {
            const q = searchFilter.toLowerCase();
            rows = rows.filter(r => r.sku.toLowerCase().includes(q));
        }
        return rows;
    }, [countRows, showOnlyMissing, searchFilter]);

    const stats = useMemo(() => ({
        total: countRows.length,
        found: countRows.filter(r => r.found).length,
        missing: countRows.filter(r => !r.found).length,
    }), [countRows]);

    const handleParse = useCallback(() => {
        if (!rawInput.trim()) {
            setParseError('Please paste a JSON list first.');
            return;
        }
        const result = parseInput(rawInput);
        if (!result || result.length === 0) {
            setParseError('Invalid JSON. Expected an array of objects with a "sku" field, or an array of strings.');
            return;
        }
        setParsed(result);
        setParseError('');
        toast.success(`Loaded ${result.length} SKUs for comparison`);
    }, [rawInput]);

    const handleReset = () => {
        setParsed(null);
        setRawInput('');
        setParseError('');
        setSearchFilter('');
        setShowOnlyMissing(false);
    };

    return (
        <div className="min-h-screen bg-main text-content">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-main/95 backdrop-blur-md border-b border-subtle px-4 py-4 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 bg-surface border border-subtle rounded-xl text-muted hover:text-content active:scale-90 transition-all"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-black uppercase tracking-tighter leading-none">Stock Count</h1>
                    <p className="text-[10px] text-muted font-black uppercase tracking-widest">Physical Inventory Check</p>
                </div>
                {parsed && (
                    <button
                        onClick={handleReset}
                        className="text-[10px] font-black uppercase tracking-widest text-red-500 border border-red-500/20 bg-red-500/5 px-3 py-2 rounded-xl active:scale-90 transition-all"
                    >
                        Reset
                    </button>
                )}
            </header>

            <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-32">

                {/* Input Panel */}
                {!parsed ? (
                    <div className="space-y-4">
                        <div className="bg-card border border-subtle rounded-3xl p-6 space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-accent/10 rounded-xl">
                                    <ClipboardPaste size={20} className="text-accent" />
                                </div>
                                <div>
                                    <h2 className="font-black uppercase tracking-tight text-content">Paste JSON List</h2>
                                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">
                                        Array of objects with "sku" field
                                    </p>
                                </div>
                            </div>

                            <textarea
                                value={rawInput}
                                onChange={e => { setRawInput(e.target.value); setParseError(''); }}
                                placeholder={`[\n  { "sku": "ABC-123", "quantity": 10 },\n  { "sku": "DEF-456" },\n  ...\n]\n\nAlso accepts: ["SKU1", "SKU2", ...]`}
                                rows={12}
                                className="w-full px-4 py-3 bg-main border border-subtle rounded-xl text-content placeholder-muted/40 font-mono text-sm focus:border-accent focus:outline-none resize-none"
                            />

                            {parseError && (
                                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
                                    <AlertCircle size={14} />
                                    {parseError}
                                </div>
                            )}

                            <button
                                onClick={handleParse}
                                className="w-full h-14 bg-accent hover:opacity-90 active:scale-[0.98] text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
                            >
                                <Search size={18} />
                                Compare Against Inventory
                            </button>
                        </div>

                        {/* Format hint */}
                        <div className="p-4 bg-surface border border-subtle rounded-2xl text-[10px] text-muted font-bold uppercase tracking-widest space-y-1">
                            <p className="text-content font-black">Accepted formats:</p>
                            <p>• <span className="text-accent font-mono">{"[{sku, quantity}, ...]"}</span> — Objects with sku field</p>
                            <p>• <span className="text-accent font-mono">{"[\"SKU1\", \"SKU2\"]"}</span> — Array of strings</p>
                            <p className="text-muted/60 text-[9px] pt-1">Order is preserved exactly as provided</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Stats Bar */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-card border border-subtle rounded-2xl p-4 text-center">
                                <p className="text-2xl font-black text-content">{stats.total}</p>
                                <p className="text-[9px] text-muted font-black uppercase tracking-widest mt-1">Total SKUs</p>
                            </div>
                            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
                                <p className="text-2xl font-black text-green-500">{stats.found}</p>
                                <p className="text-[9px] text-green-500/70 font-black uppercase tracking-widest mt-1">Found</p>
                            </div>
                            <div
                                className={`rounded-2xl p-4 text-center border cursor-pointer transition-all ${showOnlyMissing
                                    ? 'bg-red-500/20 border-red-500/40'
                                    : 'bg-red-500/10 border-red-500/20'
                                    }`}
                                onClick={() => setShowOnlyMissing(s => !s)}
                            >
                                <p className="text-2xl font-black text-red-500">{stats.missing}</p>
                                <p className="text-[9px] text-red-500/70 font-black uppercase tracking-widest mt-1">
                                    {showOnlyMissing ? 'Show All' : 'Missing'}
                                </p>
                            </div>
                        </div>

                        {/* Search within results */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                            <input
                                type="text"
                                value={searchFilter}
                                onChange={e => setSearchFilter(e.target.value)}
                                placeholder="Filter by SKU..."
                                className="w-full pl-9 pr-4 py-3 bg-card border border-subtle rounded-xl text-content placeholder-muted text-sm focus:border-accent focus:outline-none"
                            />
                        </div>

                        {/* Results */}
                        <div className="space-y-2">
                            {filteredRows.map((row, i) => (
                                <CountRowItem
                                    key={`${row.sku}-${i}`}
                                    row={row}
                                    index={countRows.indexOf(row)}
                                    updateQuantity={updateQuantity}
                                />
                            ))}

                            {filteredRows.length === 0 && (
                                <div className="text-center py-16 text-muted">
                                    <Search className="mx-auto mb-3 opacity-20" size={40} />
                                    <p className="text-xs font-black uppercase tracking-widest">No results</p>
                                </div>
                            )}
                        </div>

                        {/* Summary footer */}
                        <div className="p-4 bg-card border border-subtle rounded-2xl text-[10px] text-muted font-bold uppercase tracking-widest">
                            <p>Count generated by <span className="text-content">{profile?.full_name || 'Unknown'}</span></p>
                            <p className="text-[9px] opacity-60 mt-0.5">{new Date().toLocaleString()}</p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default StockCountScreen;
