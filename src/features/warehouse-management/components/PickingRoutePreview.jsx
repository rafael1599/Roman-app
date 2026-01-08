import { memo } from 'react';
import { ChevronDown, ChevronUp, Route } from 'lucide-react';
import { getZoneStyle, parseLocationKey } from '../utils/zoneUtils';

/**
 * PickingRoutePreview - Collapsible preview of the calculated picking route
 */
export const PickingRoutePreview = memo(({
    route,
    getZone,
    isExpanded,
    onToggle
}) => {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Route className="text-green-500" size={20} />
                    <span className="text-white font-bold text-sm uppercase tracking-wider">
                        Picking Route Preview
                    </span>
                    <span className="text-neutral-500 text-xs">
                        ({route.length} stops)
                    </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                        {isExpanded ? 'Close Editor' : 'Open Editor'}
                    </span>
                    {isExpanded ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
                </div>
            </button>

            <div className="p-4 pt-0">
                <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto scrollbar-hide py-1">
                    {route.map((locKey, index) => {
                        const { warehouse, location } = parseLocationKey(locKey);
                        const zone = getZone(warehouse, location);

                        return (
                            <div key={locKey} className="flex items-center gap-1.5 animate-in fade-in zoom-in duration-300">
                                <span className={`px-2 py-1 rounded text-[10px] font-mono font-bold border ${getZoneStyle(zone)} shadow-sm`}>
                                    {index + 1}. {location}
                                </span>
                                {index < route.length - 1 && (
                                    <span className="text-neutral-700 text-[10px]">→</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Dynamic & Helpful Extraction Explanation */}
                <div className="mt-4 pt-3 border-t border-neutral-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="flex -space-x-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-neutral-900"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-400 border border-neutral-900 opacity-50"></div>
                            </div>
                            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">Start: Back</span>
                        </div>
                        <div className="text-neutral-700">→</div>
                        <div className="flex items-center gap-2">
                            <div className="flex -space-x-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-400 border border-neutral-900 opacity-50"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-red-600 border border-neutral-900"></div>
                            </div>
                            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">End: Shipping</span>
                        </div>
                    </div>

                    <p className="text-[10px] text-neutral-500 max-w-[400px] leading-relaxed italic">
                        "Route is calculated to **minimize steps** by picking from the farthest points
                        first, ensuring you finish right at the shipping station."
                    </p>
                </div>
            </div>
        </div>
    );
});

PickingRoutePreview.displayName = 'PickingRoutePreview';
