import { useState, useEffect, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, Save, X, AlertTriangle, AlertCircle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useInventory } from '../../../hooks/useInventoryData';
import { useOptimizationReports } from '../../../hooks/useOptimizationReports';
import { useError } from '../../../context/ErrorContext';
import { useConfirmation } from '../../../context/ConfirmationContext';
import {
  validateCapacityChange,
  calculateLocationChangeImpact,
} from '../../../utils/locationValidations';
import { DEFAULT_MAX_CAPACITY } from '../../../utils/capacityUtils';
import { useViewMode } from '../../../context/ViewModeContext';
import { useAutoSelect } from '../../../hooks/useAutoSelect';
import { type Location } from '../../../schemas/location.schema';

interface LocationEditorModalProps {
  location: Location;
  onSave: (data: any) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

export default function LocationEditorModal({ location, onSave, onCancel, onDelete }: LocationEditorModalProps) {
  const { ludlowData, atsData } = useInventory();
  const { allReports } = useOptimizationReports();
  const [formData, setFormData] = useState<any>({
    ...location,
    max_capacity: location?.max_capacity ?? DEFAULT_MAX_CAPACITY,
    zone_type: location?.zone_type ?? 'UNASSIGNED',
    picking_order: location?.picking_order ?? 999,
    notes: '',
  });
  const [validation, setValidation] = useState<{ isValid: boolean; errors: string[]; warnings: any[] }>({
    isValid: true,
    errors: [],
    warnings: []
  });
  const [showImpact, setShowImpact] = useState(false);
  const [impact, setImpact] = useState<any>(null);
  const [overrideWarnings, setOverrideWarnings] = useState(false);
  const { showError } = useError();
  const { showConfirmation } = useConfirmation();
  const { setIsNavHidden } = useViewMode();
  const autoSelect = useAutoSelect();

  useEffect(() => {
    setIsNavHidden(true);
    return () => setIsNavHidden(false);
  }, [setIsNavHidden]);

  // Obtener inventario de esta ubicación (Prefer ID match, fallback to name match)
  const inventory = location?.warehouse === 'ATS' ? atsData : ludlowData;
  const locationInventory = inventory.filter((item) => {
    if (item.location_id && location?.id) {
      return item.location_id === location.id;
    }
    return item.Warehouse === location?.warehouse && item.Location === location?.location;
  });

  const hasInventory = locationInventory.length > 0;
  const totalUnits = locationInventory.reduce((sum, i) => sum + (Number(i.Quantity) || 0), 0);
  const hasUnits = totalUnits > 0;

  // Check if inventory is linked by ID (safe to rename) or just by name (legacy/unsafe)
  const isLinkedById = locationInventory.every((item) => item.location_id === location.id);

  const handleCapacityChange = (newCapacity: string) => {
    const capacityInt = parseInt(newCapacity) || 0;
    const newValidation = validateCapacityChange(
      capacityInt,
      locationInventory,
      location?.max_capacity
    );
    setValidation(newValidation);
    setFormData((prev: any) => ({ ...prev, max_capacity: capacityInt }));
  };

  const handleZoneChange = (newZone: string) => {
    setFormData((prev: any) => ({ ...prev, zone_type: newZone }));
  };

  // Effect to calculate the impact of all changes made
  useEffect(() => {
    const changes: any = {};
    if (parseInt(formData.max_capacity as any) !== parseInt(location?.max_capacity as any)) {
      changes.max_capacity = parseInt(formData.max_capacity as any);
    }
    if (formData.zone_type !== location?.zone_type) {
      changes.zone_type = formData.zone_type;
    }
    if (formData.location !== location?.location) {
      changes.location = formData.location;
    }

    const newImpact = calculateLocationChangeImpact(
      location?.warehouse,
      location?.location,
      changes,
      inventory,
      allReports || []
    );

    setImpact(newImpact);

    // Auto-expandir solo la primera vez que se detectan impactos
    if (newImpact.impacts.length > 0 && !showImpact) {
      setShowImpact(true);
    }
  }, [formData, location, inventory, allReports]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const currentValidation = validateCapacityChange(
      formData.max_capacity || 1,
      locationInventory,
      location?.max_capacity
    );

    if (!currentValidation.isValid) {
      setValidation(currentValidation);
      return;
    }

    if (currentValidation.warnings.length > 0 && !overrideWarnings) {
      setValidation(currentValidation);
      return;
    }

    const dataToSave = {
      ...formData,
      invalidateReports:
        impact?.impacts.find((i: any) => i.type === 'REPORTS_INVALIDATED')?.reportIds || [],
    };

    onSave(dataToSave);
  };

  const handleDeleteClick = () => {
    if (hasUnits) {
      showError(
        'Cannot delete location',
        `You cannot delete a location with active inventory (${totalUnits} units). You must move the products first.`
      );
      return;
    }

    const confirmMessage = hasInventory
      ? `This location has ${locationInventory.length} SKU(s) registered (0 units). Are you sure you want to delete it?`
      : `Are you sure you want to delete the location ${location?.location}?`;

    showConfirmation(
      'Delete Location',
      confirmMessage,
      () => {
        if (onDelete) onDelete(location.id);
      },
      undefined,
      'Delete'
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-surface border border-subtle rounded-3xl w-full max-w-md shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-subtle bg-main/50 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black text-content uppercase tracking-tight flex items-center gap-2">
              <Edit3 size={20} className="text-accent" />
              Location Settings
            </h2>
            <p className="text-[10px] items-center gap-1.5 font-bold uppercase tracking-widest text-muted mt-1 flex">
              Zone: <span className="text-content">{location?.zone_type || 'None'}</span>
              <span className="w-1 h-1 rounded-full bg-subtle" />
              Bin: <span className="text-accent">{location?.location}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                onClick={handleDeleteClick}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete location"
              >
                <Trash2 size={24} />
              </button>
            )}
            <button onClick={onCancel} className="text-muted hover:text-content p-2">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Errores Críticos */}
        {validation.errors.length > 0 && (
          <div className="mx-6 mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-3 mb-2">
              <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-red-300 font-semibold text-sm">Errors that must be corrected</p>
              </div>
            </div>
            <ul className="ml-8 space-y-1">
              {validation.errors.map((error, idx) => (
                <li key={idx} className="text-red-400/80 text-xs">
                  • {error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings con Override */}
        {validation.warnings.length > 0 && (
          <div className="mx-6 mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-yellow-300 font-semibold text-sm">Warnings</p>
                <p className="text-yellow-400/60 text-xs mt-1">You can proceed at your own risk</p>
              </div>
            </div>

            {validation.warnings.map((warning, idx) => (
              <div key={idx} className="ml-8 mb-3 last:mb-0">
                <p className="text-yellow-400 text-sm font-medium">{warning.message}</p>
                <p className="text-yellow-400/60 text-xs mt-1">💡 {warning.recommendation}</p>
              </div>
            ))}

            <label className="ml-8 mt-4 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overrideWarnings}
                onChange={(e) => setOverrideWarnings(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-yellow-500/50 bg-yellow-500/10 focus:ring-yellow-500/50"
              />
              <span className="text-yellow-300/90 text-xs">
                I understand the risks and wish to continue anyway
              </span>
            </label>
          </div>
        )}

        {/* Análisis de Impacto (Colapsable) */}
        {impact && impact.impacts.length > 0 && (
          <div className="mx-6 mt-6 border border-subtle rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowImpact(!showImpact)}
              className="w-full p-4 bg-accent/10 hover:bg-accent/15 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="text-accent" size={20} />
                <div className="text-left">
                  <p className="text-accent font-semibold text-sm">
                    Impact Analysis ({impact.impacts.length})
                  </p>
                  <p className="text-muted text-xs">
                    {impact.affectedSKUs} SKU(s) affected • {impact.totalUnits} units
                  </p>
                </div>
              </div>
              {showImpact ? (
                <ChevronUp className="text-accent" size={18} />
              ) : (
                <ChevronDown className="text-accent" size={18} />
              )}
            </button>

            {showImpact && (
              <div className="p-4 bg-accent/5 space-y-3">
                {impact.impacts.map((impactItem: any, idx: number) => (
                  <div key={idx} className="bg-surface rounded-lg p-3">
                    <p className="text-content font-semibold text-sm mb-2">{impactItem.message}</p>
                    <ul className="space-y-1">
                      {impactItem.details.map((detail: string, detailIdx: number) => (
                        <li key={detailIdx} className="text-muted text-xs ml-4">
                          • {detail}
                        </li>
                      ))}
                    </ul>

                    {impactItem.type === 'REPORTS_INVALIDATED' && (
                      <div className="mt-2 p-2 bg-orange-500/10 border border-orange-500/20 rounded">
                        <p className="text-orange-300 text-xs font-semibold">
                          ⚠️ These reports will be automatically marked as obsolete
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info si tiene inventario */}
        {hasInventory && !impact && (
          <div className="mx-6 mt-6 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg flex items-start gap-3">
            <AlertTriangle className="text-gray-400 flex-shrink-0 mt-0.5" size={16} />
            <p className="text-gray-400 text-xs">
              This location has {locationInventory.length} SKU(s) with {totalUnits} total units
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-semibold text-muted mb-2">Location Name</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, location: e.target.value }))}
              {...autoSelect}
              className="w-full px-4 py-3 bg-main border border-subtle rounded-lg text-content focus:border-accent focus:outline-none transition-colors"
              placeholder="e.g. A-01-01"
            />
            {hasInventory && !isLinkedById && formData.location !== location.location && (
              <p className="text-orange-400 text-xs mt-2 flex items-center gap-1">
                <AlertTriangle size={12} />
                Warning: Inventory is linked by name (Legacy). Renaming will decouple it.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-muted mb-2">
              Max Capacity (units)
            </label>
            <input
              type="number"
              value={formData.max_capacity || ''}
              onChange={(e) => handleCapacityChange(e.target.value)}
              {...autoSelect}
              className={`w-full px-4 py-3 bg-main border rounded-lg text-content focus:outline-none transition-colors ${validation.errors.length > 0
                ? 'border-red-500 focus:border-red-400'
                : validation.warnings.length > 0
                  ? 'border-yellow-500 focus:border-yellow-400'
                  : 'border-subtle focus:border-accent'
                }`}
              min="1"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-muted mb-2">Zone</label>
            <div className="flex flex-wrap gap-2">
              {['HOT', 'WARM', 'COLD', 'UNASSIGNED'].map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => handleZoneChange(zone)}
                  className={`px-4 py-2 rounded-lg font-bold text-xs transition-all border ${formData.zone_type === zone
                    ? 'bg-accent text-main border-accent'
                    : 'bg-surface text-muted border-subtle hover:border-muted'
                    }`}
                >
                  {zone}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-muted mb-2">
              Picking Order
              <span className="text-xs text-muted ml-2">(lower = higher priority)</span>
            </label>
            <input
              type="number"
              value={formData.picking_order || ''}
              onChange={(e) =>
                setFormData((prev: any) => ({
                  ...prev,
                  picking_order: parseInt(e.target.value) || 0,
                }))
              }
              {...autoSelect}
              className="w-full px-4 py-3 bg-main border border-subtle rounded-lg text-content focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-muted mb-2">Notes (optional)</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
              className="w-full px-4 py-3 bg-main border border-subtle rounded-lg text-content focus:border-accent focus:outline-none transition-colors resize-none"
              rows={3}
              placeholder="Additional information about this location..."
            />
          </div>
        </form>

        <div className="p-6 border-t border-subtle bg-main/50 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-4 bg-surface hover:opacity-80 text-muted font-black uppercase tracking-widest text-xs rounded-2xl transition-colors border border-subtle"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              validation.errors.length > 0 || (validation.warnings.length > 0 && !overrideWarnings)
            }
            className={`flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 ${validation.errors.length > 0
              ? 'bg-surface text-muted cursor-not-allowed border border-subtle'
              : validation.warnings.length > 0 && !overrideWarnings
                ? 'bg-surface text-muted cursor-not-allowed border border-subtle'
                : 'bg-accent hover:opacity-90 text-main shadow-lg shadow-accent/20'
              }`}
          >
            <Save size={20} />
            {validation.warnings.length > 0 && !overrideWarnings ? 'Confirm Risks' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
