import React, { useState, useEffect, useMemo, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Trash2, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useInventory } from '../../../hooks/useInventoryData';
import AutocompleteInput from '../../../components/ui/AutocompleteInput';
import toast from 'react-hot-toast';
import { useConfirmation } from '../../../context/ConfirmationContext';
import { useLocationManagement } from '../../../hooks/useLocationManagement';
import { predictLocation } from '../../../utils/locationPredictor';
import { useViewMode } from '../../../context/ViewModeContext';
import { useAutoSelect } from '../../../hooks/useAutoSelect';
import { InventoryItem, InventoryItemInput } from '../../../schemas/inventory.schema';

interface InventoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: InventoryItemInput & { length_ft?: number; width_in?: number }) => void;
    onDelete?: () => void;
    initialData?: InventoryItem & { sku_metadata?: { length_ft?: number; width_in?: number } | null };
    mode?: 'add' | 'edit';
    screenType?: string;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
    isOpen,
    onClose,
    onSave,
    onDelete,
    initialData,
    mode = 'add',
    screenType,
}) => {
    const { ludlowData, atsData, isAdmin, updateSKUMetadata } = useInventory();
    const { locations } = useLocationManagement();
    const { setIsNavHidden } = useViewMode();
    const autoSelect = useAutoSelect();

    const [formData, setFormData] = useState({
        SKU: '',
        Location: '',
        Quantity: 0,
        sku_note: '',
        Warehouse: screenType || 'LUDLOW',
        length_ft: 5,
        width_in: 6,
    });

    const [confirmCreateNew, setConfirmCreateNew] = useState(false);

    const validLocationNames = useMemo(() => {
        if (!locations || locations.length === 0) return [];
        const names = locations
            .filter((l) => (l.warehouse || '').toUpperCase() === (formData.Warehouse || '').toUpperCase())
            .map((l) => l.location);
        return [...new Set(names)];
    }, [locations, formData.Warehouse]);

    const prediction = useMemo(
        () => predictLocation(formData.Location, validLocationNames),
        [formData.Location, validLocationNames]
    );

    const isNewLocation = useMemo(() => {
        if (!formData.Location) return false;
        return !prediction.exactMatch;
    }, [formData.Location, prediction]);

    useEffect(() => {
        setConfirmCreateNew(false);
    }, [formData.Location]);

    const { showConfirmation } = useConfirmation();

    const currentInventory = formData.Warehouse === 'ATS' ? atsData : ludlowData;

    const skuSuggestions = useMemo(() => {
        const uniqueSKUs = new Map<string, { value: string; info: string }>();
        currentInventory.forEach((item) => {
            if (item.SKU) {
                const skuStr = String(item.SKU).trim();
                if (!uniqueSKUs.has(skuStr)) {
                    uniqueSKUs.set(skuStr, {
                        value: skuStr,
                        info: `${item.Quantity || 0} units${item.Location ? ` • ${item.Location}` : ''}${item.sku_note ? ` • ${item.sku_note}` : ''}`,
                    });
                }
            }
        });
        return Array.from(uniqueSKUs.values());
    }, [currentInventory]);

    const locationSuggestions = useMemo(() => {
        if (formData.Location && formData.Location.length > 0 && prediction.matches.length > 0) {
            return [...new Set(prediction.matches)].map((locName) => ({
                value: locName,
                info: `Database Location`,
            }));
        }

        const locationMap = new Map<string, { count: number; totalQty: number }>();
        currentInventory.forEach((item) => {
            if (item.Location) {
                const locStr = String(item.Location).trim();
                if (!locationMap.has(locStr)) {
                    locationMap.set(locStr, {
                        count: 0,
                        totalQty: 0,
                    });
                }
                const loc = locationMap.get(locStr)!;
                loc.count++;
                loc.totalQty += Number(item.Quantity) || 0;
            }
        });

        return Array.from(locationMap.entries()).map(([location, data]) => ({
            value: location,
            info: `${data.count} item${data.count !== 1 ? 's' : ''} • ${data.totalQty} total units`,
        }));
    }, [currentInventory, formData.Location, prediction.matches]);

    useEffect(() => {
        if (isOpen) {
            setIsNavHidden!(true);
            setConfirmCreateNew(false);
            if (mode === 'edit' && initialData) {
                setFormData({
                    SKU: initialData.SKU || '',
                    Location: initialData.Location || '',
                    Quantity: Number(initialData.Quantity) || 0,
                    sku_note: initialData.sku_note || '',
                    Warehouse: initialData.Warehouse || screenType || 'LUDLOW',
                    length_ft: initialData.sku_metadata?.length_ft ?? 5,
                    width_in: initialData.sku_metadata?.width_in ?? 6,
                });
            } else {
                setFormData({
                    SKU: '',
                    Location: '',
                    Quantity: 0,
                    sku_note: '',
                    Warehouse: screenType || 'LUDLOW',
                    length_ft: 5,
                    width_in: 6,
                });
            }
        } else {
            setIsNavHidden!(false);
        }

        return () => setIsNavHidden!(false);
    }, [isOpen, initialData, mode, screenType, setIsNavHidden]);

    if (!isOpen) return null;

    const handleWarehouseChange = (wh: string) => {
        setFormData((prev) => ({ ...prev, Warehouse: wh }));
    };

    const handleLocationBlur = (val: string) => {
        if (!val) return;
        if (prediction.bestGuess && prediction.bestGuess !== val) {
            setFormData((prev) => ({ ...prev, Location: prediction.bestGuess! }));
            toast(
                <span className="flex flex-col">
                    <span>
                        Auto-selected <b>{prediction.bestGuess}</b>
                    </span>
                    <span className="text-xs opacity-80">Matched from "{val}"</span>
                </span>,
                { icon: '✨', duration: 3000 }
            );
        }
    };

    const handleSubmit = (e?: FormEvent) => {
        if (e) e.preventDefault();

        if (isNewLocation && !confirmCreateNew) {
            toast.error('Please confirm creating the new location.');
            return;
        }

        if (mode === 'edit' && initialData && formData.SKU !== initialData.SKU) {
            showConfirmation(
                'Identity Change (SKU)',
                `You are about to rename the product:\nFROM: "${initialData.SKU}"\nTO:  "${formData.SKU}"\n\nAre you sure? This will alter how this item is searched in the history.`,
                () => {
                    onSave(formData as any);
                    onClose();
                },
                null,
                'Rename',
                'Cancel'
            );
            return;
        }

        if (isAdmin) {
            updateSKUMetadata({
                sku: formData.SKU,
                length_ft: formData.length_ft,
                width_in: formData.width_in,
            }).catch((err) => {
                console.error('Failed to save metadata:', err);
                toast.error('Note: Item saved but dimensions failed to update.');
            });
        }

        onSave(formData as any);
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-surface border border-subtle rounded-3xl w-full shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
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
                        <div>
                            <label className="block text-[10px] font-black text-accent mb-3 uppercase tracking-widest">
                                Select Warehouse
                            </label>
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
                                    onClick={() =>
                                        toast('Coming Soon: You will be able to add custom warehouses here.', { icon: 'ℹ️' })
                                    }
                                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-dashed border-subtle text-muted hover:border-accent hover:text-accent transition-all"
                                    title="Add New Warehouse"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <AutocompleteInput
                            id="inventory_sku"
                            label="SKU"
                            value={formData.SKU}
                            onChange={(value: string) => setFormData((prev) => ({ ...prev, SKU: value }))}
                            suggestions={skuSuggestions}
                            placeholder="Enter SKU..."
                            minChars={2}
                            initialKeyboardMode="numeric"
                            onSelect={(suggestion: any) => {
                                const item = currentInventory.find((i) => i.SKU === suggestion.value);
                                if (item && mode === 'add') {
                                    setFormData((prev) => ({
                                        ...prev,
                                        SKU: suggestion.value,
                                        Location: item.Location || prev.Location,
                                        sku_note: item.sku_note || prev.sku_note,
                                    }));
                                }
                            }}
                        />

                        <div className="flex flex-col gap-2">
                            <AutocompleteInput
                                id="inventory_location"
                                label="Location"
                                value={formData.Location}
                                onChange={(value: string) => setFormData((prev) => ({ ...prev, Location: value }))}
                                onBlur={handleLocationBlur}
                                suggestions={locationSuggestions}
                                placeholder="Row/Bin..."
                                minChars={1}
                                initialKeyboardMode="numeric"
                            />

                            {isNewLocation && formData.Location && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="text-yellow-500 shrink-0 mt-0.5" size={16} />
                                        <div>
                                            <p className="text-[10px] font-black text-yellow-500 uppercase">
                                                Unrecognized Location
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-2 pt-2 border-t border-yellow-500/10">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div
                                                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${confirmCreateNew ? 'bg-yellow-500 border-yellow-500' : 'border-neutral-500 group-hover:border-yellow-500'}`}
                                            >
                                                {confirmCreateNew && <CheckCircle2 size={12} className="text-black" />}
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={confirmCreateNew}
                                                onChange={(e) => setConfirmCreateNew(e.target.checked)}
                                            />
                                            <span
                                                className={`text-[10px] font-black uppercase tracking-wide ${confirmCreateNew ? 'text-content' : 'text-muted'}`}
                                            >
                                                Confirm New Location
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>

                        <AutocompleteInput
                            id="sku_note"
                            label="Internal Note"
                            value={formData.sku_note}
                            onChange={(value: string) => setFormData((prev) => ({ ...prev, sku_note: value }))}
                            suggestions={[]}
                            placeholder="e.g. T, ø, P..."
                            initialKeyboardMode="text"
                        />

                        <div>
                            <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">
                                Quantity
                            </label>
                            <input
                                type="number"
                                name="Quantity"
                                value={formData.Quantity}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, Quantity: parseInt(e.target.value) || 0 }))
                                }
                                {...autoSelect}
                                className="w-full bg-main border border-subtle rounded-xl px-4 py-4 text-content focus:border-accent focus:outline-none transition-colors font-mono text-center text-2xl font-black"
                                required
                            />
                        </div>

                        {isAdmin && (
                            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/5 rounded-2xl border border-accent/10">
                                <div>
                                    <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">
                                        Length (ft)
                                    </label>
                                    <input
                                        type="number"
                                        name="length_ft"
                                        value={formData.length_ft}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                length_ft: parseFloat(e.target.value) || 0,
                                            }))
                                        }
                                        {...autoSelect}
                                        className="w-full bg-main border border-subtle rounded-lg px-4 py-2 text-content focus:border-accent focus:outline-none transition-colors font-mono"
                                        placeholder="5"
                                        step="0.1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">
                                        Width (in)
                                    </label>
                                    <input
                                        type="number"
                                        name="width_in"
                                        value={formData.width_in}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                width_in: parseFloat(e.target.value) || 0,
                                            }))
                                        }
                                        {...autoSelect}
                                        className="w-full bg-main border border-subtle rounded-lg px-4 py-2 text-content focus:border-accent focus:outline-none transition-colors font-mono"
                                        placeholder="6"
                                        step="0.1"
                                    />
                                </div>
                            </div>
                        )}
                    </form>
                </div>

                <div className="p-6 border-t border-subtle bg-main/50 flex gap-3">
                    {mode === 'edit' && onDelete && (
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
                        onClick={() => handleSubmit()}
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
