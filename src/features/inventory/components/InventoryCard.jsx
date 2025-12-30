import React from 'react';
import { Plus, Minus } from 'lucide-react';

export const InventoryCard = ({ sku, quantity, location, onIncrement, onDecrement, detail, onClick }) => {
    return (
        <div
            onClick={onClick}
            className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-3 flex flex-col shadow-sm active:border-neutral-700 transition-colors cursor-pointer"
        >
            <div className="flex justify-between items-start mb-3">
                <div>
                    {location && <div className="text-sm text-green-400 font-bold uppercase tracking-wider mb-1">{location}</div>}
                    <div className="text-xl font-bold text-gray-100 font-mono tracking-wider">{sku}</div>
                    {detail && (
                        <div className="mt-1 inline-block px-2 py-0.5 rounded bg-yellow-900/30 border border-yellow-800/50 text-yellow-500 text-sm font-bold animate-pulse-slow">
                            {detail}
                        </div>
                    )}
                </div>
                <div className="text-3xl font-bold text-green-400 tabular-nums">
                    {quantity}
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
