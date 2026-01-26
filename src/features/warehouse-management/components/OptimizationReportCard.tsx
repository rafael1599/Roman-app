import { useState } from 'react';
import { useInventory } from '../../../hooks/useInventoryData';
import { ArrowRight, Check, X, TrendingUp, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useError } from '../../../context/ErrorContext';

interface Suggestion {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  details: string;
  action_label: string;
  promote: {
    sku: string;
    warehouse: string;
    location: string;
    quantity: number;
  };
  demote: {
    sku: string;
    warehouse: string;
    location: string;
    quantity: number;
  };
}

interface Report {
  id: string;
  report_date: string;
  suggestions: {
    items: Suggestion[];
  };
}

interface OptimizationReportCardProps {
  report: Report | null;
  onGenerateNew: () => void;
}

export const OptimizationReportCard = ({ report, onGenerateNew }: OptimizationReportCardProps) => {
  const { moveItem } = useInventory();
  const { showError } = useError();
  const [applying, setApplying] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);

  if (!report) {
    return (
      <div className="bg-card border border-subtle rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="text-muted" size={32} />
        </div>
        <h3 className="text-xl font-bold text-content mb-2">No Optimization Reports Yet</h3>
        <p className="text-muted mb-6 max-w-sm mx-auto">
          Generate a report to analyze your inventory and get suggestions for better slotting.
        </p>
        <button
          onClick={onGenerateNew}
          className="bg-accent hover:opacity-90 text-main font-bold py-3 px-6 rounded-xl transition-all"
        >
          Generate Report Now
        </button>
      </div>
    );
  }

  const suggestions = report.suggestions?.items || [];
  const activeSuggestions = suggestions.filter((_, idx) => !dismissed.includes(idx));

  const handleApply = async (suggestion: Suggestion, idx: number) => {
    if (!suggestion.promote || !suggestion.demote) return;
    setApplying(idx);

    try {
      // Execute the swap!
      // 1. Move LOW velocity item (demote) from HOT to WARM
      await moveItem(
        {
          SKU: suggestion.demote.sku,
          Warehouse: suggestion.demote.warehouse.toUpperCase() as any,
          Location: suggestion.demote.location,
        } as any,
        suggestion.promote.warehouse.toUpperCase() as any,
        suggestion.promote.location,
        suggestion.demote.quantity
      );

      // 2. Move HIGH velocity item (promote) from WARM to HOT
      await moveItem(
        {
          SKU: suggestion.promote.sku,
          Warehouse: suggestion.promote.warehouse.toUpperCase() as any,
          Location: suggestion.promote.location,
        } as any,
        suggestion.demote.warehouse.toUpperCase() as any,
        suggestion.demote.location,
        suggestion.promote.quantity
      );

      setDismissed((prev) => [...prev, idx]);
      toast.success(
        `✅ Successfully swapped ${suggestion.promote.sku} and ${suggestion.demote.sku}`
      );
    } catch (err: any) {
      console.error(err);
      showError('Failed to apply suggestion', err.message);
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-accent/5 border border-accent/20 rounded-2xl p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-black text-content uppercase tracking-tight">
              Optimization Report
            </h2>
            <div className="flex items-center gap-2 text-accent text-sm font-bold mt-1">
              <Clock size={14} />
              <span>Generated: {report.report_date}</span>
            </div>
          </div>
          <button
            onClick={onGenerateNew}
            className="text-xs bg-surface hover:opacity-80 text-content px-3 py-1.5 rounded-lg font-bold border border-subtle transition-all"
          >
            Regenerate
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
          <div className="bg-main/20 rounded-xl p-4 border border-subtle">
            <div className="text-muted text-xs font-bold uppercase tracking-wider mb-1">
              Total Suggestions
            </div>
            <div className="text-2xl font-black text-content">{suggestions.length}</div>
          </div>
          <div className="bg-main/20 rounded-xl p-4 border border-subtle">
            <div className="text-muted text-xs font-bold uppercase tracking-wider mb-1">
              Estimated Savings
            </div>
            <div className="text-2xl font-black text-green-500">
              ~{suggestions.length * 12} min/week
            </div>
          </div>
          <div className="bg-main/20 rounded-xl p-4 border border-subtle">
            <div className="text-muted text-xs font-bold uppercase tracking-wider mb-1">
              Focus Area
            </div>
            <div className="text-xl font-black text-accent">Velocity Swaps</div>
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
              onDismiss={() => setDismissed((prev) => [...prev, idx])}
              isApplying={applying === idx}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface SuggestionItemProps {
  suggestion: Suggestion;
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
}

const SuggestionItem = ({ suggestion, onApply, onDismiss, isApplying }: SuggestionItemProps) => {
  return (
    <div className="bg-card border border-subtle rounded-xl p-5 hover:border-accent/50 transition-all group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
        <button
          onClick={onDismiss}
          className="bg-surface hover:bg-red-500/20 text-muted hover:text-red-500 p-2 rounded-lg transition-colors"
          title="Dismiss"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex gap-4 items-start">
        <div className="bg-accent/10 p-3 rounded-lg text-accent mt-1">
          <TrendingUp size={24} />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-accent/20 text-accent text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
              {suggestion.priority} PRIORITY
            </span>
            <span className="text-content font-bold text-lg">{suggestion.reason}</span>
          </div>

          <p className="text-muted text-sm mb-4 leading-relaxed">{suggestion.details}</p>

          <div className="bg-main/30 rounded-lg p-3 grid grid-cols-[1fr,auto,1fr] gap-4 items-center mb-4">
            <div className="text-center">
              <div className="text-green-500 font-black text-sm mb-1">{suggestion.promote.sku}</div>
              <div className="text-[10px] text-muted font-bold uppercase tracking-wider">
                Currently
              </div>
              <div className="text-content font-bold bg-surface px-2 py-1 rounded mt-1 inline-block">
                {suggestion.promote.location}
              </div>
              <div className="text-[10px] text-orange-500 mt-1 font-bold">WARM ZONE</div>
            </div>

            <div className="text-muted flex flex-col items-center">
              <ArrowRight size={20} />
              <span className="text-[10px] font-bold uppercase mt-1">Swap</span>
            </div>

            <div className="text-center">
              <div className="text-red-500 font-black text-sm mb-1">{suggestion.demote.sku}</div>
              <div className="text-[10px] text-muted font-bold uppercase tracking-wider">
                Currently
              </div>
              <div className="text-content font-bold bg-surface px-2 py-1 rounded mt-1 inline-block">
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
                ? 'bg-surface text-muted cursor-wait'
                : 'bg-accent hover:opacity-90 text-main shadow-lg shadow-accent/20'
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
