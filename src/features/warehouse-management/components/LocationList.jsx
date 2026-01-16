import { useState, useMemo, useEffect } from 'react';
import { Edit3, Search, MapPin, Package, ChevronRight } from 'lucide-react';
import { useLocationManagement } from '../../../hooks/useLocationManagement';
import { useInventory } from '../../../hooks/useInventoryData';
import LocationEditorModal from './LocationEditorModal';

/**
 * LocationList - Grid/List of locations with edit capability
 * Displays all locations from the new locations table
 */
export const LocationList = () => {
    const { locations, loading, updateLocation, refresh } = useLocationManagement();
    const { ludlowData, atsData } = useInventory();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedWarehouse, setSelectedWarehouse] = useState('LUDLOW');
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(null);

    // Combine inventory data
    const allInventory = useMemo(() => [...ludlowData, ...atsData], [ludlowData, atsData]);

    // Get unique warehouses from locations (only shows warehouses that have locations)
    const warehouses = useMemo(() => {
        const unique = new Set(locations.map(l => l.warehouse));
        return Array.from(unique).sort();
    }, [locations]);

    // Update selected warehouse if it no longer exists in the list or on initial load
    useEffect(() => {
        if (warehouses.length > 0) {
            if (!warehouses.includes(selectedWarehouse)) {
                // If current selection doesn't exist, default to LUDLOW or first available
                setSelectedWarehouse(warehouses.includes('LUDLOW') ? 'LUDLOW' : warehouses[0]);
            }
        }
    }, [warehouses, selectedWarehouse]);

    // Filter locations
    const filteredLocations = useMemo(() => {
        return locations.filter(loc => {
            const matchesSearch = loc.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                loc.warehouse.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesWarehouse = loc.warehouse === selectedWarehouse;
            return matchesSearch && matchesWarehouse;
        });
    }, [locations, searchTerm, selectedWarehouse]);

    // Get inventory count for a location
    const getInventoryInfo = (loc) => {
        const items = allInventory.filter(item => {
            if (item.location_id && loc.id) {
                return item.location_id === loc.id;
            }
            return item.Warehouse === loc.warehouse && item.Location === loc.location;
        });
        const totalQty = items.reduce((sum, item) => sum + (item.Quantity || 0), 0);
        return { skuCount: items.length, totalQty };
    };

    const handleSaveLocation = async (formData) => {
        const result = await updateLocation(selectedLocation.id, formData);
        if (result.success) {
            setSaveSuccess(`${selectedLocation.location} actualizado correctamente`);
            setTimeout(() => setSaveSuccess(null), 3000);
            setSelectedLocation(null);
            refresh();
        }
    };

    const getZoneColor = (zone) => {
        switch (zone) {
            case 'HOT': return 'bg-red-500/20 text-red-400 border-red-500/30';
            case 'WARM': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            case 'COLD': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    if (loading) {
        return <div className="p-12 text-center text-neutral-500 animate-pulse">Loading Locations...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Success Message */}
            {saveSuccess && (
                <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium animate-in fade-in duration-300">
                    ✅ {saveSuccess}
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar ubicación..."
                        className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
                    />
                </div>

                {/* Warehouse Filter */}
                <div className="flex gap-2">
                    {warehouses.map(wh => (
                        <button
                            key={wh}
                            onClick={() => setSelectedWarehouse(wh)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${selectedWarehouse === wh
                                ? 'bg-blue-500 text-black'
                                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                                }`}
                        >
                            {wh}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div className="text-xs text-neutral-500">
                Mostrando {filteredLocations.length} de {locations.length} ubicaciones
            </div>

            {/* Locations Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredLocations.map(loc => {
                    const invInfo = getInventoryInfo(loc);

                    return (
                        <button
                            key={loc.id}
                            onClick={() => setSelectedLocation(loc)}
                            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-left hover:border-blue-500/50 hover:bg-neutral-800/50 transition-all group"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <MapPin className="text-blue-400" size={16} />
                                        <span className="font-bold text-white">{loc.location}</span>
                                    </div>
                                    <div className="text-xs text-neutral-500 mt-0.5">{loc.warehouse}</div>
                                </div>
                                <ChevronRight className="text-neutral-600 group-hover:text-blue-400 transition-colors" size={18} />
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                                {/* Zone Badge */}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getZoneColor(loc.zone)}`}>
                                    {loc.zone || 'UNASSIGNED'}
                                </span>

                                {/* Capacity Badge */}
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                    {loc.max_capacity} cap
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1 text-neutral-400">
                                    <Package size={12} />
                                    <span>{invInfo.skuCount} SKUs</span>
                                </div>
                                <span className="text-neutral-500">{invInfo.totalQty} units</span>
                            </div>

                            {/* Picking Order */}
                            {loc.picking_order && loc.picking_order < 999 && (
                                <div className="mt-2 text-[10px] text-neutral-500">
                                    Orden de picking: #{loc.picking_order}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Empty State */}
            {filteredLocations.length === 0 && (
                <div className="text-center py-12 text-neutral-500">
                    No se encontraron ubicaciones con los filtros actuales.
                </div>
            )}

            {/* Edit Modal */}
            {selectedLocation && (
                <LocationEditorModal
                    location={selectedLocation}
                    onSave={handleSaveLocation}
                    onCancel={() => setSelectedLocation(null)}
                />
            )}
        </div>
    );
};

export default LocationList;
