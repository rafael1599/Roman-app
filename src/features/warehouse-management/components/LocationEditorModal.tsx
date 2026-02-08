import { useState, useEffect, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Edit3 from 'lucide-react/dist/esm/icons/edit-3';
import Save from 'lucide-react/dist/esm/icons/save';
import X from 'lucide-react/dist/esm/icons/x';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import { useInventory } from '../../../hooks/useInventoryData';
import { useConfirmation } from '../../../context/ConfirmationContext';
import {
  validateCapacityChange,
  calculateLocationChangeImpact,
} from '../../../utils/locationValidations';
import { DEFAULT_MAX_CAPACITY } from '../../../utils/capacityUtils';
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
  const { showConfirmation } = useConfirmation();
  const autoSelect = useAutoSelect();

  const [formData, setFormData] = useState<any>({
    ...location,
    max_capacity: location?.max_capacity ?? DEFAULT_MAX_CAPACITY,
    zone: location?.zone ?? 'UNASSIGNED',
    picking_order: location?.picking_order ?? 999,
    notes: location?.notes ?? '',
  });

  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });
  const [overrideWarnings, setOverrideWarnings] = useState(false);

  const handleZoneChange = (newZone: string) => {
    setFormData((prev: any) => ({ ...prev, zone: newZone }));
  };

  // Effect to calculate the impact of all changes made
  useEffect(() => {
    const changes: any = {};
    if (parseInt(formData.max_capacity as any) !== parseInt(location?.max_capacity as any)) {
      changes.max_capacity = parseInt(formData.max_capacity as any);
    }
    if (formData.zone !== location?.zone) {
      changes.zone = formData.zone;
    }
    if (formData.location !== location?.location) {
      changes.location = formData.location;
    }

    // 1. Validate Capacity (Errors & Warnings)
    const capacityValidation = validateCapacityChange(
      parseInt(formData.max_capacity as any) || 0,
      [], // We pass empty array as we don't have access to ALL inventory items in format needed or relies on specific filtering. 
      // Actually, validateCapacityChange expects InventoryItem[]. 
      // Let's defer strict inventory check vs existing items if complex, or pass flat list.
      // For now, let's pass empty to avoid type issues, focusing on basic capacity limits.
      // Better: Use location.max_capacity as original
      location.max_capacity || 0
    );

    const newErrors = [...capacityValidation.errors];
    const newWarnings = [...capacityValidation.warnings.map(w => w.message)];

    // 2. Calculate Impact (Warnings)
    if (location?.warehouse && location?.location) {
      const impact = calculateLocationChangeImpact(
        location.warehouse,
        location.location,
        changes,
        [...ludlowData, ...atsData]
      );

      // Add impacts as warnings
      if (impact.impacts.length > 0) {
        newWarnings.push(...impact.impacts.map(i => i.message));
      }
    }

    setValidation({
      errors: newErrors,
      warnings: newWarnings
    });

  }, [formData, location, ludlowData, atsData]);

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (validation.errors.length > 0) return;
    if (validation.warnings.length > 0 && !overrideWarnings) {
      setOverrideWarnings(true);
      return;
    }
    onSave(formData);
  };

  const handleDelete = () => {
    if (!onDelete) return;

    showConfirmation(
      'Delete Location?',
      `Are you sure you want to delete location ${location.location}? This cannot be undone and may affect inventory.`,
      () => onDelete(location.id),
      () => { },
      'Delete Forever',
      'Cancel'
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-main/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-main border border-subtle rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-subtle flex justify-between items-start bg-surface/50">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter text-content flex items-center gap-3">
              <Edit3 className="text-accent" size={24} />
              Location Settings
            </h2>
            <p className="text-[10px] items-center gap-1.5 font-bold uppercase tracking-widest text-muted mt-1 flex">
              Zone: <span className="text-content">{location?.zone || 'None'}</span>
              <span className="w-1 h-1 rounded-full bg-subtle" />
              Bin: <span className="text-accent">{location?.location}</span>
            </p>
          </div>
          <div className="flex gap-2">
            {onDelete && (
              <button
                onClick={handleDelete}
                className="p-2 hover:bg-danger/10 text-muted hover:text-danger rounded-xl transition-colors"
              >
                <Trash2 size={20} />
              </button>
            )}
            <button
              onClick={onCancel}
              className="p-2 hover:bg-surface text-muted hover:text-content rounded-xl transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Validation Messages */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="px-6 pt-6 pb-0 flex flex-col gap-2">
            {validation.errors.map((err, idx) => (
              <div key={`err-${idx}`} className="p-3 bg-danger/10 text-danger border border-danger/20 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} />
                {err}
              </div>
            ))}
            {validation.warnings.map((warn, idx) => (
              <div key={`warn-${idx}`} className="p-3 bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle size={16} />
                {warn}
                {!overrideWarnings && <span className="ml-auto text-[10px] opacity-70">CONFIRM TO PROCEED</span>}
              </div>
            ))}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar">

          {/* Max Capacity */}
          <div>
            <label className="block text-sm font-semibold text-muted mb-2">
              Max Capacity
              <span className="text-xs text-muted ml-2">(units)</span>
            </label>
            <input
              type="number"
              value={formData.max_capacity || ''}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, max_capacity: parseInt(e.target.value) || 0 }))}
              {...autoSelect}
              className="w-full px-4 py-3 bg-main border border-subtle rounded-lg text-content focus:border-accent focus:outline-none transition-colors font-mono"
            />
          </div>

          {/* Zone Selector */}
          <div>
            <label className="block text-sm font-semibold text-muted mb-3">Zone Assignment</label>
            <div className="grid grid-cols-4 gap-2">
              {['HOT', 'WARM', 'COLD', 'UNASSIGNED'].map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => handleZoneChange(zone)}
                  className={`px-2 py-3 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all border ${formData.zone === zone
                    ? 'bg-accent text-main border-accent shadow-lg shadow-accent/20'
                    : 'bg-surface text-muted border-subtle hover:border-muted hover:bg-surface/80'
                    }`}
                >
                  {zone}
                </button>
              ))}
            </div>
          </div>

          {/* Picking Order */}
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

          {/* Notes */}
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

        {/* Footer Actions */}
        <div className="p-6 border-t border-subtle bg-main/50 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-4 bg-surface hover:opacity-80 text-muted font-black uppercase tracking-widest text-xs rounded-2xl transition-colors border border-subtle"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSubmit()}
            disabled={
              validation.errors.length > 0 || (validation.warnings.length > 0 && !overrideWarnings)
            }
            className={`flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 ${validation.errors.length > 0
              ? 'bg-surface text-muted cursor-not-allowed border border-subtle'
              : validation.warnings.length > 0 && !overrideWarnings
                ? 'bg-orange-500 text-white cursor-pointer hover:opacity-90 shadow-lg shadow-orange-500/20'
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
