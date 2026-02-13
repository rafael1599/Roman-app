import React, { useMemo, useState } from 'react';
import Check from 'lucide-react/dist/esm/icons/check';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import MessageSquare from 'lucide-react/dist/esm/icons/message-square';
import X from 'lucide-react/dist/esm/icons/x';
import Send from 'lucide-react/dist/esm/icons/send';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import { getOptimizedPickingPath, calculatePallets } from '../../../utils/pickingLogic';
import { CorrectionNotesTimeline, Note } from './CorrectionNotesTimeline';
import { SlideToConfirm } from '../../../components/ui/SlideToConfirm.tsx';
import { useLocationManagement } from '../../../hooks/useLocationManagement';
import { useConfirmation } from '../../../context/ConfirmationContext';
import toast from 'react-hot-toast';

// Define PickingItem Interface (Redefined or imported from shared location if preferred)
export interface PickingItem {
    sku: string;
    location: string | null;
    pickingQty: number; // usually set by this point
    quantity: string | number;
    warehouse?: string;
    [key: string]: any;
}

interface DoubleCheckViewProps {
    cartItems: PickingItem[];
    orderNumber?: string | null;
    activeListId?: string | null;
    checkedItems: Set<string>;
    onToggleCheck: (item: PickingItem, palletId: number | string) => void;
    onDeduct: (items: PickingItem[], isFullyVerified: boolean) => Promise<boolean>;
    onClose: () => void;
    onBack: (id?: string | null) => void;
    onRelease: () => void;
    onReturnToPicker: (notes: string) => void;
    isOwner?: boolean;
    notes?: Note[];
    isNotesLoading?: boolean;
    onAddNote: (note: string) => Promise<void> | void;
    customer?: { name: string } | null;
}

