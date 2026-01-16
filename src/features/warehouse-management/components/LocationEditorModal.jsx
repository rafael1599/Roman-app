import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, Save, X, AlertTriangle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useInventory } from '../../../hooks/useInventoryData';
import { useOptimizationReports } from '../../../hooks/useOptimizationReports';
import {
    validateCapacityChange,
    hasActiveInventory,
    calculateLocationChangeImpact
} from '../../../utils/locationValidations';
import { DEFAULT_MAX_CAPACITY } from '../../../utils/capacityUtils';

export default function LocationEditorModal({ location, onSave, onCancel }) {
    const { ludlowData, atsData } = useInventory();
    const { allReports } = useOptimizationReports();
    const [formData, setFormData] = useState({
        max_capacity: DEFAULT_MAX_CAPACITY,
        zone: 'UNASSIGNED',
        picking_order: 999,
        notes: '',
        ...location
    });
    const [validation, setValidation] = useState({ isValid: true, errors: [], warnings: [] });
    const [showImpact, setShowImpact] = useState(false);
    const [impact, setImpact] = useState(null);
    const [overrideWarnings, setOverrideWarnings] = useState(false);

    // Obtener inventario de esta ubicación (Prefer ID match, fallback to name match)
    const inventory = location?.warehouse === 'ATS' ? atsData : ludlowData;
    const locationInventory = inventory.filter(item => {
        if (item.location_id && location?.id) {
            return item.location_id === location.id;
        }
        return item.Warehouse === location?.warehouse && item.Location === location?.location;
    });

    const hasInventory = locationInventory.length > 0;

    // Check if inventory is linked by ID (safe to rename) or just by name (legacy/unsafe)
    const isLinkedById = locationInventory.every(item => item.location_id === location.id);

    const handleCapacityChange = (newCapacity) => {
        const newValidation = validateCapacityChange(newCapacity, locationInventory);
        setValidation(newValidation);
        setFormData(prev => ({ ...prev, max_capacity: parseInt(newCapacity) }));

        // Recalcular impacto
        updateImpactAnalysis({ max_capacity: parseInt(newCapacity) });
    };

    const handleZoneChange = (newZone) => {
        setFormData(prev => ({ ...prev, zone: newZone }));
        updateImpactAnalysis({ zone: newZone });
    };

    const updateImpactAnalysis = (changes) => {
        const newImpact = calculateLocationChangeImpact(
            location?.warehouse,
            location?.location,
            changes,
            inventory,
            allReports || []
        );
        setImpact(newImpact);

        // Auto-expandir si hay impactos
        if (newImpact.impacts.length > 0) {
            setShowImpact(true);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Validar
        const currentValidation = validateCapacityChange(formData.max_capacity, locationInventory);

        // Si hay errores críticos, bloquear
        if (!currentValidation.isValid) {
            setValidation(currentValidation);
            return;
        }

        // Si hay warnings y NO se ha confirmado override, mostrar confirmación
        if (currentValidation.warnings.length > 0 && !overrideWarnings) {
            setValidation(currentValidation);
            return;
        }

        // Guardar (incluir IDs de reportes a invalidar)
        const dataToSave = {
            ...formData,
            invalidateReports: impact?.impacts
                .find(i => i.type === 'REPORTS_INVALIDATED')
                ?.reportIds || []
        };

        onSave(dataToSave);
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border-2 border-blue-500 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-blue-500/30">
                    <div>
                        <h2 className="text-2xl font-bold text-blue-400 flex items-center gap-2">
                            <Edit3 size={24} />
                            Edit Location
                        </h2>
                        <p className="text-blue-300/60 text-sm mt-1">
                            {location?.warehouse} • {location?.location}
                        </p>
                    </div>
                    <button onClick={onCancel} className="text-blue-400 hover:text-blue-300">
                        <X size={24} />
                    </button>
                </div>

                {/* Errores Críticos */}
                {validation.errors.length > 0 && (
                    <div className="mx-6 mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <div className="flex items-start gap-3 mb-2">
                            <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
                            <div>
                                <p className="text-red-300 font-semibold text-sm">Errores que deben corregirse</p>
                            </div>
                        </div>
                        <ul className="ml-8 space-y-1">
                            {validation.errors.map((error, idx) => (
                                <li key={idx} className="text-red-400/80 text-xs">• {error}</li>
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
                                <p className="text-yellow-300 font-semibold text-sm">Advertencias</p>
                                <p className="text-yellow-400/60 text-xs mt-1">Puedes continuar bajo tu propio riesgo</p>
                            </div>
                        </div>

                        {validation.warnings.map((warning, idx) => (
                            <div key={idx} className="ml-8 mb-3 last:mb-0">
                                <p className="text-yellow-400 text-sm font-medium">{warning.message}</p>
                                <p className="text-yellow-400/60 text-xs mt-1">💡 {warning.recommendation}</p>
                            </div>
                        ))}

                        {/* Checkbox para confirmar override */}
                        <label className="ml-8 mt-4 flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={overrideWarnings}
                                onChange={(e) => setOverrideWarnings(e.target.checked)}
                                className="mt-1 w-4 h-4 rounded border-yellow-500/50 bg-yellow-500/10 focus:ring-yellow-500/50"
                            />
                            <span className="text-yellow-300/90 text-xs">
                                Entiendo los riesgos y deseo continuar de todas formas
                            </span>
                        </label>
                    </div>
                )}

                {/* Análisis de Impacto (Colapsable) */}
                {impact && impact.impacts.length > 0 && (
                    <div className="mx-6 mt-6 border border-blue-500/30 rounded-lg overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowImpact(!showImpact)}
                            className="w-full p-4 bg-blue-500/10 hover:bg-blue-500/15 flex items-center justify-between transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <AlertCircle className="text-blue-400" size={20} />
                                <div className="text-left">
                                    <p className="text-blue-300 font-semibold text-sm">
                                        Análisis de Impacto ({impact.impacts.length})
                                    </p>
                                    <p className="text-blue-400/60 text-xs">
                                        {impact.affectedSKUs} SKU(s) afectados • {impact.totalUnits} unidades
                                    </p>
                                </div>
                            </div>
                            {showImpact ? <ChevronUp className="text-blue-400" size={18} /> : <ChevronDown className="text-blue-400" size={18} />}
                        </button>

                        {showImpact && (
                            <div className="p-4 bg-blue-500/5 space-y-3">
                                {impact.impacts.map((impactItem, idx) => (
                                    <div key={idx} className="bg-gray-800/50 rounded-lg p-3">
                                        <p className="text-blue-300 font-semibold text-sm mb-2">
                                            {impactItem.message}
                                        </p>
                                        <ul className="space-y-1">
                                            {impactItem.details.map((detail, detailIdx) => (
                                                <li key={detailIdx} className="text-blue-400/70 text-xs ml-4">
                                                    • {detail}
                                                </li>
                                            ))}
                                        </ul>

                                        {/* Indicador especial para reportes invalidados */}
                                        {impactItem.type === 'REPORTS_INVALIDATED' && (
                                            <div className="mt-2 p-2 bg-orange-500/10 border border-orange-500/20 rounded">
                                                <p className="text-orange-300 text-xs font-semibold">
                                                    ⚠️ Estos reportes serán marcados como obsoletos automáticamente
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
                            Esta ubicación tiene {locationInventory.length} SKU(s) con {locationInventory.reduce((sum, i) => sum + (i.Quantity || 0), 0)} unidades totales
                        </p>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Nombre de Ubicación */}
                    <div>
                        <label className="block text-sm font-semibold text-blue-300 mb-2">
                            Location Name
                        </label>
                        <input
                            type="text"
                            value={formData.location}
                            onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none transition-colors"
                            placeholder="e.g. A-01-01"
                        />
                        {/* Only show warning if inventory exists AND is NOT linked by ID */}
                        {hasInventory && !isLinkedById && formData.location !== location.location && (
                            <p className="text-orange-400 text-xs mt-2 flex items-center gap-1">
                                <AlertTriangle size={12} />
                                Warning: Inventory is linked by name (Legacy). Renaming will decouple it.
                            </p>
                        )}

                    </div>

                    {/* Capacidad */}
                    <div>
                        <label className="block text-sm font-semibold text-blue-300 mb-2">
                            Max Capacity (units)
                        </label>
                        <input
                            type="number"
                            value={formData.max_capacity}
                            onChange={(e) => handleCapacityChange(e.target.value)}
                            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white focus:outline-none transition-colors ${validation.errors.length > 0
                                ? 'border-red-500 focus:border-red-400'
                                : validation.warnings.length > 0
                                    ? 'border-yellow-500 focus:border-yellow-400'
                                    : 'border-gray-700 focus:border-blue-500'
                                }`}
                            min="1"
                        />
                    </div>

                    {/* Zona */}
                    <div>
                        <label className="block text-sm font-semibold text-blue-300 mb-2">
                            Zone
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {['HOT', 'WARM', 'COLD', 'UNASSIGNED'].map((zone) => (
                                <button
                                    key={zone}
                                    type="button"
                                    onClick={() => handleZoneChange(zone)}
                                    className={`px-4 py-2 rounded-lg font-bold text-xs transition-all border ${formData.zone === zone
                                        ? 'bg-blue-500 text-black border-blue-500'
                                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                                        }`}
                                >
                                    {zone}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Picking Order */}
                    <div>
                        <label className="block text-sm font-semibold text-blue-300 mb-2">
                            Picking Order
                            <span className="text-xs text-gray-500 ml-2">(menor = mayor prioridad)</span>
                        </label>
                        <input
                            type="number"
                            value={formData.picking_order}
                            onChange={(e) => setFormData(prev => ({
                                ...prev,
                                picking_order: parseInt(e.target.value) || 0
                            }))}
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none transition-colors"
                        />
                    </div>

                    {/* Notas */}
                    <div>
                        <label className="block text-sm font-semibold text-blue-300 mb-2">
                            Notes (opcional)
                        </label>
                        <textarea
                            value={formData.notes || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none transition-colors resize-none"
                            rows="3"
                            placeholder="Información adicional sobre esta ubicación..."
                        />
                    </div>
                </form>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-blue-500/30">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={validation.errors.length > 0 || (validation.warnings.length > 0 && !overrideWarnings)}
                        className={`flex-1 px-6 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${validation.errors.length > 0
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : validation.warnings.length > 0 && !overrideWarnings
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-500 hover:bg-blue-400 text-black'
                            }`}
                    >
                        <Save size={20} />
                        {validation.warnings.length > 0 && !overrideWarnings
                            ? 'Confirma los riesgos para continuar'
                            : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
        , document.body);
}
