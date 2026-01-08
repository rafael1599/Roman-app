import { useState } from 'react';
import { useInventory } from '../../../hooks/useInventoryData';
import { ArrowRight, Check, X, AlertTriangle, TrendingUp, Clock } from 'lucide-react';

export const OptimizationReportCard = ({ report, onGenerateNew }) => {
    const { moveItem } = useInventory();
    const [applying, setApplying] = useState(null); // ID/Index of applying suggestion
    const [dismissed, setDismissed] = useState([]);

    if (!report) {
        return (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center">
                <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="text-neutral-500" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">No Optimization Reports Yet</h3>
                <p className="text-neutral-400 mb-6 max-w-sm mx-auto">
                    Generate a report to analyze your inventory and get suggestions for better slotting.
                </p>
                <button
                    onClick={onGenerateNew}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-all"
                >
                    Generate Report Now
                </button>
            </div>
        );
    }

    const suggestions = report.suggestions?.items || [];
    const activeSuggestions = suggestions.filter((_, idx) => !dismissed.includes(idx));

    const handleApply = async (suggestion, idx) => {
        if (!suggestion.promote || !suggestion.demote) return;
        setApplying(idx);

        try {
            // Execute the swap!
            // 1. Move LOW velocity item (demote) from HOT to WARM
            await moveItem(
                {
                    SKU: suggestion.demote.sku,
                    Warehouse: suggestion.demote.warehouse,
                    Location: suggestion.demote.location,
                    Location_Detail: ''
                },
                suggestion.promote.warehouse,
                suggestion.promote.location,
                suggestion.demote.quantity // Move all stock of demoted item
            );

            // 2. Move HIGH velocity item (promote) from WARM to HOT
            // Note: In real life this might be partial if occupied, but assumption here is full swap or slot is cleared
            await moveItem(
                {
                    SKU: suggestion.promote.sku,
                    Warehouse: suggestion.promote.warehouse,
                    Location: suggestion.promote.location,
                    Location_Detail: ''
                },
                suggestion.demote.warehouse,
                suggestion.demote.location,
                suggestion.promote.quantity
            );

            // Mark as applied (locally for now, ideally update DB report status)
            setDismissed(prev => [...prev, idx]);
            alert(`✅ Successfully swapped ${suggestion.promote.sku} and ${suggestion.demote.sku}`);

        } catch (err) {
            console.error(err);
            alert("Failed to apply suggestion: " + err.message);
        } finally {
            setApplying(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-2xl p-6">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                            Optimization Report
                        </h2>
                        <div className="flex items-center gap-2 text-blue-400 text-sm font-bold mt-1">
                            <Clock size={14} />
                            <span>Generated: {report.report_date}</span>
                        </div>
                    </div>
                    <button
                        onClick={onGenerateNew}
                        className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg font-bold border border-neutral-700 transition-all"
                    >
                        Regenerate
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                        <div className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-1">Total Suggestions</div>
                        <div className="text-2xl font-black text-white">{suggestions.length}</div>
                    </div>
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                        <div className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-1">Estimated Savings</div>
                        <div className="text-2xl font-black text-green-400">~{suggestions.length * 12} min/week</div>
                    </div>
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                        <div className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-1">Focus Area</div>
                        <div className="text-xl font-black text-blue-400">Velocity Swaps</div>
                    </div>
                </div>
            </div>

            {activeSuggestions.length === 0 ? (
                <div className="text-center py-12 text-neutral-500">
                    <Check size={48} className="mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="font-bold">All caught up! No active suggestions.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {activeSuggestions.map((suggestion, idx) => (
                        <SuggestionItem
                            key={idx}
                            suggestion={suggestion}
                            onApply={() => handleApply(suggestion, idx)}
                            onDismiss={() => setDismissed(prev => [...prev, idx])}
                            isApplying={applying === idx}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const SuggestionItem = ({ suggestion, onApply, onDismiss, isApplying }) => {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 hover:border-blue-500/50 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button
                    onClick={onDismiss}
                    className="bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 p-2 rounded-lg transition-colors"
                    title="Dismiss"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="flex gap-4 items-start">
                <div className="bg-blue-500/10 p-3 rounded-lg text-blue-400 mt-1">
                    <TrendingUp size={24} />
                </div>

                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                            {suggestion.priority} PRIORITY
                        </span>
                        <span className="text-white font-bold text-lg">
                            {suggestion.reason}
                        </span>
                    </div>

                    <p className="text-neutral-400 text-sm mb-4 leading-relaxed">
                        {suggestion.details}
                    </p>

                    {/* Visual Swap Representation */}
                    <div className="bg-black/30 rounded-lg p-3 grid grid-cols-[1fr,auto,1fr] gap-4 items-center mb-4">
                        {/* PROMOTE (Fast Item) */}
                        <div className="text-center">
                            <div className="text-green-400 font-black text-sm mb-1">{suggestion.promote.sku}</div>
                            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Currently</div>
                            <div className="text-white font-bold bg-neutral-800 px-2 py-1 rounded mt-1 inline-block">
                                {suggestion.promote.location}
                            </div>
                            <div className="text-[10px] text-orange-400 mt-1 font-bold">WARM ZONE</div>
                        </div>

                        <div className="text-neutral-600 flex flex-col items-center">
                            <ArrowRight size={20} />
                            <span className="text-[10px] font-bold uppercase mt-1">Swap</span>
                        </div>

                        {/* DEMOTE (Slow Item) */}
                        <div className="text-center">
                            <div className="text-red-400 font-black text-sm mb-1">{suggestion.demote.sku}</div>
                            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Currently</div>
                            <div className="text-white font-bold bg-neutral-800 px-2 py-1 rounded mt-1 inline-block">
                                {suggestion.demote.location}
                            </div>
                            <div className="text-[10px] text-red-500 mt-1 font-bold">HOT ZONE</div>
                        </div>
                    </div>

                    <button
                        onClick={onApply}
                        disabled={isApplying}
                        className={`
                            w-full py-3 rounded-xl font-black text-sm uppercase tracking-wide
                            flex items-center justify-center gap-2
                            ${isApplying
                                ? 'bg-neutral-800 text-neutral-500 cursor-wait'
                                : 'bg-green-600 hover:bg-green-500 text-white shadow-lg hover:shadow-green-500/20'
                            }
                            transition-all
                        `}
                    >
                        {isApplying ? (
                            <>Processing...</>
                        ) : (
                            <>
                                <Check size={18} />
                                {suggestion.action_label}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
