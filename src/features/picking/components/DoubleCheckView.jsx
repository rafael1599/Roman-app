import React, { useMemo, useState } from 'react';
import { Package, Printer, Check, ChevronLeft, RotateCcw, MessageSquare, X, Send, ChevronDown } from 'lucide-react';
import { getOptimizedPickingPath, calculatePallets } from '../../../utils/pickingLogic';
import { generatePickingPdf } from '../../../utils/pickingPdf';
import { SlideToConfirm } from '../../../components/ui/SlideToConfirm';
import { useLocationManagement } from '../../../hooks/useLocationManagement';

export const DoubleCheckView = ({
    cartItems,
    orderNumber,
    activeListId,
    checkedItems,
    onToggleCheck,
    onDeduct,
    onClose,
    onBack,
    onRelease,
    onReturnToPicker,
    isOwner
}) => {
    const { locations } = useLocationManagement();
    const [isDeducting, setIsDeducting] = useState(false);
    const [correctionNotes, setCorrectionNotes] = useState('');
    const [isNotesExpanded, setIsNotesExpanded] = useState(false);

    // Calculate Pallets based on optimized items
    const pallets = useMemo(() => {
        const optimizedItems = getOptimizedPickingPath(cartItems, locations);
        return calculatePallets(optimizedItems);
    }, [cartItems, locations]);

    const totalUnits = cartItems.reduce((acc, item) => acc + (item.pickingQty || 0), 0);
    const checkedCount = checkedItems.size;
    const totalCheckboxes = useMemo(() => {
        return pallets.reduce((sum, p) => sum + p.items.length, 0);
    }, [pallets]);

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

    const handleReturnToPicker = () => {
        if (!correctionNotes.trim()) return;
        if (window.confirm('Are you sure you want to return this order to the picker for correction?')) {
            onReturnToPicker(correctionNotes.trim());
            onClose();
        }
    };

    const finalSequence = useMemo(() => {
        const sequence = [];
        cartItems.forEach(cartItem => {
            pallets.forEach(p => {
                const palletItem = p.items.find(pi => pi.SKU === cartItem.SKU && pi.Location === cartItem.Location);
                if (palletItem) {
                    const key = `${p.id}-${palletItem.SKU}-${palletItem.Location}`;
                    sequence.push({
                        ...palletItem,
                        key,
                        palletId: p.id,
                        isPicked: checkedItems.has(key)
                    });
                }
            });
        });
        return sequence;
    }, [cartItems, pallets, checkedItems]);

    return (
        <div className="flex flex-col h-full bg-card relative">
            {/* Header */}
            <div className="px-4 py-2 border-b border-subtle flex items-center justify-between shrink-0 bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
                {isOwner && (
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-surface rounded-lg text-muted transition-colors shrink-0"
                        title="Back to Picking"
                    >
                        <ChevronLeft size={24} />
                    </button>
                )}
                <div className="flex-1 mx-2">
                    <div className="flex flex-col items-center">
                        <h2 className="text-base font-black text-content uppercase tracking-tight">Double Check</h2>
                        <span className="text-[10px] font-mono bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20">
                            {orderNumber ? `#${orderNumber}` : (activeListId ? `#${activeListId.slice(-6).toUpperCase()}` : 'STOCK DEDUCTION')}
                        </span>
                    </div>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest text-center mt-1">
                        {checkedCount}/{totalCheckboxes} Items Checked
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    {!correctionNotes.trim() && (
                        <button
                            onClick={() => {
                                if (checkedCount > 0) {
                                    if (window.confirm('You have checked items. Are you sure you want to release this order to the queue? Your progress will be saved.')) {
                                        onRelease();
                                    }
                                } else {
                                    onRelease();
                                }
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-subtle text-muted rounded-xl hover:text-accent hover:border-accent transition-all shrink-0"
                            title="Release to Queue"
                        >
                            <X size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Release</span>
                        </button>
                    )}
                    <button
                        onClick={() => generatePickingPdf(finalSequence, orderNumber, pallets.length)}
                        className="p-2 bg-surface border border-subtle text-content rounded-xl hover:border-accent transition-all shrink-0"
                        title="Download PDF"
                    >
                        <Printer size={20} />
                    </button>
                </div>
            </div>

            {/* Clean Item List */}
            <div className="flex-1 overflow-y-auto p-3 bg-surface/20">
                {pallets.map((pallet) => (
                    <section key={pallet.id} className="mb-6">
                        <div className="flex items-center gap-3 mb-3 px-1">
                            <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center font-black text-[10px] border border-accent/30">
                                {pallet.id}
                            </span>
                            <h3 className="text-[11px] font-black text-content uppercase tracking-widest">Pallet {pallet.id}</h3>
                        </div>

                        <div className="grid gap-2">
                            {pallet.items.map((item) => {
                                const itemKey = `${pallet.id}-${item.SKU}-${item.Location}`;
                                const isChecked = checkedItems.has(itemKey);

                                return (
                                    <div
                                        key={itemKey}
                                        onClick={() => onToggleCheck(item, pallet.id)}
                                        className={`bg-card border transition-all duration-200 rounded-xl p-3 flex items-center justify-between gap-4 active:scale-[0.98] ${isChecked
                                            ? 'border-green-500/50 bg-green-500/5 shadow-sm'
                                            : 'border-subtle hover:border-accent/30 shadow-sm'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${isChecked ? 'bg-green-500/10 border-green-500/20' : 'bg-surface border-subtle'
                                                }`}>
                                                <Package className={`w-4 h-4 ${isChecked ? 'text-green-500' : 'text-muted'}`} />
                                            </div>
                                            <div className="font-bold text-content text-base truncate tracking-tight">
                                                {item.SKU}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] text-muted font-black uppercase tracking-tighter opacity-50">Units</span>
                                                <div className="font-mono font-black text-lg text-accent leading-none">
                                                    {item.pickingQty}
                                                </div>
                                            </div>

                                            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${isChecked
                                                ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/20'
                                                : 'bg-surface border-subtle text-transparent'
                                                }`}>
                                                <Check size={20} strokeWidth={4} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
                {/* Correction Section */}
                <section className={`mt-8 mb-12 border rounded-2xl mx-1 transition-all duration-300 ${isNotesExpanded ? 'bg-amber-500/5 border-amber-500/20' : 'bg-surface border-subtle'}`}>
                    <button
                        onClick={() => setIsNotesExpanded(!isNotesExpanded)}
                        className="w-full flex items-center justify-between p-4"
                    >
                        <div className="flex items-center gap-2">
                            <MessageSquare size={16} className={isNotesExpanded ? 'text-amber-500' : 'text-muted'} />
                            <h3 className={`text-[11px] font-black uppercase tracking-widest ${isNotesExpanded ? 'text-amber-500/70' : 'text-muted'}`}>Verification Notes</h3>
                        </div>
                        <ChevronDown size={14} className={`text-muted transition-transform duration-300 ${isNotesExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {isNotesExpanded && (
                        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <textarea
                                value={correctionNotes}
                                onChange={(e) => setCorrectionNotes(e.target.value)}
                                placeholder="Add notes for the picker if adjustments are needed..."
                                className="w-full h-24 bg-card border border-subtle rounded-xl p-3 text-sm text-content focus:outline-none focus:border-amber-500/30 resize-none transition-all mb-3 placeholder:text-muted/50"
                                autoFocus
                            />
                            <button
                                onClick={handleReturnToPicker}
                                disabled={!correctionNotes.trim()}
                                className="w-full py-3 bg-amber-500 text-main font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-amber-500/10 active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100 flex items-center justify-center gap-2"
                            >
                                <Send size={14} />
                                Send to Picker
                            </button>
                            <p className="text-[9px] text-muted font-bold text-center mt-3 uppercase tracking-tighter italic">
                                The order will be moved back for review
                            </p>
                        </div>
                    )}
                </section>
            </div>

            {/* Final Action Footer */}
            <div className="px-8 py-4 pb-20 border-t border-subtle bg-surface/80 backdrop-blur-xl shrink-0">
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
