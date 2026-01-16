import React, { useState } from 'react';
import { Minus, Plus, Trash2, CheckCircle, ChevronUp, ChevronDown } from 'lucide-react';

export const PickingCartDrawer = ({ cartItems, onUpdateQty, onRemoveItem, onDeduct }) => {
    const [isOpen, setIsOpen] = useState(false);

    const totalItems = cartItems.length;
    const totalQty = cartItems.reduce((acc, item) => acc + (item.pickingQty || 0), 0);

    if (totalItems === 0) return null;

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
                    onClick={() => setIsOpen(false)}
                />
            )}
            <div className="fixed left-0 right-0 bottom-20 z-50 transition-all duration-300 ease-in-out">
                {/* Header / Toggle */}
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className="mx-4 bg-green-500 text-black p-4 rounded-t-2xl shadow-2xl flex items-center justify-between cursor-pointer active:bg-green-400 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-black/20 px-3 py-1 rounded-full font-black text-[10px]">
                            {totalItems} LINES
                        </div>
                        <div className="font-bold uppercase tracking-tight text-sm">
                            {totalQty} Units to Pick
                        </div>
                    </div>
                    {isOpen ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
                </div>

                {/* Expanded Content */}
                {isOpen && (
                    <div className="bg-neutral-900 border-t border-neutral-800 h-[60vh] flex flex-col shadow-2xl">
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {cartItems.map((item) => {
                                const maxStock = parseInt(item.Quantity, 10) || 0;
                                const isAtMax = (item.pickingQty || 0) >= maxStock;

                                return (
                                    <div key={item.id || item.SKU} className="bg-neutral-800 rounded-xl p-3 flex items-center gap-3">
                                        <div className="flex-1">
                                            <div className="text-white font-black text-lg">{item.SKU}</div>
                                            <div className="text-neutral-400 text-xs uppercase font-bold">
                                                {item.Location} • {item.Warehouse}
                                            </div>
                                            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-tighter mt-1">
                                                Stock Available: {maxStock}
                                            </div>
                                        </div>

                                        <div className="flex items-center bg-neutral-900 rounded-lg p-1 gap-1">
                                            <button
                                                onClick={() => onUpdateQty(item, -1)}
                                                className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white rounded active:bg-neutral-700"
                                            >
                                                <Minus size={16} />
                                            </button>
                                            <div className="w-8 text-center font-black text-green-400 text-lg">
                                                {item.pickingQty}
                                            </div>
                                            <button
                                                onClick={() => onUpdateQty(item, 1)}
                                                disabled={isAtMax}
                                                className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${isAtMax
                                                    ? 'text-neutral-700 cursor-not-allowed'
                                                    : 'text-neutral-400 hover:text-white active:bg-neutral-700'
                                                    }`}
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => onRemoveItem(item)}
                                            className="p-2 text-neutral-500 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-4 bg-neutral-950 border-t border-neutral-800 pb-safe">
                            <button
                                onClick={onDeduct}
                                className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-black text-xl uppercase tracking-widest rounded-xl shadow-lg shadow-green-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={24} />
                                Verify & Deduct
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};
