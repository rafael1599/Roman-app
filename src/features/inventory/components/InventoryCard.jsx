import React from 'react';
import { Plus, Minus } from 'lucide-react';

export const InventoryCard = ({ sku, quantity, location, onIncrement, onDecrement, detail, onClick, warehouse }) => {
    const getWarehouseColor = (wh) => {
        switch (wh?.toUpperCase()) {
            case 'LUDLOW': return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'ATS': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    return (
        <div
            onClick={onClick}
            className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-3 flex flex-col shadow-sm active:border-neutral-700 transition-colors cursor-pointer"
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                    {location && <div className="text-base text-green-400 font-black uppercase tracking-widest mb-1">{location}</div>}
                    <div className="flex items-center gap-2 mb-2">
                        <div className="text-2xl font-black text-white font-mono tracking-tighter leading-none">{sku}</div>
                        {warehouse && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase border ${getWarehouseColor(warehouse)}`}>
                                {warehouse}
                            </span>
                        )}
                    </div>
                    {detail && (
                        <div className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 text-[9px] font-bold uppercase tracking-tight inline-flex items-center border border-neutral-700/50">
                            {detail}
                        </div>
                    )}
                </div>
                <div className="text-2xl font-black text-green-400 flex flex-col items-end">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest mb-0.5">Stock</span>
                    <span className="tabular-nums leading-none">{quantity}</span>
                </div>
            </div>

            <div className="flex gap-3 mt-auto">
                <button
                    onClick={(e) => { e.stopPropagation(); onDecrement(); }}
                    className="flex-1 h-12 bg-neutral-800 rounded-md flex items-center justify-center text-red-400 active:bg-neutral-700 active:scale-95 transition-all text-2xl font-bold touch-manipulation"
                    aria-label="Decrease quantity"
                >
                    <Minus className="w-6 h-6" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onIncrement(); }}
                    className="flex-1 h-12 bg-neutral-800 rounded-md flex items-center justify-center text-green-400 active:bg-neutral-700 active:scale-95 transition-all text-2xl font-bold touch-manipulation"
                    aria-label="Increase quantity"
                >
                    <Plus className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};
