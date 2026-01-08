import { memo } from 'react';
import { Search, CheckSquare, Square, Wand2 } from 'lucide-react';

/**
 * ZoneFilterBar - Search, zone filter, and action buttons
 */
export const ZoneFilterBar = memo(({
    searchTerm,
    onSearchChange,
    filterZone,
    onZoneFilterChange,
    editMode,
    onToggleEditMode,
    onAutoAssign,
    isAutoAssigning
}) => {
    return (
        <div className="space-y-3">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                <input
                    type="text"
                    placeholder="Search location..."
                    value={searchTerm}
                    onChange={e => onSearchChange(e.target.value)}
                    className="w-full bg-black/40 border border-neutral-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 outline-none"
                />
            </div>

            {/* Filter & Actions Row */}
            <div className="flex flex-wrap gap-2">
                <select
                    value={filterZone}
                    onChange={e => onZoneFilterChange(e.target.value)}
                    className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2.5 text-sm font-bold flex-1 min-w-[120px]"
                >
                    <option value="ALL">All Zones</option>
                    <option value="HOT">🔥 Hot</option>
                    <option value="WARM">☀️ Warm</option>
                    <option value="COLD">❄️ Cold</option>
                </select>

                <button
                    onClick={onToggleEditMode}
                    className={`px-4 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${editMode
                            ? 'bg-purple-500 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                >
                    {editMode ? <CheckSquare size={16} /> : <Square size={16} />}
                    {editMode ? 'Exit' : 'Bulk'}
                </button>

                <button
                    onClick={onAutoAssign}
                    disabled={isAutoAssigning}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                    <Wand2 size={16} />
                    {isAutoAssigning ? '...' : 'Auto'}
                </button>
            </div>
        </div>
    );
});

ZoneFilterBar.displayName = 'ZoneFilterBar';
