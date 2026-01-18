import React, { useState, useRef, useEffect } from 'react'; // Add useRef and useEffect
import { Minus, Plus, Trash2, CheckCircle, ChevronUp, ChevronDown } from 'lucide-react';

export const PickingCartDrawer = ({ cartItems, onUpdateQty, onRemoveItem, onDeduct, onSetQty }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [editingItemId, setEditingItemId] = useState(null); // State to track which item is being edited
    const [editingQuantity, setEditingQuantity] = useState(''); // State for the input field value
    const inputRef = useRef(null); // Ref for auto-focusing the input

    const totalItems = cartItems.length;
    const totalQty = cartItems.reduce((acc, item) => acc + (item.pickingQty || 0), 0);

    // Effect to focus the input when editing starts
    useEffect(() => {
        if (editingItemId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select(); // Select all text for easy replacement
        }
    }, [editingItemId]);

    const handleQuantityClick = (item) => {
        setEditingItemId(item.id || item.SKU);
        setEditingQuantity(item.pickingQty?.toString() || '0');
    };

    const handleQuantitySubmit = (item) => {
        const newQty = parseInt(editingQuantity, 10);
        const maxStock = parseInt(item.Quantity, 10) || 0;

        if (isNaN(newQty) || newQty < 0) {
            alert("Invalid quantity entered. Please enter a non-negative number.");
            setEditingQuantity(item.pickingQty?.toString() || '0'); // Revert to original
        } else if (newQty > maxStock) {
            alert(`Quantity cannot exceed available stock of ${maxStock}. Setting to max.`);
            onSetQty(item, maxStock);
        } else if (newQty === 0) {
            onRemoveItem(item); // Remove item if quantity is set to 0
        } else {
            onSetQty(item, newQty);
        }
        setEditingItemId(null); // Exit editing mode
    };

    const handleQuantityKeyDown = (e, item) => {
        if (e.key === 'Enter') {
            handleQuantitySubmit(item);
        } else if (e.key === 'Escape') {
            setEditingItemId(null); // Cancel editing
            setEditingQuantity(item.pickingQty?.toString() || '0'); // Revert to original
        }
    };

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
                    className="mx-4 bg-accent text-main p-4 rounded-t-2xl shadow-2xl flex items-center justify-between cursor-pointer active:opacity-90 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-main/20 px-3 py-1 rounded-full font-black text-[10px]">
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
                    <div className="bg-card border-t border-subtle h-[60vh] flex flex-col shadow-2xl">
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {cartItems.map((item) => {
                                const maxStock = parseInt(item.Quantity, 10) || 0;
                                const isAtMax = (item.pickingQty || 0) >= maxStock;
                                const isEditing = editingItemId === (item.id || item.SKU);

                                return (
                                    <div key={item.id || item.SKU} className="bg-surface rounded-xl p-3 flex items-center gap-3">
                                        <div className="flex-1">
                                            <div className="text-content font-black text-lg">{item.SKU}</div>
                                            <div className="text-muted text-xs uppercase font-bold">
                                                {item.Location} • {item.Warehouse}
                                            </div>
                                            <div className="text-[10px] text-muted font-bold uppercase tracking-tighter mt-1">
                                                Stock Available: {maxStock}
                                            </div>
                                        </div>

                                        <div className="flex items-center bg-main rounded-lg p-1 gap-1">
                                            <button
                                                onClick={() => onUpdateQty(item, -1)}
                                                className="w-8 h-8 flex items-center justify-center text-muted hover:text-content rounded active:bg-surface"
                                            >
                                                <Minus size={16} />
                                            </button>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    ref={inputRef}
                                                    value={editingQuantity}
                                                    onChange={(e) => setEditingQuantity(e.target.value)}
                                                    onBlur={() => handleQuantitySubmit(item)}
                                                    onKeyDown={(e) => handleQuantityKeyDown(e, item)}
                                                    className="w-12 text-center font-black text-accent text-lg bg-transparent border-none focus:outline-none"
                                                    min="0"
                                                    max={maxStock.toString()}
                                                />
                                            ) : (
                                                <div
                                                    className="w-8 text-center font-black text-accent text-lg cursor-pointer"
                                                    onClick={() => handleQuantityClick(item)}
                                                >
                                                    {item.pickingQty}
                                                </div>
                                            )}
                                            <button
                                                onClick={() => onUpdateQty(item, 1)}
                                                disabled={isAtMax}
                                                className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${isAtMax
                                                    ? 'text-subtle cursor-not-allowed'
                                                    : 'text-muted hover:text-content active:bg-surface'
                                                    }`}
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => onRemoveItem(item)}
                                            className="p-2 text-muted hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-4 bg-surface border-t border-subtle pb-safe">
                            <button
                                onClick={onDeduct}
                                className="w-full py-4 bg-accent hover:opacity-90 text-main font-black text-xl uppercase tracking-widest rounded-xl shadow-lg shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-2"
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
