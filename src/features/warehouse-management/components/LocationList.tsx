import { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, Package, ChevronRight } from 'lucide-react';
import { useLocationManagement } from '../../../hooks/useLocationManagement';
import { useInventory } from '../../../hooks/useInventoryData';
import LocationEditorModal from './LocationEditorModal';
import { type Location } from '../../../schemas/location.schema';

/**
 * LocationList - Grid/List of locations with edit capability
 * Displays all locations from the new locations table
 */
export const LocationList = () => {
  const { locations, loading, updateLocation, refresh, deactivateLocation } = useLocationManagement();
  const { ludlowData, atsData } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<Location['warehouse']>('LUDLOW');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Combine inventory data
  const allInventory = useMemo(() => [...ludlowData, ...atsData], [ludlowData, atsData]);

  // Get unique warehouses from locations (only shows warehouses that have locations)
  const warehouses = useMemo(() => {
    const unique = new Set(locations.map((l) => l.warehouse));
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
    return locations.filter((loc) => {
      const matchesSearch =
        loc.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loc.warehouse.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesWarehouse = loc.warehouse === selectedWarehouse;
      return matchesSearch && matchesWarehouse;
    });
  }, [locations, searchTerm, selectedWarehouse]);

  // Get inventory count for a location
  const getInventoryInfo = (loc: Location) => {
    const items = allInventory.filter((item) => {
      if (item.location_id && loc.id) {
        return item.location_id === loc.id;
      }
      return item.warehouse === loc.warehouse && item.location === loc.location;
    });
    const totalQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    return { skuCount: items.length, totalQty };
  };

  const handleSaveLocation = async (formData: any) => {
    if (!selectedLocation) return;
    const result = await updateLocation(selectedLocation.id, formData);
    if (result.success) {
      setSaveSuccess(`${selectedLocation.location} updated successfully`);
      setTimeout(() => setSaveSuccess(null), 3000);
      setSelectedLocation(null);
      refresh();
    }
  };

  const handleDeleteLocation = async (id: string) => {
    const result = await deactivateLocation(id);
    if (result.success) {
      setSelectedLocation(null);
      refresh();
    }
  };

  const getZoneColor = (zone: string | null) => {
    switch (zone) {
      case 'HOT':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'WARM':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'COLD':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-muted animate-pulse">Loading Locations...</div>;
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
      <div className="flex flex-col sm:flex-row gap-3 bg-card border border-subtle p-4 rounded-xl">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search location..."
            className="w-full pl-10 pr-4 py-2 bg-surface border border-subtle rounded-lg text-content placeholder-muted focus:border-accent focus:outline-none"
          />
        </div>

        {/* Warehouse Filter */}
        <div className="flex gap-2">
          {warehouses.map((wh) => (
            <button
              key={wh}
              onClick={() => setSelectedWarehouse(wh)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${selectedWarehouse === wh
                ? 'bg-accent text-main'
                : 'bg-surface text-muted hover:bg-main'
                }`}
            >
              {wh}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="text-xs text-muted">
        Showing {filteredLocations.length} of {locations.length} locations
      </div>

      {/* Locations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredLocations.map((loc) => {
          const invInfo = getInventoryInfo(loc);

          return (
            <button
              key={loc.id}
              onClick={() => setSelectedLocation(loc)}
              className="bg-card border border-subtle rounded-xl p-4 text-left hover:border-accent/50 hover:bg-surface/50 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="text-accent" size={16} />
                    <span className="font-bold text-content">{loc.location}</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">{loc.warehouse}</div>
                </div>
                <ChevronRight
                  className="text-muted group-hover:text-accent transition-colors"
                  size={18}
                />
              </div>

              <div className="flex items-center gap-2 mb-3">
                {/* Zone Badge */}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getZoneColor(loc.zone_type)}`}
                >
                  {loc.zone_type || 'UNASSIGNED'}
                </span>

                {/* Capacity Badge */}
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  {loc.max_capacity} cap
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-muted">
                  <Package size={12} />
                  <span>{invInfo.skuCount} SKUs</span>
                </div>
                <span className="text-muted">{invInfo.totalQty} units</span>
              </div>

              {/* Picking Order */}
              {loc.picking_order !== null && loc.picking_order < 999 && (
                <div className="mt-2 text-[10px] text-muted">
                  Picking order: #{loc.picking_order}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredLocations.length === 0 && (
        <div className="text-center py-12 text-muted">
          No locations found with current filters.
        </div>
      )}

      {/* Edit Modal */}
      {selectedLocation && (
        <LocationEditorModal
          location={selectedLocation}
          onSave={handleSaveLocation}
          onCancel={() => setSelectedLocation(null)}
          onDelete={handleDeleteLocation}
        />
      )}
    </div>
  );
};

export default LocationList;
