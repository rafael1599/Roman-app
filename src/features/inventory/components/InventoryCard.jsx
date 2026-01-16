import { Plus, Minus, ArrowRightLeft } from 'lucide-react';

export const InventoryCard = ({ sku, quantity, location, onIncrement, onDecrement, onMove, detail, onClick, warehouse, mode = 'stock' }) => {
    const getWarehouseColor = (wh) => {
        switch (wh?.toUpperCase()) {
            case 'LUDLOW': return 'bg-green-500/10 text-green-500 border-green-500/30';
            case 'ATS': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
            default: return 'bg-surface text-muted border-subtle';
        }
    };

    return (
        <div
            onClick={onClick}
            className="bg-card border border-subtle rounded-lg p-4 mb-3 flex flex-col shadow-sm active:border-accent/30 transition-colors cursor-pointer"
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                    {location && <div className="text-base text-accent font-black uppercase tracking-widest mb-1">{location}</div>}
                    <div className="flex items-center gap-2 mb-2">
                        <div className="text-2xl font-black text-content font-mono tracking-tighter leading-none">{sku}</div>
                        {warehouse && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase border ${getWarehouseColor(warehouse)}`}>
                                {warehouse}
                            </span>
                        )}
                    </div>
                    {detail && (
                        <div className="px-1.5 py-0.5 rounded bg-surface text-muted text-[9px] font-bold uppercase tracking-tight inline-flex items-center border border-subtle">
                            {detail}
                        </div>
                    )}
                </div>
                <div className="text-2xl font-black text-accent flex flex-col items-end">
                    <span className="text-[10px] text-muted uppercase tracking-widest mb-0.5">Stock</span>
                    <span className="tabular-nums leading-none">{quantity}</span>
                </div>
            </div>

            {mode === 'stock' && (
                <div className="flex gap-3 mt-auto">
                    <button
                        onClick={(e) => { e.stopPropagation(); onDecrement(); }}
                        className="ios-btn-surface flex-1 h-14 text-accent-red active:scale-95"
                        aria-label="Decrease quantity"
                    >
                        <Minus size={20} strokeWidth={3} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onMove(); }}
                        className="ios-btn-surface flex-1 h-14 text-accent-blue active:scale-95"
                        aria-label="Move item"
                    >
                        <ArrowRightLeft size={20} strokeWidth={3} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onIncrement(); }}
                        className="ios-btn-surface flex-1 h-14 text-accent-primary active:scale-95"
                        aria-label="Increase quantity"
                    >
                        <Plus size={20} strokeWidth={3} />
                    </button>
                </div>
            )}
        </div>
    );
};
