import { useState, useMemo } from 'react';
import { Search, Info, Wand2 } from 'lucide-react';

export const ZoneManagementPanel = ({ locations, zones, getZone, updateZone, autoAssignZones }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterZone, setFilterZone] = useState('ALL');
    const [isAutoAssigning, setIsAutoAssigning] = useState(false);

    const filteredLocations = useMemo(() => {
        let result = locations;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(loc => loc.toLowerCase().includes(lower));
        }

        if (filterZone !== 'ALL') {
            result = result.filter(loc => {
                const [wh, l] = loc.split('-');
                return getZone(wh, l) === filterZone;
            });
        }

        return result;
    }, [locations, searchTerm, filterZone, getZone, zones]); // Re-calc when zones changes

    const handleAutoAssign = async () => {
        if (!confirm("This will overwrite UNASSIGNED zones based on alphabetical order. Continue?")) return;

        setIsAutoAssigning(true);
        try {
            await autoAssignZones();
            // Optional: toast success
        } catch (err) {
            alert("Failed: " + err.message);
        } finally {
            setIsAutoAssigning(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header / Tools */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-end bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
                <div className="w-full md:w-auto flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                        <input
                            type="text"
                            placeholder="Search location..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-black/40 border border-neutral-700 rounded-lg pl-10 pr-4 py-2 text-white focus:border-blue-500 outline-none"
                        />
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <select
                        value={filterZone}
                        onChange={e => setFilterZone(e.target.value)}
                        className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2 text-sm font-bold"
                    >
                        <option value="ALL">All Zones</option>
                        <option value="HOT">🔥 Hot Zone</option>
                        <option value="WARM">☀️ Warm Zone</option>
                        <option value="COLD">❄️ Cold Zone</option>
                    </select>

                    <button
                        onClick={handleAutoAssign}
                        disabled={isAutoAssigning}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 whitespace-nowrap transition-colors"
                    >
                        <Wand2 size={16} />
                        {isAutoAssigning ? 'Working...' : 'Auto-Assign'}
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-neutral-800 bg-black/20 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    <div className="col-span-4">Location</div>
                    <div className="col-span-2">Warehouse</div>
                    <div className="col-span-6 text-right">Assigned Zone</div>
                </div>

                <div className="max-h-[600px] overflow-y-auto">
                    {filteredLocations.map(locKey => {
                        const [wh, loc] = locKey.split('-');
                        const currentZone = getZone(wh, loc);

                        return (
                            <LocationRow
                                key={locKey}
                                warehouse={wh}
                                location={loc}
                                zone={currentZone}
                                onUpdate={(newZone) => updateZone(wh, loc, newZone)}
                            />
                        );
                    })}

                    {filteredLocations.length === 0 && (
                        <div className="p-8 text-center text-neutral-500">
                            No locations found matching your filters.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const LocationRow = ({ warehouse, location, zone, onUpdate }) => {
    const getZoneColor = (z) => {
        switch (z) {
            case 'HOT': return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'WARM': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
            case 'COLD': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            default: return 'bg-neutral-800 text-neutral-400 border-neutral-700';
        }
    };

    return (
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-neutral-800/50 hover:bg-white/5 items-center transition-colors">
            <div className="col-span-4 font-bold text-white font-mono">{location}</div>
            <div className="col-span-2 text-sm text-neutral-400">{warehouse}</div>
            <div className="col-span-6 flex justify-end gap-2">
                {['HOT', 'WARM', 'COLD'].map(z => (
                    <button
                        key={z}
                        onClick={() => onUpdate(z)}
                        className={`
                            text-[10px] font-black uppercase px-3 py-1.5 rounded-md border transition-all
                            ${zone === z
                                ? getZoneColor(z) + ' ring-1 ring-inset ring-white/10'
                                : 'bg-transparent border-transparent text-neutral-600 hover:bg-neutral-800'
                            }
                        `}
                    >
                        {z}
                    </button>
                ))}
            </div>
        </div>
    );
};
