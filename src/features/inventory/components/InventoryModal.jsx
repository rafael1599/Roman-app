import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Trash2, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useInventory } from '../../../hooks/useInventoryData';
import AutocompleteInput from '../../../components/ui/AutocompleteInput';
import toast from 'react-hot-toast';
import { useConfirmation } from '../../../context/ConfirmationContext';
import { useLocationManagement } from '../../../hooks/useLocationManagement';
import { predictLocation } from '../../../utils/locationPredictor';
import { useViewMode } from '../../../context/ViewModeContext';

export const InventoryModal = ({ isOpen, onClose, onSave, onDelete, initialData, mode = 'add', screenType }) => {
    const { ludlowData, atsData, isAdmin, updateSKUMetadata } = useInventory();
    const { locations } = useLocationManagement(); // Added for validation
    const { setIsNavHidden } = useViewMode();

    const [formData, setFormData] = useState({
        SKU: '',
        Location: '',
        Quantity: 0,
        Location_Detail: '',
        Warehouse: screenType || 'LUDLOW',
        length_ft: 5,
        width_in: 6
    });

    // --- Smart Location Logic (Copied/Adapted from MovementModal) ---
    const [confirmCreateNew, setConfirmCreateNew] = useState(false);

    // 1. Valid names in current warehouse (Case Insensitive Safety)
    const validLocationNames = useMemo(() => {
        if (!locations || locations.length === 0) return [];
        return locations
            .filter(l => (l.warehouse || '').toUpperCase() === (formData.Warehouse || '').toUpperCase())
            .map(l => l.location);
    }, [locations, formData.Warehouse]);

    // 2. Predictions based on current input
    const prediction = useMemo(() =>
        predictLocation(formData.Location, validLocationNames),
        [formData.Location, validLocationNames]
    );

    // 3. New Location Warning State (Strict)
    const isNewLocation = useMemo(() => {
        if (!formData.Location) return false;
        return !prediction.exactMatch;
    }, [formData.Location, prediction]);

    // Reset confirmation when location changes
    useEffect(() => {
        setConfirmCreateNew(false);
    }, [formData.Location]);

    // Debugging
    useEffect(() => {
        console.log('InventoryModal Debug:', {
            input: formData.Location,
            warehouse: formData.Warehouse,
            totalLocations: locations.length,
            validNamesCount: validLocationNames.length,
            isNewLocation,
            exactMatch: prediction.exactMatch
        });
    }, [formData.Location, formData.Warehouse, locations.length, validLocationNames.length, isNewLocation, prediction]);

    // -------------------------------------------------------------

    const { showConfirmation } = useConfirmation();

    // Get current inventory based on the warehouse selected IN THE MODAL
    const currentInventory = formData.Warehouse === 'ATS' ? atsData : ludlowData;

    // Generate SKU suggestions based on the SELECTED warehouse
    const skuSuggestions = useMemo(() => {
        const uniqueSKUs = new Map();
        currentInventory.forEach(item => {
            if (item.SKU) {
                if (!uniqueSKUs.has(item.SKU)) {
                    uniqueSKUs.set(item.SKU, {
                        value: item.SKU,
                        info: `${item.Quantity || 0} units${item.Location ? ` • ${item.Location}` : ''}${item.Location_Detail ? ` • ${item.Location_Detail}` : ''}`
                    });
                }
            }
        });
        return Array.from(uniqueSKUs.values());
    }, [currentInventory]);

    // Generate Location suggestions based on the SELECTED warehouse (PLUS strict matches)
    const locationSuggestions = useMemo(() => {
        // If user is typing, prioritize predictive matches
        if (formData.Location && formData.Location.length > 0 && prediction.matches.length > 0) {
            return prediction.matches.map(locName => ({
                value: locName,
                info: `Database Location`
            }));
        }

        const locationMap = new Map();
        currentInventory.forEach(item => {
            if (item.Location) {
                if (!locationMap.has(item.Location)) {
                    locationMap.set(item.Location, {
                        count: 0,
                        totalQty: 0
                    });
                }
                const loc = locationMap.get(item.Location);
                loc.count++;
                loc.totalQty += parseInt(item.Quantity) || 0;
            }
        });

        return Array.from(locationMap.entries()).map(([location, data]) => ({
            value: location,
            info: `${data.count} item${data.count !== 1 ? 's' : ''} • ${data.totalQty} total units`
        }));
    }, [currentInventory, formData.Location, prediction.matches]);

    useEffect(() => {
        if (isOpen) {
            setIsNavHidden(true);
            setConfirmCreateNew(false); // Reset on open
            if (mode === 'edit' && initialData) {
                setFormData({
                    SKU: initialData.SKU || '',
                    Location: initialData.Location || '',
                    Quantity: initialData.Quantity || 0,
                    Location_Detail: initialData.Location_Detail || '',
                    Warehouse: initialData.Warehouse || screenType || 'LUDLOW',
                    length_ft: initialData.sku_metadata?.length_ft ?? 5,
                    width_in: initialData.sku_metadata?.width_in ?? 6
                });
            } else {
                setFormData({
                    SKU: '',
                    Location: '',
                    Quantity: 0,
                    Location_Detail: '',
                    Warehouse: screenType || 'LUDLOW',
                    length_ft: 5,
                    width_in: 6
                });
            }
        } else {
            setIsNavHidden(false);
        }

        return () => setIsNavHidden(false);
    }, [isOpen, initialData, mode, screenType, setIsNavHidden]);

    if (!isOpen) return null;


    const handleWarehouseChange = (wh) => {
        setFormData(prev => ({ ...prev, Warehouse: wh }));
    };

    // Auto-Correction on Blur (Similar to MovementModal)
    const handleLocationBlur = (val) => {
        if (!val) return;
        if (prediction.bestGuess && prediction.bestGuess !== val) {
            setFormData(prev => ({ ...prev, Location: prediction.bestGuess }));
            toast.success(
                <span className="flex flex-col">
                    <span>Auto-selected <b>{prediction.bestGuess}</b></span>
                    <span className="text-xs opacity-80">Matched from "{val}"</span>
                </span>,
                { icon: '✨', duration: 3000 }
            );
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // STRICT VALIDATION BLOCKER
        if (isNewLocation && !confirmCreateNew) {
            toast.error("Please confirm creating the new location.");
            return;
        }

        // Warning for SKU Change
        if (mode === 'edit' && initialData && formData.SKU !== initialData.SKU) {
            showConfirmation(
                'Identity Change (SKU)',
                `You are about to rename the product:\nFROM: "${initialData.SKU}"\nTO:  "${formData.SKU}"\n\nAre you sure? This will alter how this item is searched in the history.`,
                () => {
                    onSave(formData);
                    onClose();
                },
                null,
                'Rename',
                'Cancel'
            );
            return; // Prevent default submit after showing confirmation
        }

        if (isAdmin) {
            updateSKUMetadata({
                sku: formData.SKU,
                length_ft: formData.length_ft,
                width_in: formData.width_in
            }).catch(err => {
                console.error("Failed to save metadata:", err);
                toast.error("Note: Item saved but dimensions failed to update.");
            });
        }

        onSave(formData);
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-surface border border-subtle rounded-3xl w-full shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-subtle bg-main/50 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-content uppercase tracking-tight">
                            {mode === 'edit' ? 'Edit Item' : 'Add New Item'}
                        </h2>
                        {initialData?.SKU && mode === 'edit' && (
                            <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-0.5">
                                Original: <span className="text-accent">{initialData.SKU}</span>
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-muted hover:text-content transition-colors z-10"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto">
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {/* Warehouse Selector */}
                        <div>
                            <label className="block text-[10px] font-black text-accent mb-3 uppercase tracking-widest">Select Warehouse</label>
                            <div className="flex flex-wrap gap-2">
                                {['LUDLOW', 'ATS'].map((wh) => (
                                    <button
                                        key={wh}
                                        type="button"
                                        onClick={() => handleWarehouseChange(wh)}
                                        className={`px-4 py-2 rounded-lg font-bold text-xs transition-all border ${formData.Warehouse === wh
                                            ? 'bg-accent text-main border-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]'
                                            : 'bg-surface text-muted border-subtle hover:border-muted'
                                            }`}
                                    >
                                        {wh}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => toast.info('Coming Soon: You will be able to add custom warehouses here.')}
                                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-dashed border-subtle text-muted hover:border-accent hover:text-accent transition-all"
                                    title="Add New Warehouse"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* SKU with Autocomplete */}
                        <AutocompleteInput
                            id="inventory_sku"
                            label="SKU"
                            value={formData.SKU}
                            onChange={(value) => setFormData(prev => ({ ...prev, SKU: value }))}
                            suggestions={skuSuggestions}
                            placeholder="Enter SKU..."
                            minChars={2}
                            initialKeyboardMode="numeric"
                            onSelect={(suggestion) => {
                                const item = currentInventory.find(i => i.SKU === suggestion.value);
                                if (item && mode === 'add') {
                                    setFormData(prev => ({
                                        ...prev,
                                        SKU: suggestion.value,
                                        Location: item.Location || prev.Location,
                                        Location_Detail: item.Location_Detail || prev.Location_Detail
                                    }));
                                }
                            }}
                        />

                        {/* Location with Autocomplete & Strict Validation */}
                        <div className="flex flex-col gap-2">
                            <AutocompleteInput
                                id="inventory_location"
                                label="Location"
                                value={formData.Location}
                                onChange={(value) => setFormData(prev => ({ ...prev, Location: value }))}
                                onBlur={handleLocationBlur}
                                suggestions={locationSuggestions}
                                placeholder="Row/Bin..."
                                minChars={1}
                                initialKeyboardMode="numeric"
                            />

                            {/* New Location Warning with Explicit Confirmation */}
                            {isNewLocation && formData.Location && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="text-yellow-500 shrink-0 mt-0.5" size={16} />
                                        <div>
                                            <p className="text-[10px] font-black text-yellow-500 uppercase">Unrecognized Location</p>
                                        </div>
                                    </div>

                                    <div className="mt-2 pt-2 border-t border-yellow-500/10">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${confirmCreateNew ? 'bg-yellow-500 border-yellow-500' : 'border-neutral-500 group-hover:border-yellow-500'}`}>
                                                {confirmCreateNew && <CheckCircle2 size={12} className="text-black" />}
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={confirmCreateNew}
                                                onChange={(e) => setConfirmCreateNew(e.target.checked)}
                                            />
                                            <span className={`text-[10px] font-black uppercase tracking-wide ${confirmCreateNew ? 'text-content' : 'text-muted'}`}>
                                                Confirm New Location
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Location Detail */}
                        <AutocompleteInput
                            id="location_detail"
                            label="Location Detail"
                            value={formData.Location_Detail}
                            onChange={(value) => setFormData(prev => ({ ...prev, Location_Detail: value }))}
                            suggestions={[]}
                            placeholder="e.g. A6-19..."
                            initialKeyboardMode="text"
                        />

                        <div>
                            <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">Quantity</label>
                            <input
                                type="number"
                                name="Quantity"
                                value={formData.Quantity}
                                onChange={(e) => setFormData(prev => ({ ...prev, Quantity: parseInt(e.target.value) || 0 }))}
                                onFocus={(e) => e.target.select()}
                                className="w-full bg-main border border-subtle rounded-xl px-4 py-4 text-content focus:border-accent focus:outline-none transition-colors font-mono text-center text-2xl font-black"
                                required
                            />
                        </div>

                        {/* Admin-Only Dimension Fields */}
                        {isAdmin && (
                            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/5 rounded-2xl border border-accent/10">
                                <div>
                                    <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">Length (ft)</label>
                                    <input
                                        type="number"
                                        name="length_ft"
                                        value={formData.length_ft}
                                        onChange={(e) => setFormData(prev => ({ ...prev, length_ft: parseFloat(e.target.value) || 0 }))}
                                        className="w-full bg-main border border-subtle rounded-lg px-4 py-2 text-content focus:border-accent focus:outline-none transition-colors font-mono"
                                        placeholder="5"
                                        step="0.1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">Width (in)</label>
                                    <input
                                        type="number"
                                        name="width_in"
                                        value={formData.width_in}
                                        onChange={(e) => setFormData(prev => ({ ...prev, width_in: parseFloat(e.target.value) || 0 }))}
                                        className="w-full bg-main border border-subtle rounded-lg px-4 py-2 text-content focus:border-accent focus:outline-none transition-colors font-mono"
                                        placeholder="6"
                                        step="0.1"
                                    />
                                </div>
                            </div>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-subtle bg-main/50 flex gap-3">
                    {mode === 'edit' && onDelete && isAdmin && (
                        <button
                            type="button"
                            onClick={() => {
                                showConfirmation(
                                    'Delete Item',
                                    'Are you sure you want to delete this item?',
                                    () => {
                                        onDelete();
                                        onClose();
                                    }
                                );
                            }}
                            className="w-14 h-14 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0"
                            title="Delete Item"
                        >
                            <Trash2 className="w-6 h-6" />
                        </button>
                    )}
                    <button
                        onClick={handleSubmit}
                        className="flex-1 bg-accent hover:opacity-90 text-main font-black uppercase tracking-widest h-14 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-accent/20"
                    >
                        <Save className="w-5 h-5" />
                        {mode === 'edit' ? 'Update' : 'Save'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
