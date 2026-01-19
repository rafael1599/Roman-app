import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Trash2, Plus } from 'lucide-react';
import { useInventory } from '../../../hooks/useInventoryData';
import AutocompleteInput from '../../../components/ui/AutocompleteInput';
import toast from 'react-hot-toast';
import { useConfirmation } from '../../../context/ConfirmationContext';

export const InventoryModal = ({ isOpen, onClose, onSave, onDelete, initialData, mode = 'add', screenType }) => {
    const { ludlowData, atsData, isAdmin, updateSKUMetadata } = useInventory();
    const [formData, setFormData] = useState({
        SKU: '',
        Location: '',
        Quantity: 0,
        Location_Detail: '',
        Warehouse: screenType || 'LUDLOW',
        length_ft: 5,
        width_in: 6
    });
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

    // Generate Location suggestions based on the SELECTED warehouse
    const locationSuggestions = useMemo(() => {
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
    }, [currentInventory]);

    useEffect(() => {
        if (isOpen) {
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
        }
    }, [isOpen, initialData, mode, screenType]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleWarehouseChange = (wh) => {
        setFormData(prev => ({ ...prev, Warehouse: wh }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-subtle rounded-xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted hover:text-content transition-colors z-10"
                >
                    <X className="w-6 h-6" />
                </button>

                <h2 className="text-xl font-bold text-content mb-6">
                    {mode === 'edit' ? 'Edit Item' : 'Add New Item'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Warehouse Selector */}
                    <div>
                        <label className="block text-sm font-semibold text-accent mb-3 uppercase tracking-wider">Select Warehouse</label>
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
                        label="SKU"
                        value={formData.SKU}
                        onChange={(value) => setFormData(prev => ({ ...prev, SKU: value }))}
                        suggestions={skuSuggestions}
                        placeholder="Enter SKU..."
                        minChars={2}
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

                    <div className="grid grid-cols-2 gap-4">
                        {/* Location with Autocomplete */}
                        <div>
                            <AutocompleteInput
                                label="Location"
                                value={formData.Location}
                                onChange={(value) => setFormData(prev => ({ ...prev, Location: value }))}
                                suggestions={locationSuggestions}
                                placeholder="Row/Bin..."
                                minChars={1}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-accent mb-2">Quantity</label>
                            <input
                                type="number"
                                name="Quantity"
                                value={formData.Quantity}
                                onChange={(e) => setFormData(prev => ({ ...prev, Quantity: parseInt(e.target.value) || 0 }))}
                                onFocus={(e) => e.target.select()}
                                className="w-full bg-main border border-subtle rounded-lg px-4 py-3 text-content focus:border-accent focus:outline-none transition-colors font-mono text-center text-lg"
                                required
                            />
                        </div>
                    </div>

                    {/* Location Detail */}
                    <div>
                        <label className="block text-sm font-semibold text-accent mb-2 flex justify-between">
                            <span>Location Detail</span>
                            <span className="text-xs text-muted font-bold uppercase">Optional</span>
                        </label>
                        <input
                            name="Location_Detail"
                            value={formData.Location_Detail}
                            onChange={handleChange}
                            className="w-full bg-main border border-subtle rounded-lg px-4 py-3 text-content focus:border-accent focus:outline-none transition-colors font-mono text-accent"
                            placeholder="e.g. A6-19..."
                        />
                    </div>

                    {/* Admin-Only Dimension Fields */}
                    {isAdmin && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-accent/5 rounded-xl border border-accent/10">
                            <div>
                                <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">Length (ft) [ADMIN]</label>
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
                                <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">Width (in) [ADMIN]</label>
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

                    <div className="flex gap-3 mt-6">
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
                                className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation"
                            >
                                <Trash2 className="w-5 h-5" />
                                Delete
                            </button>
                        )}
                        <button
                            type="submit"
                            className="flex-1 bg-content hover:opacity-90 text-main font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-transform active:scale-95 touch-manipulation"
                        >
                            <Save className="w-5 h-5" />
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
