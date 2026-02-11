import React, { useMemo, useState } from 'react';
import Package from 'lucide-react/dist/esm/icons/package';
import Printer from 'lucide-react/dist/esm/icons/printer';
import Check from 'lucide-react/dist/esm/icons/check';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import MessageSquare from 'lucide-react/dist/esm/icons/message-square';
import X from 'lucide-react/dist/esm/icons/x';
import Send from 'lucide-react/dist/esm/icons/send';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import { getOptimizedPickingPath, calculatePallets } from '../../../utils/pickingLogic';
import { CorrectionNotesTimeline, Note } from './CorrectionNotesTimeline';
import { generatePickingPdf } from '../../../utils/pickingPdf';
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
    customer,
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

    const finalSequence = useMemo(() => {
        const sequence: any[] = [];
        cartItems.forEach((cartItem) => {
            pallets.forEach((p: any) => {
                const palletItem = p.items.find(
                    (pi: any) => pi.sku === cartItem.sku && pi.location === cartItem.location
                );
                if (palletItem) {
                    const key = `${p.id}-${palletItem.sku}-${palletItem.location}`;
                    sequence.push({
                        ...palletItem,
                        key,
                        palletId: p.id,
                        isPicked: checkedItems.has(key),
                    });
                }
            });
        });
        return sequence;
    }, [cartItems, pallets, checkedItems]);

    return (
        <div className="flex flex-col h-full bg-card relative">
            {/* Header */}
            <div
                data-drag-handle="true"
                className="px-4 py-2 border-b border-subtle flex items-center justify-between shrink-0 bg-surface/50 backdrop-blur-sm sticky top-0 z-10 touch-none"
            >
                <button
                    onClick={() => onBack()}
                    className="p-2 hover:bg-surface rounded-lg text-muted transition-colors shrink-0"
                    title="Back to Picking"
                >
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1 mx-2">
                    <div className="flex flex-col items-center">
                        <h2 className="text-base font-black text-content uppercase tracking-tight">
                            Double Check
                        </h2>
                        <span className="text-[10px] font-mono bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20">
                            {orderNumber
                                ? `#${orderNumber}`
                                : activeListId
                                    ? `#${activeListId.slice(-6).toUpperCase()}`
                                    : 'STOCK DEDUCTION'}
                        </span>
                        {customer?.name && (
                            <span className="text-[10px] text-muted font-bold uppercase tracking-widest mt-1">
                                {customer.name}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest text-center mt-1">
                        {checkedCount}/{totalCheckboxes} Items Checked
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    {!correctionNotes.trim() && (
                        <button
                            onClick={onRelease}
                            className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-subtle text-muted rounded-xl hover:text-accent hover:border-accent transition-all shrink-0"
                            title="Release to Queue"
                        >
                            <X size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
                                Release
                            </span>
                        </button>
                    )}
                    <button
                        onClick={() => generatePickingPdf(finalSequence, orderNumber || activeListId || "CHECKLIST", pallets.length)}
                        className="p-2 bg-surface border border-subtle text-content rounded-xl hover:border-accent transition-all shrink-0"
                        title="Download PDF"
                    >
                        <Printer size={20} />
                    </button>
                </div>
            </div>

            {/* Clean Item List */}
            <div className="flex-1 overflow-y-auto p-3 bg-surface/20 min-h-0">
                {pallets.length === 0 && cartItems.length > 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <AlertCircle className="text-amber-500 mb-4 opacity-30" size={48} />
                        <p className="text-sm font-black text-muted uppercase tracking-widest">
                            No pallets generated
                        </p>
                        <p className="text-[10px] text-muted/60 font-bold uppercase mt-2">
                            Check if items have valid locations assigned
                        </p>
                    </div>
                )}

                {pallets.map((pallet: any) => (
                    <section key={pallet.id} className="mb-6">
                        <div className="flex items-center gap-3 mb-3 px-1">
                            <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center font-black text-[10px] border border-accent/30">
                                {pallet.id}
                            </span>
                            <h3 className="text-[11px] font-black text-content uppercase tracking-widest">
                                Pallet {pallet.id}
                            </h3>
                        </div>

                        <div className="grid gap-2">
                            {pallet.items.map((item: any) => {
                                const itemKey = `${pallet.id}-${item.sku}-${item.location}`;
                                const isChecked = checkedItems.has(itemKey);

                                return (
                                    <div
                                        key={itemKey}
                                        onClick={() => onToggleCheck(item, pallet.id)}
                                        className={`bg-card border transition-all duration-200 rounded-xl p-3 flex items-center justify-between gap-3 active:scale-[0.98] ${isChecked
                                            ? 'border-green-500/50 bg-green-500/5 shadow-sm'
                                            : 'border-subtle hover:border-accent/30 shadow-sm'
                                            }`}
                                    >
                                        {/* LEFT: SKU */}
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div
                                                className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors shrink-0 ${isChecked
                                                    ? 'bg-green-500/10 border-green-500/20'
                                                    : 'bg-surface border-subtle'
                                                    }`}
                                            >
                                                <Package
                                                    className={`w-5 h-5 ${isChecked ? 'text-green-500' : 'text-muted'}`}
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[10px] text-muted font-bold uppercase tracking-wider mb-0.5">
                                                    SKU
                                                </div>
                                                <div className="font-black text-content text-lg leading-none truncate tracking-tight">
                                                    {item.sku}
                                                </div>
                                            </div>
                                        </div>

                                        {/* CENTER: Quantity */}
                                        <div className="flex flex-col items-center px-2 shrink-0 min-w-[3.5rem]">
                                            <span className="text-[9px] text-muted font-black uppercase tracking-tighter opacity-70 mb-0.5">
                                                QTY
                                            </span>
                                            <div className="font-mono font-black text-2xl text-accent leading-none">
                                                {item.pickingQty}
                                            </div>
                                        </div>

                                        {/* RIGHT: Location & Checkbox */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            {/* Location Badge */}
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-surface border border-subtle rounded-lg shadow-sm">
                                                <MapPin size={12} className="text-muted" />
                                                <span className="text-sm font-black text-content uppercase tracking-wide">
                                                    {item.location}
                                                </span>
                                            </div>

                                            {/* Checkbox */}
                                            <div
                                                className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all ${isChecked
                                                    ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/20'
                                                    : 'bg-surface border-subtle text-transparent'
                                                    }`}
                                            >
                                                <Check size={28} strokeWidth={4} />
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
            <div className="px-8 py-4 pb-8 border-t border-subtle bg-surface/80 backdrop-blur-xl shrink-0">
                {checkedCount < totalCheckboxes && (
                    <div className="mb-3 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                        <AlertCircle size={14} className="text-amber-500" />
                        <span className="text-[10px] font-black text-amber-500/80 uppercase tracking-widest">
                            Verify everything or return to BUILDING to edit
                        </span>
                    </div>
                )}
                <SlideToConfirm
                    onConfirm={handleConfirm}
                    isLoading={isDeducting}
                    text={checkedCount === totalCheckboxes ? "SLIDE TO DEDUCT" : "SEND TO VERIFY"}
                    confirmedText={checkedCount === totalCheckboxes ? "DEDUCTING..." : "SENDING..."}
                    variant={checkedCount === totalCheckboxes ? "default" : "info"}
                    disabled={false}
                />
            </div>
        </div>
    );
};
