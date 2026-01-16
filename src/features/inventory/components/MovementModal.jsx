import { useState, useEffect } from 'react';
import { X, ArrowRightLeft, Move, CheckCircle2, AlertTriangle, Zap } from 'lucide-react';
import { useInventory } from '../../../hooks/useInventoryData';
import { useMovementForm } from '../../../hooks/useMovementForm';
import { useLocationSuggestions } from '../../../hooks/useLocationSuggestions';
import AutocompleteInput from '../../../components/ui/AutocompleteInput';
import { CapacityBar } from '../../../components/ui/CapacityBar';

export const MovementModal = ({ isOpen, onClose, onMove, initialSourceItem }) => {
    // Hooks
    const { formData, setField, validate, setFormData } = useMovementForm(initialSourceItem);

    const excludeLoc = (initialSourceItem?.Warehouse === formData.targetWarehouse) ? initialSourceItem?.Location : null;
    const { suggestions, skuVelocity, mergeOpportunity } = useLocationSuggestions(
        formData.targetLocation ? null : initialSourceItem?.SKU,
        formData.targetWarehouse,
        excludeLoc
    );

    // Derived
    const isValid = validate().isValid;

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (!isValid) return;

        onMove({
            sourceItem: initialSourceItem,
            targetWarehouse: formData.targetWarehouse,
            targetLocation: formData.targetLocation,
            quantity: parseInt(formData.quantity)
        });
        onClose();
    };

    // Helper for zone colors
    const getZoneColor = (zone) => {
        if (zone === 'HOT') return 'text-red-500';
        if (zone === 'WARM') return 'text-orange-500';
        return 'text-blue-500';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-subtle rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-5 border-b border-subtle flex items-start justify-between bg-surface/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-black text-content flex items-center gap-2 uppercase tracking-tighter">
                            <ArrowRightLeft className="text-accent" size={24} />
                            Relocate Stock
                        </h2>
                        {skuVelocity !== null && (
                            <div className="flex items-center gap-2 mt-2">
                                <span className="bg-accent/10 text-accent border border-accent/20 text-[10px] uppercase font-black px-2 py-0.5 rounded flex items-center gap-1">
                                    <Zap size={10} />
                                    {skuVelocity.toFixed(1)} picks/day
                                </span>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-muted hover:text-content transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Source Info Card */}
                    <div className="bg-surface border border-subtle rounded-xl p-4 flex justify-between items-center group relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-accent" />
                        <div>
                            <h3 className="text-lg font-black text-content flex gap-2">
                                <span className="text-muted font-bold uppercase tracking-widest text-[10px] self-center">Moving</span>
                                {initialSourceItem?.SKU}
                            </h3>
                            <p className="text-xs text-muted font-medium mt-0.5">
                                From: <span className="text-content font-bold">{initialSourceItem?.Location}</span> • {initialSourceItem?.Warehouse}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-black text-content">{initialSourceItem?.Quantity}</p>
                            <p className="text-[9px] text-muted uppercase font-black tracking-widest">Available</p>
                        </div>
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-5">
                        {/* Quantity */}
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">Quantity to Move</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={formData.quantity}
                                    onChange={(e) => setField('quantity', Math.min(initialSourceItem?.Quantity || 0, parseInt(e.target.value) || 0))}
                                    className="w-full bg-main border border-subtle rounded-xl py-4 px-4 text-center text-3xl font-black text-accent focus:border-accent focus:ring-1 focus:ring-accent/20 outline-none transition-all placeholder:text-muted/50"
                                />
                                <button
                                    onClick={() => setField('quantity', initialSourceItem?.Quantity)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase bg-surface text-muted px-2 py-1 rounded hover:opacity-80 transition-colors"
                                >
                                    Max
                                </button>
                            </div>
                        </div>

                        {/* Separation Line */}
                        <div className="flex items-center gap-4 text-subtle">
                            <div className="h-px flex-1 bg-current" />
                            <ArrowRightLeft size={16} />
                            <div className="h-px flex-1 bg-current" />
                        </div>

                        {/* Warehouse Selector */}
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">Target Warehouse</label>
                            <div className="flex flex-wrap gap-2">
                                {['LUDLOW', 'ATS'].map((wh) => (
                                    <button
                                        key={wh}
                                        type="button"
                                        onClick={() => {
                                            setField('targetWarehouse', wh);
                                            setField('targetLocation', ''); // Clear location on warehouse change
                                        }}
                                        className={`px-4 py-2 rounded-lg font-bold text-xs transition-all border ${formData.targetWarehouse === wh
                                            ? 'bg-accent text-main border-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]'
                                            : 'bg-surface text-muted border-subtle hover:border-muted'
                                            }`}
                                    >
                                        {wh}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Target Location */}
                        <div className="space-y-3">
                            {mergeOpportunity && !formData.targetLocation && (
                                <button
                                    onClick={() => setField('targetLocation', mergeOpportunity)}
                                    className="w-full text-left bg-accent/5 hover:bg-accent/10 border border-accent/20 rounded-xl p-3 flex items-start gap-3 transition-colors group"
                                >
                                    <div className="p-2 bg-accent/10 rounded-lg text-accent">
                                        <AlertTriangle size={16} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-accent group-hover:opacity-80">Merge Opportunity</p>
                                        <p className="text-[10px] text-muted leading-tight mt-0.5">
                                            Item already exists at <strong className="text-content">{mergeOpportunity}</strong> in <strong className="text-content">{formData.targetWarehouse}</strong>. Click to merge.
                                        </p>
                                    </div>
                                </button>
                            )}

                            <AutocompleteInput
                                label="Target Location"
                                value={formData.targetLocation}
                                onChange={(val) => setField('targetLocation', val)}
                                suggestions={suggestions.filter(s => s.value !== initialSourceItem?.Location)} // Exclude current
                                placeholder="Scan or type location..."
                                renderItem={(suggestion) => (
                                    <div className="py-2.5 px-1">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-content">{suggestion.value}</span>
                                                {suggestion.zone && (
                                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-surface border border-subtle ${getZoneColor(suggestion.zone)}`}>
                                                        {suggestion.zone}
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`text-[9px] font-black uppercase ${suggestion.score > 80 ? 'text-green-500' : suggestion.score > 50 ? 'text-yellow-500' : 'text-muted'}`}>
                                                {suggestion.priorityLabel}
                                            </span>
                                        </div>
                                        <CapacityBar current={suggestion.current} max={suggestion.max} showText={false} size="sm" />
                                    </div>
                                )}
                            />
                        </div>


                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-subtle bg-surface/50 rounded-b-2xl">
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid}
                        className="w-full py-4 bg-content hover:opacity-90 disabled:opacity-20 text-main font-black uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 size={20} />
                        Confirm Move
                    </button>
                </div>
            </div>
        </div>
    );
};
