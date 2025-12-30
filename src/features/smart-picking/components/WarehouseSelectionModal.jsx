import { useState } from 'react';
import { Warehouse, Package, AlertCircle } from 'lucide-react';

/**
 * Warehouse Selection Modal
 * Mobile-first design for choosing warehouse when item is in both Ludlow and ATS
 */
export default function WarehouseSelectionModal({ items, onConfirm, onCancel }) {
    const [selections, setSelections] = useState({});

    const handleSelect = (sku, warehouse) => {
        setSelections(prev => ({
            ...prev,
            [sku]: warehouse
        }));
    };

    const handleConfirm = () => {
        // Check if all items have been selected
        const allSelected = items.every(item => selections[item.sku]);
        
        if (!allSelected) {
            alert('Please select a warehouse for all items');
            return;
        }

        onConfirm(selections);
    };

    return (
        <div className="fixed inset-0 bg-black/95 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-gray-900 border-t-4 sm:border-2 border-orange-500 rounded-t-2xl sm:rounded-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-gray-900 border-b border-orange-500/30 p-4 sm:p-6 z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <AlertCircle className="text-orange-400 flex-shrink-0" size={28} />
                        <h2 className="text-xl sm:text-2xl font-bold text-orange-400">
                            Choose Warehouse
                        </h2>
                    </div>
                    <p className="text-orange-300/80 text-sm">
                        Select where to pick each item:
                    </p>
                </div>

                {/* Items List */}
                <div className="p-4 sm:p-6 space-y-4">
                    {items.map((item) => (
                        <div key={item.sku} className="bg-gray-800/50 border border-orange-500/30 rounded-lg p-4">
                            {/* SKU Header */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex-1 min-w-0">
                                    <div className="text-lg sm:text-xl font-bold text-white font-mono truncate">
                                        {item.sku}
                                    </div>
                                    <div className="text-orange-300/60 text-sm">
                                        Need: {item.qty} units
                                    </div>
                                </div>
                                <Package className="text-orange-400 flex-shrink-0 ml-2" size={24} />
                            </div>

                            {/* Warehouse Options - Stacked on mobile, side-by-side on desktop */}
                            <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3">
                                {/* Ludlow Option */}
                                <button
                                    onClick={() => handleSelect(item.sku, 'ludlow')}
                                    className={`p - 4 rounded - lg border - 2 transition - all touch - manipulation ${
    selections[item.sku] === 'ludlow'
        ? 'bg-green-500/20 border-green-500 shadow-lg shadow-green-500/20'
        : 'bg-gray-700/30 border-gray-600 hover:border-green-500/50 active:bg-gray-700/50'
} `}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Warehouse size={20} className={
                                                selections[item.sku] === 'ludlow' ? 'text-green-400' : 'text-gray-400'
                                            } />
                                            <div className={`font - bold text - lg ${
    selections[item.sku] === 'ludlow' ? 'text-green-400' : 'text-gray-300'
} `}>
                                                Ludlow
                                            </div>
                                        </div>
                                        {selections[item.sku] === 'ludlow' && (
                                            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                                <div className="text-black text-lg">✓</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-left space-y-2">
                                        <div className={`text - base ${
    selections[item.sku] === 'ludlow' ? 'text-green-300' : 'text-gray-400'
} `}>
                                            <span className="font-semibold">Stock:</span> {item.ludlow.available}
                                        </div>
                                        <div className={`text - sm ${
    selections[item.sku] === 'ludlow' ? 'text-green-300' : 'text-gray-400'
} `}>
                                            <span className="font-semibold">Location:</span> {item.ludlow.location}
                                        </div>
                                        {!item.ludlow.hasStock && (
                                            <div className="text-red-400 text-sm font-semibold bg-red-500/10 px-2 py-1 rounded">
                                                ⚠️ Insufficient stock
                                            </div>
                                        )}
                                    </div>
                                </button>

                                {/* ATS Option */}
                                <button
                                    onClick={() => handleSelect(item.sku, 'ats')}
                                    className={`p - 4 rounded - lg border - 2 transition - all touch - manipulation ${
    selections[item.sku] === 'ats'
        ? 'bg-blue-500/20 border-blue-500 shadow-lg shadow-blue-500/20'
        : 'bg-gray-700/30 border-gray-600 hover:border-blue-500/50 active:bg-gray-700/50'
} `}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Warehouse size={20} className={
                                                selections[item.sku] === 'ats' ? 'text-blue-400' : 'text-gray-400'
                                            } />
                                            <div className={`font - bold text - lg ${
    selections[item.sku] === 'ats' ? 'text-blue-400' : 'text-gray-300'
} `}>
                                                ATS Grid
                                            </div>
                                        </div>
                                        {selections[item.sku] === 'ats' && (
                                            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                                <div className="text-white text-lg">✓</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-left space-y-2">
                                        <div className={`text - base ${
    selections[item.sku] === 'ats' ? 'text-blue-300' : 'text-gray-400'
} `}>
                                            <span className="font-semibold">Stock:</span> {item.ats.available}
                                        </div>
                                        <div className={`text - sm ${
    selections[item.sku] === 'ats' ? 'text-blue-300' : 'text-gray-400'
} `}>
                                            <span className="font-semibold">Location:</span> {item.ats.location}
                                        </div>
                                        {!item.ats.hasStock && (
                                            <div className="text-red-400 text-sm font-semibold bg-red-500/10 px-2 py-1 rounded">
                                                ⚠️ Insufficient stock
                                            </div>
                                        )}
                                    </div>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer - Sticky at bottom on mobile */}
                <div className="sticky bottom-0 bg-gray-900 border-t border-orange-500/30 p-4 sm:p-6 flex flex-col sm:flex-row gap-3">
                    <button
                        onClick={onCancel}
                        className="w-full sm:flex-1 px-6 py-4 bg-gray-700 hover:bg-gray-600 active:bg-gray-600 text-gray-300 rounded-lg font-semibold transition-colors text-lg touch-manipulation"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="w-full sm:flex-1 px-6 py-4 bg-orange-500 hover:bg-orange-400 active:bg-orange-400 text-black rounded-lg font-semibold transition-colors text-lg touch-manipulation"
                    >
                        Confirm Selection
                    </button>
                </div>
            </div>
        </div>
    );
}
