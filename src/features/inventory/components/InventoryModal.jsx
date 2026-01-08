import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Trash2, Plus } from 'lucide-react';
import { useInventory } from '../../../hooks/useInventoryData';
import AutocompleteInput from '../../../components/ui/AutocompleteInput';

export const InventoryModal = ({ isOpen, onClose, onSave, onDelete, initialData, mode = 'add', screenType }) => {
    const { ludlowData, atsData } = useInventory();
    const [formData, setFormData] = useState({
        SKU: '',
        Location: '',
        Quantity: 0,
        Location_Detail: '',
        Warehouse: screenType || 'LUDLOW'
    });

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
                    Warehouse: initialData.Warehouse || screenType || 'LUDLOW'
                });
            } else {
                setFormData({
                    SKU: '',
                    Location: '',
                    Quantity: 0,
                    Location_Detail: '',
                    Warehouse: screenType || 'LUDLOW'
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
        onSave(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-neutral-500 hover:text-gray-100 transition-colors z-10"
                >
                    <X className="w-6 h-6" />
                </button>

                <h2 className="text-xl font-bold text-gray-100 mb-6">
                    {mode === 'edit' ? 'Edit Item' : 'Add New Item'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Warehouse Selector */}
                    <div>
                        <label className="block text-sm font-semibold text-green-300 mb-3 uppercase tracking-wider">Select Warehouse</label>
                        <div className="flex flex-wrap gap-2">
                            {['LUDLOW', 'ATS'].map((wh) => (
                                <button
                                    key={wh}
                                    type="button"
                                    onClick={() => handleWarehouseChange(wh)}
                                    className={`px-4 py-2 rounded-lg font-bold text-xs transition-all border ${formData.Warehouse === wh
                                        ? 'bg-green-500 text-black border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                        : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-500'
                                        }`}
                                >
                                    {wh}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => alert('Coming Soon: You will be able to add custom warehouses here.')}
                                className="w-9 h-9 flex items-center justify-center rounded-lg bg-neutral-900 border border-dashed border-neutral-700 text-neutral-500 hover:border-green-500/50 hover:text-green-500 transition-all"
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
                            <label className="block text-sm font-semibold text-green-300 mb-2">Quantity</label>
                            <input
                                type="number"
                                name="Quantity"
                                value={formData.Quantity}
                                onChange={(e) => setFormData(prev => ({ ...prev, Quantity: parseInt(e.target.value) || 0 }))}
                                onFocus={(e) => e.target.select()}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-green-500 focus:outline-none transition-colors font-mono text-center text-lg"
                                required
                            />
                        </div>
                    </div>

                    {/* Location Detail */}
                    <div>
                        <label className="block text-sm font-semibold text-green-300 mb-2 flex justify-between">
                            <span>Location Detail</span>
                            <span className="text-xs text-gray-500 uppercase">Optional</span>
                        </label>
                        <input
                            name="Location_Detail"
                            value={formData.Location_Detail}
                            onChange={handleChange}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-green-500 focus:outline-none transition-colors font-mono text-yellow-500"
                            placeholder="e.g. A6-19..."
                        />
                    </div>

                    <div className="flex gap-3 mt-6">
                        {mode === 'edit' && onDelete && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.confirm('Are you sure you want to delete this item?')) {
                                        onDelete();
                                        onClose();
                                    }
                                }}
                                className="flex-1 bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-400 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation"
                            >
                                <Trash2 className="w-5 h-5" />
                                Delete
                            </button>
                        )}
                        <button
                            type="submit"
                            className="flex-1 bg-green-400 hover:bg-green-500 text-neutral-950 font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-transform active:scale-95 touch-manipulation"
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