export const DoubleCheckView: React.FC<DoubleCheckViewProps> = ({
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
    notes = [],
    isNotesLoading = false,
    onAddNote,
    // customer, // Unused in minimalist view
}) => {
    const { locations } = useLocationManagement();
    const { showConfirmation } = useConfirmation();
    const [isDeducting, setIsDeducting] = useState(false);
    const [correctionNotes, setCorrectionNotes] = useState('');
    const [isNotesExpanded, setIsNotesExpanded] = useState(false);

    // Calculate Pallets based on optimized items
    const pallets = useMemo(() => {
        // Need to cast cartItems to compatible type for getOptimizedPickingPath if needed, 
        // assuming utility handles the interface roughly correctly
        const optimizedItems = getOptimizedPickingPath(cartItems, locations);
        return calculatePallets(optimizedItems);
    }, [cartItems, locations]);

    const checkedCount = checkedItems.size;
    const totalCheckboxes = useMemo(() => {
        return pallets.reduce((sum: number, p: any) => sum + p.items.length, 0);
    }, [pallets]);

    const handleConfirm = async () => {
        const isFullyVerified = checkedCount === totalCheckboxes;

        setIsDeducting(true);
        try {
            await onDeduct(cartItems, isFullyVerified);
        } catch (error) {
            console.error(error);
        } finally {
            setIsDeducting(false);
        }
    };

    const handleReturnToPicker = async () => {
        if (!correctionNotes.trim()) return;

        showConfirmation(
            'Confirm Return',
            'Are you sure you want to return this order to the picker? This will release the order from your verification queue.',
            async () => {
                try {
                    await onAddNote(correctionNotes.trim());
                    onReturnToPicker(correctionNotes.trim());
                    setCorrectionNotes('');
                    setIsNotesExpanded(false);
                    onClose();
                    toast.success('Order returned for correction');
                } catch (error) {
                    console.error('Failed to send for correction:', error);
                    toast.error('Failed to return order');
                }
            },
            () => { },
            'Return to Picker',
            'Cancel'
        );
    };

    return (
        <div className="flex flex-col h-full bg-black relative">
            {/* Minimalist Header */}
            <div className="px-5 py-4 flex items-center justify-between shrink-0 bg-black/90 backdrop-blur-md sticky top-0 z-10 touch-none border-b border-white/10">
                <button
                    onClick={() => onBack()}
                    className="p-2 -ml-2 hover:bg-white/10 rounded-full text-white/70 transition-colors shrink-0"
                    title="Back to Picking"
                >
                    <ChevronLeft size={28} />
                </button>

                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-accent/90 tracking-widest bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                            {orderNumber
                                ? `#${orderNumber}`
                                : activeListId
                                    ? `#${activeListId.slice(-6).toUpperCase()}`
                                    : 'STOCK DEDUCTION'}
                        </span>
                    </div>
                    {/* Progress Text */}
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mt-1">
                        {checkedCount} / {totalCheckboxes} Verified
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    {!correctionNotes.trim() && (
                        <button
                            onClick={onRelease}
                            className="p-2 hover:bg-white/10 rounded-full text-white/50 transition-colors"
                            title="Release to Queue"
                        >
                            <X size={24} />
                        </button>
                    )}
                </div>
            </div>

            {/* Clean Item List */}
            <div className="flex-1 overflow-y-auto p-4 bg-black min-h-0 pb-32">
                {pallets.length === 0 && cartItems.length > 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <AlertCircle className="text-amber-500 mb-4 opacity-30" size={48} />
                        <p className="text-sm font-black text-white/50 uppercase tracking-widest">
                            No pallets generated
                        </p>
                    </div>
                )}

                {pallets.map((pallet: any) => (
                    <section key={pallet.id} className="mb-8">
                        {/* Pallet Header */}
                        <div className="flex items-center gap-3 mb-4 sticky top-0 bg-black/95 py-2 z-5 backdrop-blur-sm">
                            <div className="h-[1px] flex-1 bg-white/10" />
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] border border-white/10 px-3 py-1 rounded-full">
                                Pallet {pallet.id}
                            </span>
                            <div className="h-[1px] flex-1 bg-white/10" />
                        </div>

                        <div className="flex flex-col gap-3">
                            {pallet.items.map((item: any) => {
                                const itemKey = `${pallet.id}-${item.sku}-${item.location}`;
                                const isChecked = checkedItems.has(itemKey);

                                return (
                                    <div
                                        key={itemKey}
                                        onClick={() => {
                                            if (navigator.vibrate) navigator.vibrate(50);
                                            onToggleCheck(item, pallet.id)
                                        }}
                                        className={`transition-all duration-200 rounded-2xl p-4 flex items-center justify-between gap-4 active:scale-[0.98] cursor-pointer border ${isChecked
                                            ? 'bg-green-500/10 border-green-500/30'
                                            : 'bg-white/5 border-white/5 hover:border-white/10'
                                            }`}
                                    >
                                        {/* LEFT: SKU & Quantity */}
                                        <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                                            <div className="flex items-baseline gap-2">
                                                <span className={`font-black text-2xl tracking-tight leading-none ${isChecked ? 'text-green-400' : 'text-white'}`}>
                                                    {item.sku}
                                                </span>
                                            </div>
                                            {/* Quantity moved below SKU */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded">
                                                    Qty: {item.pickingQty}
                                                </span>
                                            </div>
                                        </div>

                                        {/* RIGHT: Location (Most Important) & Checkbox */}
                                        <div className="flex items-center gap-5 shrink-0">
                                            {/* Location - Prominent like QTY was */}
                                            <div className="flex flex-col items-end">
                                                <span className="text-[9px] text-white/30 font-black uppercase tracking-widest mb-0.5">
                                                    ROW
                                                </span>
                                                <div className="font-mono font-black text-3xl text-amber-500 leading-none">
                                                    {/* Extract just the number if it matches "Row X" or show full */}
                                                    {item.location?.toLowerCase().replace('row', '').trim() || '-'}
                                                </div>
                                            </div>

                                            {/* Simplified Checkbox */}
                                            <div
                                                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${isChecked
                                                    ? 'bg-green-500 border-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                                    : 'border-white/20 text-transparent'
                                                    }`}
                                            >
                                                <Check size={18} strokeWidth={4} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}

                {/* Notes History */}
                <div className="mt-8 mb-6 mx-1">
                    <CorrectionNotesTimeline notes={notes} isLoading={isNotesLoading} />
                </div>

                {/* Correction Section */}
                <section
                    className={`mt-4 mb-12 border rounded-2xl mx-1 transition-all duration-300 ${isNotesExpanded ? 'bg-amber-500/5 border-amber-500/20' : 'bg-surface border-subtle'}`}
                >
                    <button
                        onClick={() => setIsNotesExpanded(!isNotesExpanded)}
                        className="w-full flex items-center justify-between p-4"
                    >
                        <div className="flex items-center gap-2">
                            <MessageSquare
                                size={16}
                                className={isNotesExpanded ? 'text-amber-500' : 'text-muted'}
                            />
                            <h3
                                className={`text-[11px] font-black uppercase tracking-widest ${isNotesExpanded ? 'text-amber-500/70' : 'text-muted'}`}
                            >
                                {notes.length > 0 ? 'Add Another Note' : 'Add Verification Notes'}
                            </h3>
                        </div>
                        <ChevronDown
                            size={14}
                            className={`text-muted transition-transform duration-300 ${isNotesExpanded ? 'rotate-180' : ''}`}
                        />
                    </button>

                    {isNotesExpanded && (
                        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <textarea
                                value={correctionNotes}
                                onChange={(e) => setCorrectionNotes(e.target.value)}
                                placeholder="Explain what needs to be fixed..."
                                className="w-full h-24 bg-card border border-subtle rounded-xl p-3 text-sm text-content focus:outline-none focus:border-amber-500/30 resize-none transition-all mb-3 placeholder:text-muted/50"
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        onAddNote(correctionNotes.trim());
                                        setCorrectionNotes('');
                                    }}
                                    disabled={!correctionNotes.trim()}
                                    className="flex-1 py-3 bg-surface border border-subtle text-muted font-black uppercase tracking-widest text-[9px] rounded-xl active:scale-95 transition-all disabled:opacity-30"
                                >
                                    Save Note Only
                                </button>
                                <button
                                    onClick={handleReturnToPicker}
                                    disabled={!correctionNotes.trim()}
                                    className="flex-[2] py-3 bg-amber-500 text-main font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg shadow-amber-500/10 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                                >
                                    <Send size={14} />
                                    Return to Picker
                                </button>
                            </div>
                            <p className="text-[9px] text-muted font-bold text-center mt-3 uppercase tracking-tighter italic">
                                Notes help pickers avoid the same mistakes
                            </p>
                        </div>
                    )}
                </section>
            </div>

            {/* Final Action Footer */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/90 to-transparent shrink-0 z-20">
                {checkedCount < totalCheckboxes && (
                    <div className="mb-4 flex items-center justify-center gap-2 animate-pulse">
                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                            {totalCheckboxes - checkedCount} items remaining
                        </span>
                    </div>
                )}
                <SlideToConfirm
                    onConfirm={handleConfirm}
                    isLoading={isDeducting}
                    text={checkedCount === totalCheckboxes ? "SLIDE TO COMPLETE" : "SEND TO VERIFY"}
                    confirmedText={checkedCount === totalCheckboxes ? "COMPLETING..." : "SENDING..."}
                    variant={checkedCount === totalCheckboxes ? "default" : "info"}
                    disabled={false}
                />
            </div>
        </div>
    );
};
