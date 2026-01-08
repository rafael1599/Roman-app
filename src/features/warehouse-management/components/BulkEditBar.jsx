import { memo } from 'react';
import { getZoneStyle, getZoneEmoji } from '../utils/zoneUtils';

/**
 * BulkEditBar - Action bar for bulk zone assignment
 */
export const BulkEditBar = memo(({
    selectedCount,
    onAssignZone,
    onSelectAll,
    onClearSelection
}) => {
    if (selectedCount === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg animate-in slide-in-from-top-2">
            <span className="text-purple-300 text-sm font-bold self-center">
                {selectedCount} selected
            </span>

            <div className="flex gap-1 ml-auto">
                {['COLD', 'WARM', 'HOT'].map(zone => (
                    <button
                        key={zone}
                        onClick={() => onAssignZone(zone)}
                        className={`px-3 py-2 rounded-lg font-bold text-xs uppercase transition-all border ${getZoneStyle(zone)}`}
                    >
                        {getZoneEmoji(zone)} {zone}
                    </button>
                ))}
            </div>

            <button
                onClick={onClearSelection}
                className="px-3 py-2 text-neutral-400 hover:text-white text-xs font-bold transition-colors"
            >
                Clear
            </button>
        </div>
    );
});

BulkEditBar.displayName = 'BulkEditBar';
