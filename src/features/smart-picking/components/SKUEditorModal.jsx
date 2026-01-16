import { useState, useMemo } from 'react';
import { Edit3, Check, X, AlertCircle } from 'lucide-react';
import AutocompleteInput from '../../../components/ui/AutocompleteInput';

/**
 * SKU Editor Modal
 * Allows manual editing or selection of SKUs that were not found
 */
export default function SKUEditorModal({ items, inventory, onConfirm, onCancel }) {
    const [editedItems, setEditedItems] = useState(
        items.map(item => ({
            original: item.sku,
            edited: item.sku,
            qty: item.qty,
            suggestions: item.suggestions || [],
            isValid: false
        }))
    );

    /**
     * Prepare SKU suggestions for autocomplete
     * Uses unified inventory with Warehouse field
     * Format: { value: SKU, info: warehouse + quantity info }
     */
    const skuSuggestions = useMemo(() => {
        const skuMap = new Map();

        inventory.forEach(inv => {
            const sku = inv.SKU;
            if (!sku) return;

            // Build warehouse info
            const warehouseInfo = `${inv.Warehouse} • ${inv.Location} • ${inv.Quantity || 0} units`;

            // If SKU already exists in map, append additional location info
            if (skuMap.has(sku)) {
                const existing = skuMap.get(sku);
                existing.info += ` | ${warehouseInfo}`;
            } else {
                skuMap.set(sku, {
                    value: sku,
                    info: warehouseInfo
                });
            }
        });

        return Array.from(skuMap.values());
    }, [inventory]);

    /**
     * Update edited SKU for an item
     */
    const updateSKU = (index, newSKU) => {
        const updated = [...editedItems];
        updated[index].edited = newSKU;

        // Check if SKU exists in inventory
        const exists = inventory.some(inv => inv.SKU === newSKU);
        updated[index].isValid = exists && newSKU.trim() !== '';

        setEditedItems(updated);
    };

    /**
     * Select a suggested SKU
     */
    const selectSuggestion = (index, suggestion) => {
        updateSKU(index, suggestion);
    };

    /**
     * Check if all items are valid
     */
    const allValid = editedItems.every(item => item.isValid);

    /**
     * Handle confirm
     */
    const handleConfirm = () => {
        const corrections = editedItems.map(item => ({
            original: item.original,
            corrected: item.edited,
            qty: item.qty
        }));
        onConfirm(corrections);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border-2 border-accent rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-subtle flex-shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-accent">Edit SKUs Not Found</h2>
                        <p className="text-muted text-sm mt-1">
                            Correct the SKUs or select from suggestions
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-muted hover:text-content transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content - with scroll */}
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {editedItems.map((item, index) => (
                        <div key={index} className="bg-surface border border-subtle rounded-lg p-4">
                            <div className="flex items-start gap-3 mb-3">
                                <Edit3 className="text-accent flex-shrink-0 mt-1" size={20} />
                                <div className="flex-1">
                                    <div className="text-content font-semibold mb-1">
                                        Original: <span className="font-mono">{item.original}</span>
                                    </div>
                                    <div className="text-muted text-sm">
                                        Quantity: {item.qty}
                                    </div>
                                </div>
                                {item.isValid && (
                                    <Check className="text-green-500" size={20} />
                                )}
                            </div>

                            {/* Manual Input with Autocomplete */}
                            <div className="mb-3">
                                <AutocompleteInput
                                    value={item.edited}
                                    onChange={(newValue) => updateSKU(index, newValue)}
                                    suggestions={skuSuggestions}
                                    placeholder="Enter or search SKU..."
                                    label="Corrected SKU:"
                                    minChars={1}
                                    className={`w-full px-4 py-3 bg-main border rounded-lg text-content placeholder-muted/50 focus:outline-none transition-colors ${item.isValid
                                        ? 'border-green-500 focus:border-green-500'
                                        : 'border-subtle focus:border-accent'
                                        }`}
                                />
                                {!item.isValid && item.edited.trim() !== '' && (
                                    <div className="flex items-center gap-2 mt-2 text-red-400 text-xs">
                                        <AlertCircle size={14} />
                                        <span>SKU not found in inventory</span>
                                    </div>
                                )}
                            </div>

                            {/* Suggestions */}
                            {item.suggestions.length > 0 && (
                                <div>
                                    <div className="text-muted text-xs mb-2">
                                        💡 Similar SKUs (click to select):
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {item.suggestions.map((suggestion, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => selectSuggestion(index, suggestion)}
                                                className={`px-3 py-1 rounded-lg text-sm font-mono transition-all ${item.edited === suggestion
                                                    ? 'bg-green-500 text-main font-bold'
                                                    : 'bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20'
                                                    }`}
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-4 p-6 border-t border-subtle flex-shrink-0">
                    <button
                        onClick={onCancel}
                        className="px-6 py-3 bg-surface hover:opacity-80 text-content rounded-lg transition-colors border border-subtle"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!allValid}
                        className={`px-6 py-3 rounded-lg font-bold transition-all ${allValid
                            ? 'bg-accent text-main hover:opacity-90'
                            : 'bg-surface text-muted cursor-not-allowed border border-subtle'
                            }`}
                    >
                        {allValid ? 'Confirm Corrections' : 'Please correct all SKUs'}
                    </button>
                </div>
            </div>
        </div>
    );
}
