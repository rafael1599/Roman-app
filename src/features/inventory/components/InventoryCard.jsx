import React from 'react';
import { Plus, Minus } from 'lucide-react';

export const InventoryCard = ({ sku, quantity, location, onIncrement, onDecrement, detail, onClick }) => {
    return (
        <div
            onClick={onClick}
            className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-3 flex flex-col shadow-sm active:border-neutral-700 transition-colors cursor-pointer"
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                    {location && <div className="text-base text-green-400 font-black uppercase tracking-widest mb-1">{location}</div>}
                    <div className="text-2xl font-black text-white font-mono tracking-tighter leading-none mb-2">{sku}</div>
                    {detail && (
                        <div className="px-2 py-1 rounded bg-yellow-400 text-black text-[10px] font-black uppercase tracking-tighter inline-flex items-center">
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
