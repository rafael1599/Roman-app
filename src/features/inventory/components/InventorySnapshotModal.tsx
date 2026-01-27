import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Calendar, Copy, Check, Info, FileText, Map as MapIcon, Package, Layers } from 'lucide-react';
import { useInventorySnapshot, type SnapshotItem } from '../../../hooks/useInventorySnapshot';
import { useInventory } from '../../../hooks/useInventoryData';
import { toast } from 'react-hot-toast';

interface InventorySnapshotModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const InventorySnapshotModal = ({ isOpen, onClose }: InventorySnapshotModalProps) => {
    const { loading, data, fetchSnapshot } = useInventorySnapshot();
    const { inventoryData } = useInventory();
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const date = new Date(selectedDate);
            fetchSnapshot(date);
        }
    }, [isOpen, selectedDate]);

    // Create a map of current inventory for "T" logic comparison
    const currentStockMap = useMemo(() => {
        const map = new Map<string, number>();
        inventoryData.forEach(item => {
            const key = `${item.warehouse}-${item.location}-${item.sku}`;
            map.set(key, (map.get(key) || 0) + (item.quantity || 0));
        });
        return map;
    }, [inventoryData]);

    const filteredData = useMemo(() => {
        if (!searchQuery) return data;
        const query = searchQuery.toLowerCase();
        return data.filter(item =>
            item.sku.toLowerCase().includes(query) ||
            item.location.toLowerCase().includes(query) ||
            item.warehouse.toLowerCase().includes(query)
        );
    }, [data, searchQuery]);

    // Grouping logic: Warehouse -> Location -> Items
    const groupedData = useMemo(() => {
        const groups: Record<string, Record<string, SnapshotItem[]>> = {};

        filteredData.forEach(item => {
            const wh = item.warehouse || 'UNKNOWN';
            const loc = item.location || 'GENERAL';

            if (!groups[wh]) groups[wh] = {};
            if (!groups[wh][loc]) groups[wh][loc] = [];

            groups[wh][loc].push(item);
        });

        return groups;
    }, [filteredData]);

    const markdownContent = useMemo(() => {
        if (!data.length) return '';
        let md = `# Inventory Snapshot - ${selectedDate}\n\n`;

        Object.entries(groupedData).forEach(([wh, locations]) => {
            md += `## Warehouse: ${wh}\n\n`;
            Object.entries(locations).forEach(([loc, items]) => {
                md += `### Location: ${loc}\n`;
                items.forEach(item => {
                    const currentQty = currentStockMap.get(`${item.warehouse}-${item.location}-${item.sku}`) ?? 0;
                    const isDifferent = item.quantity !== currentQty;
                    const prefix = isDifferent ? 'T, ' : '';
                    md += `- ${prefix}SKU: ${item.sku} | Qty: ${item.quantity ?? 0}\n`;
                });
                md += '\n';
            });
        });
        return md;
    }, [groupedData, selectedDate, data, currentStockMap]);

    const handleCopy = () => {
        navigator.clipboard.writeText(markdownContent);
        setCopied(true);
        toast.success('Inventory Map copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

            <div className="relative w-full max-w-4xl bg-card border border-subtle rounded-[2.5rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300 flex flex-col h-[800px] max-h-[95vh]">
                {/* Header */}
                <div className="p-8 pb-4 flex justify-between items-start bg-surface/30">
                    <div>
                        <h2 className="text-3xl font-black uppercase tracking-tighter text-content flex items-center gap-3">
                            <MapIcon className="text-accent" size={32} />
                            Warehouse Map Snapshot
                        </h2>
                        <p className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mt-2">
                            Snapshot context at {selectedDate} (6:00 PM)
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleCopy}
                            disabled={loading || !data.length}
                            className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-lg shadow-accent/20 disabled:opacity-50"
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {copied ? 'Copied' : 'Copy Full Map (MD)'}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-3 hover:bg-surface rounded-full text-muted transition-all active:scale-90 border border-subtle"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="px-8 py-6 space-y-6 overflow-hidden flex flex-col flex-1">
                    {/* Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] text-muted font-black uppercase tracking-widest pl-1">
                                Audit Date
                            </label>
                            <div className="relative group">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" size={18} />
                                <input
                                    type="date"
                                    min="2024-01-01"
                                    max={new Date().toISOString().split('T')[0]}
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full bg-surface border border-subtle rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold focus:outline-none focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all text-content"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-muted font-black uppercase tracking-widest pl-1">
                                Global Filter (SKU, Location, Wh)
                            </label>
                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search in map..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-surface border border-subtle rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold focus:outline-none focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all text-content"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Warning Message */}
                    <div className="p-4 bg-accent/5 border border-accent/10 rounded-2xl flex items-start gap-3">
                        <Info className="text-accent shrink-0 mt-0.5" size={18} />
                        <p className="text-[11px] font-bold text-muted leading-relaxed uppercase tracking-tight">
                            Note: SKUs marked with <span className="text-accent font-black">'T,'</span> represent a quantity difference compared to current live stock.
                        </p>
                    </div>

                    {/* Results Area */}
                    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-8">
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4 text-muted">
                                <div className="w-16 h-16 border-4 border-accent/10 border-t-accent animate-spin rounded-full" />
                                <span className="font-black uppercase tracking-widest text-[10px] animate-pulse">Reconstructing warehouse history...</span>
                            </div>
                        ) : Object.keys(groupedData).length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4 text-muted opacity-30">
                                <Layers size={64} />
                                <span className="font-black uppercase tracking-widest text-xs">No records found</span>
                            </div>
                        ) : (
                            <div className="space-y-12">
                                {Object.entries(groupedData).map(([wh, locations]) => (
                                    <div key={wh} className="space-y-6">
                                        <div className="flex items-center gap-4">
                                            <div className="h-px flex-1 bg-subtle" />
                                            <h3 className="text-2xl font-black uppercase tracking-tighter text-content bg-surface px-6 py-2 rounded-full border border-subtle shadow-sm flex items-center gap-3">
                                                <Layers className="text-accent" size={20} />
                                                {wh}
                                            </h3>
                                            <div className="h-px flex-1 bg-subtle" />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {Object.entries(locations).map(([loc, items]) => (
                                                <div key={loc} className="bg-surface/50 border border-subtle rounded-[2rem] p-6 hover:border-accent/30 transition-all group shadow-sm">
                                                    <div className="flex justify-between items-center mb-4 border-b border-subtle pb-3">
                                                        <span className="text-xs font-black uppercase tracking-[0.2em] text-accent">
                                                            {loc}
                                                        </span>
                                                        <span className="text-[9px] font-black text-muted uppercase">
                                                            {items.length} Items
                                                        </span>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {items.map((item, idx) => {
                                                            const currentQty = currentStockMap.get(`${item.warehouse}-${item.location}-${item.sku}`) ?? 0;
                                                            const isDifferent = item.quantity !== currentQty;

                                                            return (
                                                                <div key={idx} className="flex justify-between items-center text-[11px] font-mono group/item">
                                                                    <span className="text-content/80 flex items-center gap-1">
                                                                        {isDifferent && <span className="text-accent font-black">T,</span>}
                                                                        {item.sku}
                                                                    </span>
                                                                    <div className="h-px flex-1 mx-2 bg-subtle group-hover/item:bg-accent/20 transition-colors" />
                                                                    <span className="font-bold text-content">
                                                                        Qty: {item.quantity ?? 0}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
