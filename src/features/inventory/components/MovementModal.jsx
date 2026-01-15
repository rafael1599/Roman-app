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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-5 border-b border-neutral-800 flex items-start justify-between bg-neutral-900/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-tighter">
                            <ArrowRightLeft className="text-blue-500" size={24} />
                            Relocate Stock
                        </h2>
                        {skuVelocity !== null && (
                            <div className="flex items-center gap-2 mt-2">
                                <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] uppercase font-black px-2 py-0.5 rounded flex items-center gap-1">
                                    <Zap size={10} />
                                    {skuVelocity.toFixed(1)} picks/day
                                </span>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Source Info Card */}
                    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4 flex justify-between items-center group relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                        <div>
                            <h3 className="text-lg font-black text-white flex gap-2">
                                <span className="text-neutral-500 font-bold uppercase tracking-widest text-[10px] self-center">Moving</span>
                                {initialSourceItem?.SKU}
                            </h3>
                            <p className="text-xs text-neutral-400 font-medium mt-0.5">
                                From: <span className="text-white font-bold">{initialSourceItem?.Location}</span> • {initialSourceItem?.Warehouse}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-black text-white">{initialSourceItem?.Quantity}</p>
                            <p className="text-[9px] text-neutral-500 uppercase font-black tracking-widest">Available</p>
                        </div>
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-5">
                        {/* Quantity */}
                        <div>
                            <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-2">Quantity to Move</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={formData.quantity}
                                    onChange={(e) => setField('quantity', Math.min(initialSourceItem?.Quantity || 0, parseInt(e.target.value) || 0))}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-4 px-4 text-center text-3xl font-black text-green-500 focus:border-green-500 focus:ring-1 focus:ring-green-500/20 outline-none transition-all"
                                />
                                <button
                                    onClick={() => setField('quantity', initialSourceItem?.Quantity)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase bg-neutral-800 text-neutral-400 px-2 py-1 rounded hover:bg-neutral-700 hover:text-white transition-colors"
                                >
                                    Max
                                </button>
                            </div>
                        </div>

                        {/* Separation Line */}
                        <div className="flex items-center gap-4 text-neutral-800">
                            <div className="h-px flex-1 bg-current" />
                            <ArrowRightLeft size={16} />
                            <div className="h-px flex-1 bg-current" />
                        </div>

                        {/* Warehouse Selector */}
                        <div>
                            <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-2">Target Warehouse</label>
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
                                            ? 'bg-green-500 text-black border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                            : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-500'
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
                                    className="w-full text-left bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-start gap-3 transition-colors group"
                                >
                                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                                        <AlertTriangle size={16} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-blue-300 group-hover:text-blue-200">Merge Opportunity</p>
                                        <p className="text-[10px] text-blue-400/60 leading-tight mt-0.5">
                                            Item already exists at <strong className="text-blue-300">{mergeOpportunity}</strong> in <strong className="text-blue-300">{formData.targetWarehouse}</strong>. Click to merge.
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
                                                <span className="font-black text-white">{suggestion.value}</span>
                                                {suggestion.zone && (
                                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white/5 ${getZoneColor(suggestion.zone)}`}>
                                                        {suggestion.zone}
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`text-[9px] font-black uppercase ${suggestion.score > 80 ? 'text-green-400' : suggestion.score > 50 ? 'text-yellow-400' : 'text-neutral-500'}`}>
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
                <div className="p-5 border-t border-neutral-800 bg-neutral-900/50 rounded-b-2xl">
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid}
                        className="w-full py-4 bg-white hover:bg-neutral-200 disabled:opacity-20 disabled:hover:bg-white text-black font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-white/5 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 size={20} />
                        Confirm Move
                    </button>
                </div>
            </div>
        </div>
    );
};
