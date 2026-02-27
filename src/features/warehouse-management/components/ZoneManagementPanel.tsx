import Search from 'lucide-react/dist/esm/icons/search';
import X from 'lucide-react/dist/esm/icons/x';
import Wand2 from 'lucide-react/dist/esm/icons/wand-2';
import { useState, useMemo, useRef } from 'react';
import { useError } from '../../../context/ErrorContext';
import { useConfirmation } from '../../../context/ConfirmationContext';
import toast from 'react-hot-toast';

interface ZoneManagementProps {
  locations: string[];
  zones: Record<string, string>;
  getZone: (warehouse: string, location: string) => string;
  updateZone: (warehouse: string, location: string, zone: string) => void;
  autoAssignZones: () => Promise<void>;
}

export const ZoneManagementPanel = ({
  locations,
  zones,
  getZone,
  updateZone,
  autoAssignZones,
}: ZoneManagementProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filterZone, setFilterZone] = useState('ALL');
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const { showError } = useError();
  const { showConfirmation } = useConfirmation();

  const filteredLocations = useMemo(() => {
    let result = locations;

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((loc) => loc.toLowerCase().includes(lower));
    }

    if (filterZone !== 'ALL') {
      result = result.filter((loc) => {
        const [wh, l] = loc.split('-');
        return getZone(wh, l) === filterZone;
      });
    }

    return result;
  }, [locations, searchTerm, filterZone, getZone, zones]); // Re-calc when zones changes

  const handleAutoAssign = async () => {
    showConfirmation(
      'Auto-Assign Zones',
      'This will overwrite UNASSIGNED zones based on alphabetical order. Do you want to continue?',
      async () => {
        setIsAutoAssigning(true);
        try {
          await autoAssignZones();
          toast.success('Zones auto-assigned successfully');
        } catch (err: any) {
          showError('Auto-assign failed', err.message || 'Unknown error');
        } finally {
          setIsAutoAssigning(false);
        }
      },
      () => { },
      'Assign zones',
      'Cancel'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header / Tools */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-end bg-card border border-subtle p-4 rounded-xl">
        <div className="w-full md:w-auto flex-1">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              size={18}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-main border border-subtle rounded-lg pl-10 pr-10 py-2 text-content focus:border-accent outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-content transition-colors"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <select
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value)}
            className="bg-surface text-content border border-subtle rounded-lg px-3 py-2 text-sm font-bold"
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
      <div className="bg-card border border-subtle rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-subtle bg-main/20 text-xs font-bold text-muted uppercase tracking-wider">
          <div className="col-span-4">Location</div>
          <div className="col-span-2">Warehouse</div>
          <div className="col-span-6 text-right">Assigned Zone</div>
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {filteredLocations.map((locKey) => {
            const [wh, loc] = locKey.split('-');
            const currentZone = getZone(wh, loc);

            return (
              <LocationRow
                key={locKey}
                warehouse={wh}
                location={loc}
                zone={currentZone}
                onUpdate={(newZone: string) => updateZone(wh, loc, newZone)}
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

interface LocationRowProps {
  warehouse: string;
  location: string;
  zone: string;
  onUpdate: (zone: string) => void;
}

const LocationRow = ({ warehouse, location, zone, onUpdate }: LocationRowProps) => {
  const getZoneColor = (z: string) => {
    switch (z) {
      case 'HOT':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'WARM':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'COLD':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default:
        return 'bg-neutral-800 text-neutral-400 border-neutral-700';
    }
  };

  return (
    <div className="grid grid-cols-12 gap-4 p-4 border-b border-subtle hover:bg-surface items-center transition-colors">
      <div className="col-span-4 font-bold text-content font-mono">{location}</div>
      <div className="col-span-2 text-sm text-muted">{warehouse}</div>
      <div className="col-span-6 flex justify-end gap-2">
        {['HOT', 'WARM', 'COLD'].map((z) => (
          <button
            key={z}
            onClick={() => onUpdate(z)}
            className={`
                            text-[10px] font-black uppercase px-3 py-1.5 rounded-md border transition-all
                            ${zone === z
                ? getZoneColor(z) + ' ring-1 ring-inset ring-content/10'
                : 'bg-transparent border-transparent text-muted hover:bg-surface'
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
