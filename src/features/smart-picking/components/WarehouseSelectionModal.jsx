import { useState, useEffect } from 'react';
import { Warehouse, Package, AlertCircle, X } from 'lucide-react';

/**
 * Warehouse Selection Modal
 * Mobile-first design for choosing warehouse when item is in both Ludlow and ATS
 */
export default function WarehouseSelectionModal({ items, onConfirm, onCancel, singleMode = false }) {
    const [selections, setSelections] = useState({});

    // Initialize selections if items already have a warehouse pre-selected (for on-the-fly change)
    useEffect(() => {
        const initial = {};
        items.forEach(item => {
            if (item.warehouse) {
                initial[item.id || item.sku] = item.warehouse;
            }
        });
        setSelections(initial);
    }, [items]);

    const handleSelect = (itemKey, warehouse) => {
        setSelections(prev => ({
            ...prev,
            [itemKey]: warehouse
        }));
    };

    const handleConfirm = () => {
        // Check if all items have been selected
        const allSelected = items.every(item => selections[item.id || item.sku]);

        if (!allSelected) {
            alert('Please select a warehouse for all items');
            return;
        }

        onConfirm(selections);
    };

    return (
        <div className="fixed inset-0 bg-black/95 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-gray-900 border-t-4 sm:border-2 border-orange-500 rounded-t-2xl sm:rounded-xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="bg-gray-900 border-b border-orange-500/30 p-4 sm:p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="text-orange-400 flex-shrink-0" size={28} />
                        <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-orange-400">
                                {singleMode ? 'Change Warehouse' : 'Choose Warehouse'}
                            </h2>
                            <p className="text-orange-300/60 text-xs sm:text-sm">
                                {singleMode ? 'Change location for this specific line' : 'Select where to pick each item'}
                            </p>
                        </div>
                    </div>
                    {singleMode && (
                        <button onClick={onCancel} className="text-gray-500 hover:text-white p-2">
                            <X size={24} />
                        </button>
                    )}
                </div>

                {/* Items List */}
                <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                    {items.map((item) => {
                        const itemKey = item.id || item.sku;
                        return (
                            <div key={itemKey} className="bg-gray-800/50 border border-orange-500/10 rounded-xl p-4">
                                {/* SKU Header */}
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-lg sm:text-xl font-bold text-white font-mono truncate">
                                            {item.sku}
                                        </div>
                                        <div className="text-orange-300/60 text-sm">
                                            Quantity: {item.qty} units
                                        </div>
                                    </div>
                                    <Package className="text-orange-400 flex-shrink-0 ml-2" size={24} />
                                </div>

                                {/* Warehouse Options */}
                                <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3">
                                    {/* Ludlow Option */}
                                    <button
                                        onClick={() => handleSelect(itemKey, 'ludlow')}
                                        className={`p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${selections[itemKey] === 'ludlow'
                                                ? 'bg-green-500/10 border-green-500 shadow-lg shadow-green-500/10'
                                                : 'bg-gray-700/30 border-gray-700 hover:border-green-500/50'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <Warehouse size={18} className={selections[itemKey] === 'ludlow' ? 'text-green-400' : 'text-gray-400'} />
                                                <span className={`font-bold ${selections[itemKey] === 'ludlow' ? 'text-green-400' : 'text-gray-300'}`}>Ludlow</span>
                                            </div>
                                            {selections[itemKey] === 'ludlow' && <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-black text-xs font-bold">✓</div>}
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-sm text-gray-400"><span className="opacity-50">Stock:</span> <span className={selections[itemKey] === 'ludlow' ? 'text-green-300' : ''}>{item.ludlow.available}</span></div>
                                            <div className="text-sm text-gray-400"><span className="opacity-50">Loc:</span> <span className={selections[itemKey] === 'ludlow' ? 'text-green-300' : ''}>{item.ludlow.location}</span></div>
                                        </div>
                                        {!item.ludlow.hasStock && (
                                            <div className="mt-2 text-red-400 text-[10px] font-bold bg-red-500/10 px-2 py-1 rounded uppercase tracking-wider">Insufficient stock</div>
                                        )}
                                    </button>

                                    {/* ATS Option */}
                                    <button
                                        onClick={() => handleSelect(itemKey, 'ats')}
                                        className={`p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${selections[itemKey] === 'ats'
                                                ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/10'
                                                : 'bg-gray-700/30 border-gray-700 hover:border-blue-500/50'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <Warehouse size={18} className={selections[itemKey] === 'ats' ? 'text-blue-400' : 'text-gray-400'} />
                                                <span className={`font-bold ${selections[itemKey] === 'ats' ? 'text-blue-400' : 'text-gray-300'}`}>ATS Grid</span>
                                            </div>
                                            {selections[itemKey] === 'ats' && <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">✓</div>}
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-sm text-gray-400"><span className="opacity-50">Stock:</span> <span className={selections[itemKey] === 'ats' ? 'text-blue-300' : ''}>{item.ats.available}</span></div>
                                            <div className="text-sm text-gray-400"><span className="opacity-50">Loc:</span> <span className={selections[itemKey] === 'ats' ? 'text-blue-300' : ''}>{item.ats.location}</span></div>
                                        </div>
                                        {!item.ats.hasStock && (
                                            <div className="mt-2 text-red-400 text-[10px] font-bold bg-red-500/10 px-2 py-1 rounded uppercase tracking-wider">Insufficient stock</div>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="bg-gray-900 border-t border-orange-500/30 p-4 sm:p-6 flex flex-col sm:flex-row gap-3">
                    <button
                        onClick={onCancel}
                        className="w-full sm:flex-1 px-6 py-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="w-full sm:flex-1 px-6 py-4 bg-orange-500 hover:bg-orange-400 text-black rounded-xl font-bold transition-colors shadow-lg shadow-orange-500/20"
                    >
                        Confirm Selection
                    </button>
                </div>
            </div>
        </div>
    );
}
