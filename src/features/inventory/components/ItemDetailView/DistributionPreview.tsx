import React from 'react';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import {
  type DistributionItem,
  STORAGE_TYPE_LABELS,
} from '../../../../schemas/inventory.schema.ts';

interface DistributionPreviewProps {
  distribution: DistributionItem[];
  quantity: number;
  onTap: () => void;
}

/**
 * Compact summary of distribution. Shows abbreviations like "2T 3L 1 unassigned".
 * Tap opens the full editor sheet.
 */
export const DistributionPreview: React.FC<DistributionPreviewProps> = ({
  distribution,
  quantity,
  onTap,
}) => {
  const total = distribution.reduce((sum, d) => sum + d.count * d.units_each, 0);
  const unassigned = Math.max(0, quantity - total);
  const isOver = total > quantity;

  // Build summary tokens: "2T 3L 1P"
  const tokens = distribution.map((d) => {
    const label = STORAGE_TYPE_LABELS[d.type]?.short || d.type[0];
    const units = d.count * d.units_each;
    return `${units}${label}`;
  });

  const hasDistribution = distribution.length > 0;

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full text-left px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
          Distribution
        </span>
        <ChevronRight size={16} className="text-muted/40 shrink-0" />
      </div>
      {hasDistribution ? (
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-sm text-content font-mono font-bold">{tokens.join('  ')}</span>
          {unassigned > 0 && !isOver && (
            <span className="text-xs text-amber-400 font-bold">{unassigned} unassigned</span>
          )}
          {isOver && (
            <span className="text-xs text-red-400 font-bold">{total - quantity} over</span>
          )}
          {!isOver && unassigned === 0 && (
            <span className="text-xs text-green-400 font-bold">Exact</span>
          )}
        </div>
      ) : (
        <span className="text-sm text-muted/40 italic mt-1 block">No distribution set</span>
      )}
    </button>
  );
};
