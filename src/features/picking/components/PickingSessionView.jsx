import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Package, Warehouse, MapPin, Printer, Minus, Plus, Trash2, ChevronDown } from 'lucide-react';
import { getOptimizedPickingPath, calculatePallets } from '../../../utils/pickingLogic';
import { generatePickingPdf } from '../../../utils/pickingPdf';
import { useLocationManagement } from '../../../hooks/useLocationManagement';
import { SlideToConfirm } from '../../../components/ui/SlideToConfirm';
import { useError } from '../../../context/ErrorContext';

export const PickingSessionView = ({ cartItems, activeListId, onDeduct, onUpdateQty, onRemoveItem, onClose }) => {
    const { locations } = useLocationManagement();
    const { showError } = useError();
    const [isDeducting, setIsDeducting] = useState(false);
    const [editingItemKey, setEditingItemKey] = useState(null);
    const [editingQuantity, setEditingQuantity] = useState('');
    const inputRef = useRef(null);

    const optimizedItems = useMemo(() => {
        return getOptimizedPickingPath(cartItems, locations);
    }, [cartItems, locations]);

    // 2. Calculate Pallets
    const pallets = useMemo(() => {
        return calculatePallets(optimizedItems);
    }, [optimizedItems]);

    const totalUnits = cartItems.reduce((acc, item) => acc + (item.pickingQty || 0), 0);

    // Effect to focus input when editing starts
    useEffect(() => {
        if (editingItemKey && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingItemKey]);

    const getItemKey = (palletId, item) => `${palletId}-${item.SKU}-${item.Location}`;

    const handleQuantityClick = (palletId, item) => {
        const key = getItemKey(palletId, item);
        setEditingItemKey(key);
        setEditingQuantity(item.pickingQty?.toString() || '0');
    };

    const handleQuantitySubmit = (item) => {
        const newQty = parseInt(editingQuantity, 10);
        const maxStock = parseInt(item.Quantity, 10) || 0;

        if (isNaN(newQty) || newQty < 0) {
            showError('Invalid Quantity', "Please enter a non-negative number.");
            setEditingQuantity(item.pickingQty?.toString() || '0');
        } else if (newQty > maxStock) {
            showError('Quantity Exceeded', `Cannot exceed stock of ${maxStock}.`);
            onUpdateQty(item, maxStock - (item.pickingQty || 0));
        } else if (newQty === 0) {
            onRemoveItem(item);
        } else {
            const delta = newQty - (item.pickingQty || 0);
            onUpdateQty(item, delta);
        }
        setEditingItemKey(null);
    };

    const handleQuantityKeyDown = (e, item) => {
        if (e.key === 'Enter') {
            handleQuantitySubmit(item);
        } else if (e.key === 'Escape') {
            setEditingItemKey(null);
            setEditingQuantity(item.pickingQty?.toString() || '0');
        }
    };

    const handleConfirm = async () => {
        setIsDeducting(true);
        try {
            await onDeduct(cartItems);
        } catch (error) {
            console.error(error);
        } finally {
            setIsDeducting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-card">
            {/* Header */}
            <div className="px-4 py-2 border-b border-subtle flex items-center justify-between shrink-0 bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-surface rounded-lg text-muted transition-colors shrink-0"
                    title="Close"
                >
                    <ChevronDown size={24} />
                </button>
                <div className="flex-1 mx-2">
                    <div className="flex items-center justify-center gap-2">
                        <h2 className="text-base font-black text-content uppercase tracking-tight">Review Pick List</h2>
                        {activeListId && (
                            <span className="text-[9px] font-mono bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20">
                                #{activeListId.slice(-6).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest text-center">
                        {pallets.length} Pallets • {totalUnits} Units
                    </p>
                </div>
                <button
                    onClick={() => generatePickingPdf(pallets)}
                    className="p-2 bg-surface border border-subtle text-content rounded-xl hover:border-accent transition-all shrink-0"
                    title="Download PDF"
                >
                    <Printer size={20} />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-3">
                {pallets.map((pallet, pIdx) => (
                    <section key={pallet.id} className="mb-4">
                        <div className="flex items-center justify-between mb-3 sticky top-0 bg-card z-10 py-2">
                            <div className="flex items-center gap-3">
                                <span className="w-8 h-8 rounded-full bg-accent text-main flex items-center justify-center font-black text-sm shadow-lg shadow-accent/20">
                                    {pallet.id}
                                </span>
                                <h3 className="text-sm font-black text-content uppercase tracking-wider">Pallet {pallet.id}</h3>
                            </div>
                            <div className="text-right">
                                <div className="flex items-center gap-2">
                                    <div className="w-24 h-1.5 bg-surface rounded-full overflow-hidden border border-subtle">
                                        <div
                                            className="h-full bg-accent transition-all duration-500"
                                            style={{ width: `${(pallet.totalUnits / 12) * 100}%` }}
                                        />
                                    </div>
                                    <span className="font-mono font-bold text-xs text-accent">{pallet.totalUnits}/12</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-1.5">
                            {pallet.items.map((item) => {
                                const maxStock = parseInt(item.Quantity, 10) || 0;
                                const isAtMax = (item.pickingQty || 0) >= maxStock;

                                return (
                                    <div
                                        key={`${pallet.id}-${item.SKU}-${item.Location}`}
                                        className="bg-surface/50 border border-subtle rounded-xl p-2 hover:border-accent/30 transition-all"
                                    >
                                        {/* Location Badge - Most Prominent */}
                                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-accent/20">
                                            <span className="text-[10px] text-muted font-bold uppercase tracking-widest">{item.Warehouse}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-black text-accent uppercase tracking-tight">{item.Location}</span>
                                                <div className="w-7 h-7 bg-accent/10 rounded-lg flex items-center justify-center border border-accent/30">
                                                    <MapPin className="w-4 h-4 text-accent" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* SKU and Stock Info */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 bg-main rounded-lg flex items-center justify-center border border-subtle shrink-0">
                                                <Package className="w-4 h-4 text-muted" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-content text-sm truncate">{item.SKU}</div>
                                                <div className="text-[9px] text-muted font-bold uppercase tracking-tighter">
                                                    Stock: {maxStock}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quantity Controls */}
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-subtle/50">
                                            <span className="text-[9px] text-muted font-black uppercase tracking-wider">Pick Qty</span>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center bg-main rounded-lg p-0.5 gap-0.5 border border-subtle">
                                                    <button
                                                        onClick={() => onUpdateQty(item, -1)}
                                                        className="w-7 h-7 flex items-center justify-center text-muted hover:text-content rounded active:bg-surface transition-colors"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    {editingItemKey === getItemKey(pallet.id, item) ? (
                                                        <input
                                                            ref={inputRef}
                                                            type="number"
                                                            value={editingQuantity}
                                                            onChange={(e) => setEditingQuantity(e.target.value)}
                                                            onBlur={() => handleQuantitySubmit(item)}
                                                            onKeyDown={(e) => handleQuantityKeyDown(e, item)}
                                                            className="w-10 text-center font-mono font-black text-accent text-base bg-transparent border-none focus:outline-none"
                                                            min="0"
                                                            max={maxStock.toString()}
                                                        />
                                                    ) : (
                                                        <div
                                                            onClick={() => handleQuantityClick(pallet.id, item)}
                                                            className="w-10 text-center font-mono font-black text-accent text-base cursor-pointer hover:bg-surface/50 rounded transition-colors"
                                                        >
                                                            {item.pickingQty}
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() => onUpdateQty(item, 1)}
                                                        disabled={isAtMax}
                                                        className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${isAtMax ? 'text-subtle cursor-not-allowed' : 'text-muted hover:text-content active:bg-surface'
                                                            }`}
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => onRemoveItem(item)}
                                                    className="p-2 text-muted hover:text-red-500 transition-colors"
                                                    title="Remove item"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {pIdx < pallets.length - 1 && (
                            <div className="flex justify-center py-4 opacity-20">
                                <div className="w-px h-8 bg-gradient-to-b from-accent to-transparent" />
                            </div>
                        )}
                    </section>
                ))}
            </div>

            {/* Footer */}
            <div className="px-12 py-2 pb-20 border-t border-subtle bg-surface/30 backdrop-blur-xl shrink-0">
                <SlideToConfirm
                    onConfirm={handleConfirm}
                    isLoading={isDeducting}
                    text="SLIDE TO DEDUCT"
                    confirmedText="DEDUCTING..."
                />
            </div>
        </div>
    );
};
