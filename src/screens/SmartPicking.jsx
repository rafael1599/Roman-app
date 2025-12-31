import { useState, useMemo } from 'react';
import { Scan, Package, AlertCircle, CheckCircle, XCircle, Undo, Edit3 } from 'lucide-react';
import CamScanner from '../features/smart-picking/components/CamScanner';
import PalletVerification from '../features/smart-picking/components/PalletVerification';
import WarehouseSelectionModal from '../features/smart-picking/components/WarehouseSelectionModal';
import SKUEditorModal from '../features/smart-picking/components/SKUEditorModal';
import { useOrderProcessing } from '../features/smart-picking/hooks/useOrderProcessing';
import { useInventory } from '../hooks/useInventoryData';
import AutocompleteInput from '../components/ui/AutocompleteInput';

export default function SmartPicking() {
    const [showScanner, setShowScanner] = useState(false);
    const [showVerification, setShowVerification] = useState(false);
    const [showWarehouseSelection, setShowWarehouseSelection] = useState(false);
    const [showSKUEditor, setShowSKUEditor] = useState(false);
    const [manualSearchValue, setManualSearchValue] = useState('');
    const [pickedItems, setPickedItems] = useState(new Set());
    const [pendingOrder, setPendingOrder] = useState(null);
    const [itemsNeedingSelection, setItemsNeedingSelection] = useState([]);
    const [itemsNotFound, setItemsNotFound] = useState([]);
    const [lastScannedItems, setLastScannedItems] = useState([]);

    const {
        currentOrder,
        processOrder,
        rollbackOrder,
        executeDeduction,
        completePallet,
    } = useOrderProcessing();

    const { inventoryData } = useInventory();

    /**
     * Handle successful scan
     */
    const handleScanComplete = (scannedItems) => {
        setShowScanner(false);
        setLastScannedItems(scannedItems);

        // Process the order (this will validate items)
        const order = processOrder(scannedItems);
        console.log('Order processed:', order);

        // Check if any items were not found
        const notFound = order.shortageItems.filter(
            item => item.status === 'not_found'
        );

        if (notFound.length > 0) {
            console.log('⚠️ Items not found:', notFound);
            setItemsNotFound(notFound);
            // Don't show the editor automatically, let user click the button
        }

        // Check if any items need warehouse selection
        const needsSelection = order.validatedItems.filter(
            item => item.status === 'needs_warehouse_selection'
        );

        if (needsSelection.length > 0) {
            console.log('⚠️ Items need warehouse selection:', needsSelection);

            // Group by SKU to avoid showing same SKU twice in modal
            const uniqueNeeds = Array.from(needsSelection.reduce((acc, item) => {
                const existing = acc.get(item.sku);
                if (!existing) {
                    acc.set(item.sku, { ...item });
                } else {
                    // Update total quantity being requested for this SKU
                    existing.qty += item.qty;
                    // Update stock sufficiency check for both warehouses based on new total qty
                    existing.ludlow.hasStock = existing.ludlow.available >= existing.qty;
                    existing.ats.hasStock = existing.ats.available >= existing.qty;
                }
                return acc;
            }, new Map()).values());

            setItemsNeedingSelection(uniqueNeeds);
            setPendingOrder(order);
            setShowWarehouseSelection(true);
        }
    };

    /**
     * Handle warehouse selection confirmation
     */
    const handleWarehouseSelectionConfirm = (selections) => {
        console.log('✅ Applying warehouse selections:', selections);
        setShowWarehouseSelection(false);

        // Reprocess the order with warehouse preferences
        if (lastScannedItems.length > 0) {
            // If there's an existing draft order, we should replace it
            if (currentOrder) {
                rollbackOrder(currentOrder.id);
            }
            processOrder(lastScannedItems, selections);
        }

        setItemsNeedingSelection([]);
        setPendingOrder(null);
    };

    /**
     * Handle warehouse selection cancel
     */
    const handleWarehouseSelectionCancel = () => {
        setShowWarehouseSelection(false);
        setItemsNeedingSelection([]);
        setPendingOrder(null);

        // Rollback the pending order
        if (pendingOrder) {
            rollbackOrder(pendingOrder.id);
        }
    };

    /**
     * Toggle item as picked
     */
    const togglePicked = (itemKey) => {
        const newPicked = new Set(pickedItems);
        if (newPicked.has(itemKey)) {
            newPicked.delete(itemKey);
        } else {
            newPicked.add(itemKey);
        }
        setPickedItems(newPicked);
    };

    /**
     * Handle pallet verification
     */
    const handleVerificationComplete = (result) => {
        setShowVerification(false);
        setPickedItems(new Set());

        // Move to next pallet
        if (currentOrder) {
            completePallet(currentOrder.currentPalletIndex);
        }
    };

    /**
     * Handle manual SKU addition
     */
    const handleAddManualSKU = (sku, qty) => {
        const item = { sku, qty: parseInt(qty) };
        const newScanned = [...lastScannedItems, item];
        setLastScannedItems(newScanned);

        // Reprocess
        if (currentOrder) {
            rollbackOrder(currentOrder.id);
        }
        handleScanComplete(newScanned);
    };

    /**
     * Remove item from scanned list
     */
    const handleRemoveItem = (sku) => {
        const newScanned = lastScannedItems.filter(item => item.sku !== sku);
        setLastScannedItems(newScanned);

        if (currentOrder) {
            rollbackOrder(currentOrder.id);
        }
        handleScanComplete(newScanned);
    };

    /**
     * Handle SKU corrections
     */
    const handleSKUCorrections = (corrections) => {
        console.log('✅ SKU corrections:', corrections);
        setShowSKUEditor(false);

        // Create new scanned items with corrections
        const correctedItems = lastScannedItems.map(item => {
            const correction = corrections.find(c => c.original === item.sku);
            if (correction) {
                return { ...item, sku: correction.corrected };
            }
            return item;
        });

        // Reprocess the order with corrected SKUs
        setLastScannedItems(correctedItems);
        if (currentOrder) {
            rollbackOrder(currentOrder.id);
        }
        handleScanComplete(correctedItems);
    };

    /**
     * Rollback current order
     */
    const handleRollback = () => {
        if (currentOrder && confirm('Are you sure you want to cancel this order? Inventory will be restored.')) {
            rollbackOrder(currentOrder.id);
            setPickedItems(new Set());
            setItemsNotFound([]);
            setLastScannedItems([]);
        }
    };

    /**
     * Handle Manual Search Selection
     */
    const handleManualItemSelect = (suggestion) => {
        handleAddManualSKU(suggestion.value, 1);
        setManualSearchValue('');
    };

    const currentPallet = currentOrder?.pallets[currentOrder.currentPalletIndex];
    const totalPallets = currentOrder?.pallets.length || 0;
    const currentPalletNumber = currentOrder ? currentOrder.currentPalletIndex + 1 : 0;
    const allItemsPicked = currentPallet?.every((item, idx) =>
        pickedItems.has(`${currentOrder.currentPalletIndex}-${idx}`)
    );

    // Prepare SKU suggestions for the top search bar
    const skuSuggestions = useMemo(() => {
        const skuMap = new Map();
        inventoryData.forEach(inv => {
            if (!inv.SKU) return;
            const info = `${inv.Warehouse} • ${inv.Location} • ${inv.Quantity || 0} units`;
            if (skuMap.has(inv.SKU)) {
                skuMap.get(inv.SKU).info += ` | ${info}`;
            } else {
                skuMap.set(inv.SKU, { value: inv.SKU, info });
            }
        });
        return Array.from(skuMap.values());
    }, [inventoryData]);

    return (
        <div className="min-h-screen bg-gray-950 p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Package className="text-green-400" size={32} />
                        <h1 className="text-2xl md:text-3xl font-bold text-green-400">Smart Picking</h1>
                    </div>

                    {currentOrder && (
                        <button
                            onClick={handleRollback}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-600/10 border border-red-500/30 hover:bg-red-600/20 text-red-400 rounded-lg text-sm transition-colors"
                        >
                            <Undo size={16} />
                            Reset
                        </button>
                    )}
                </div>

                {/* UNIFIED BUILDER VIEW (Show if no order or if draft) */}
                {(!currentOrder || currentOrder.status === 'draft') && (
                    <div className="space-y-6">
                        {/* Hybrid Input Box */}
                        <div className="bg-gray-900 border-2 border-green-500/20 rounded-2xl p-4 md:p-6 shadow-xl">
                            <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-4">
                                {/* Scan Button */}
                                <button
                                    onClick={() => setShowScanner(true)}
                                    className="h-[120px] md:h-full flex flex-col items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black rounded-xl transition-all shadow-lg active:scale-95 group"
                                >
                                    <Scan size={32} className="group-hover:scale-110 transition-transform" />
                                    <span className="font-bold text-sm">Scan / Photo</span>
                                </button>

                                {/* Manual Search */}
                                <div className="space-y-4">
                                    <h3 className="text-green-400 text-sm font-bold uppercase tracking-widest">Manual Order Entry</h3>
                                    <div className="relative">
                                        <AutocompleteInput
                                            placeholder="Type SKU to add manually..."
                                            value={manualSearchValue}
                                            onChange={setManualSearchValue}
                                            suggestions={skuSuggestions}
                                            onSelect={handleManualItemSelect}
                                            minChars={1}
                                            className="w-full bg-gray-950 border-2 border-gray-800 focus:border-green-500/50 rounded-xl px-4 py-4 text-white font-mono text-lg"
                                        />
                                    </div>
                                    <p className="text-gray-500 text-xs italic">
                                        Tip: You can scan a photo and then add more items manually using the search above.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Inventory Deduction Button (Sticky-ish) */}
                        {currentOrder && currentOrder.validatedItems.length > 0 && (
                            <div className="bg-blue-500/10 border-2 border-blue-500/30 rounded-2xl p-6 text-center animate-in zoom-in-95 duration-300">
                                <p className="text-blue-300 mb-4 text-sm font-medium">
                                    Ready! Click to deduct stock and generate the optimized picking route.
                                </p>
                                <button
                                    onClick={executeDeduction}
                                    disabled={currentOrder.validatedItems.some(i => i.status === 'not_found')}
                                    className={`w-full py-5 rounded-xl font-black text-2xl tracking-tight transition-all shadow-2xl ${currentOrder.validatedItems.some(i => i.status === 'not_found')
                                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                                        : 'bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/20 active:scale-[0.98]'
                                        }`}
                                >
                                    {currentOrder.validatedItems.some(i => i.status === 'not_found')
                                        ? 'Fix Unknown SKUs to Continue'
                                        : 'VERIFY & DEDUCT INVENTORY'}
                                </button>
                            </div>
                        )}

                        {/* Draft List Container */}
                        <div className="bg-gray-900 border-2 border-gray-800 rounded-2xl overflow-hidden min-h-[300px] flex flex-col">
                            <div className="bg-gray-800/50 px-6 py-3 border-b border-gray-800 flex justify-between items-center">
                                <h3 className="text-gray-300 font-bold">Current Draft</h3>
                                <div className="flex items-center gap-2">
                                    {currentOrder?.validatedItems?.some(i => i.status === 'not_found') && (
                                        <button
                                            onClick={() => setShowSKUEditor(true)}
                                            className="bg-orange-500 hover:bg-orange-400 text-black px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Fix Issues
                                        </button>
                                    )}
                                    <span className="bg-gray-700 text-gray-400 px-2 py-0.5 rounded text-xs font-mono">
                                        {currentOrder?.validatedItems?.length || 0} Lines
                                    </span>
                                </div>
                            </div>

                            <div className="p-4 flex-1 space-y-3">
                                {(!currentOrder || currentOrder.validatedItems.length === 0) ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-600 py-12">
                                        <Package size={48} className="mb-2 opacity-20" />
                                        <p className="font-medium">No items added to this order yet.</p>
                                        <p className="text-sm opacity-60">Use the camera or search bar above.</p>
                                    </div>
                                ) : (
                                    currentOrder.validatedItems.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex items-center justify-between p-4 rounded-xl border animate-in fade-in slide-in-from-left-2 duration-200 ${item.status === 'not_found'
                                                ? 'bg-red-500/5 border-red-500/30'
                                                : 'bg-gray-800/40 border-gray-700'
                                                }`}
                                        >
                                            <div className="flex-1">
                                                <div className="text-white font-mono font-bold text-lg leading-tight">{item.sku}</div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {item.status === 'not_found' ? (
                                                        <span className="text-red-400 text-[10px] font-black bg-red-400/10 px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                                                            <AlertCircle size={10} /> Unknown SKU
                                                        </span>
                                                    ) : (
                                                        <span className="text-green-500/60 text-[11px] font-bold">
                                                            Loc: <span className="text-green-400">{item.location}</span>
                                                        </span>
                                                    )}
                                                    <span className="text-gray-600 text-[10px] font-mono">{item.warehouse || '...'}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="text-yellow-400 font-bold text-2xl">x{item.qty}</div>
                                                <button
                                                    onClick={() => handleRemoveItem(item.sku)}
                                                    className="p-2 bg-gray-700/50 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded-lg transition-all"
                                                >
                                                    <XCircle size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Active Order - In Progress (Optimized Route) */}
                {currentOrder && currentOrder.status === 'in_progress' && currentPallet && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* Order Info */}
                        <div className="bg-gray-900 border-2 border-green-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                            <div className="flex items-center justify-between mb-4 relative z-10">
                                <div>
                                    <h2 className="text-xl font-bold text-green-400">
                                        Picking List: Order {currentOrder.id.slice(0, 8)}
                                    </h2>
                                    <p className="text-green-300/60 text-sm">
                                        Route optimized for minimum travel distance
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-green-400">
                                        Pallet {currentPalletNumber} / {totalPallets}
                                    </div>
                                    <div className="text-green-300/60 text-sm">
                                        {currentPallet.reduce((sum, item) => sum + item.qty, 0)} items on this pallet
                                    </div>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-gray-800 rounded-full h-3 p-0.5 relative z-10">
                                <div
                                    className="bg-green-500 h-2 rounded-full transition-all duration-700 shadow-[0_0_15px_rgba(34,197,94,0.6)]"
                                    style={{ width: `${(currentPalletNumber / totalPallets) * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* Shortage Warning */}
                        {currentOrder.shortageItems.filter(item => item.status === 'shortage').length > 0 && (
                            <div className="bg-red-500/10 border-l-4 border-red-500 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
                                    <div>
                                        <div className="text-red-400 font-bold">Stock Shortages!</div>
                                        <div className="text-red-300/80 text-sm mt-1 space-y-1">
                                            {currentOrder.shortageItems
                                                .filter(item => item.status === 'shortage')
                                                .map((item, idx) => (
                                                    <div key={idx} className="font-mono">
                                                        {item.sku}: Only {item.available || 0} left in stock
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Picking List */}
                        <div className="bg-gray-900 border-2 border-green-500/30 rounded-2xl p-6 shadow-xl">
                            <h3 className="text-xl font-bold text-green-400 mb-6 flex items-center gap-2">
                                <Scan size={20} /> Efficient Picking Order:
                            </h3>
                            <div className="space-y-4">
                                {currentPallet.map((item, idx) => {
                                    const itemKey = `${currentOrder.currentPalletIndex}-${idx}`;
                                    const isPicked = pickedItems.has(itemKey);

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => togglePicked(itemKey)}
                                            className={`w-full p-5 rounded-xl border-2 transition-all text-left relative overflow-hidden group ${isPicked
                                                ? 'bg-green-500/10 border-green-500 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]'
                                                : 'bg-gray-800/40 border-gray-700 hover:border-green-500/50 hover:bg-gray-800/60'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between relative z-10">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${isPicked
                                                            ? 'bg-green-500 border-green-500 scale-105 shadow-lg shadow-green-500/20'
                                                            : 'border-gray-600 group-hover:border-green-500/50'
                                                            }`}>
                                                            {isPicked ? <CheckCircle className="text-black" size={28} /> : <span className="text-gray-500 font-black">{idx + 1}</span>}
                                                        </div>
                                                        <div>
                                                            <div className={`font-mono font-black text-2xl tracking-tighter transition-colors ${isPicked ? 'text-green-400' : 'text-white'}`}>
                                                                {item.sku}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-gray-500 text-[10px] uppercase font-black">Location:</span>
                                                                <span className={`px-2 py-0.5 rounded text-sm font-black ${isPicked ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-white'}`}>
                                                                    {item.location}
                                                                </span>
                                                                {item.locationDetail && (
                                                                    <span className="text-gray-400 text-xs font-mono">[{item.locationDetail}]</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`text-4xl font-black transition-colors ${isPicked ? 'text-green-400' : 'text-yellow-400'}`}>
                                                        {item.qty}
                                                    </div>
                                                    <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest">units</div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Floating Action Button for completion */}
                        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-950/80 backdrop-blur-md border-t border-gray-800 md:relative md:bg-transparent md:border-0 md:p-0">
                            <button
                                onClick={() => setShowVerification(true)}
                                disabled={!allItemsPicked}
                                className={`w-full py-5 rounded-2xl font-black text-xl tracking-widest transition-all shadow-2xl ${allItemsPicked
                                    ? 'bg-green-500 hover:bg-green-400 text-black shadow-green-500/30 active:scale-95'
                                    : 'bg-gray-800 text-gray-600 cursor-not-allowed uppercase'
                                    }`}
                            >
                                {allItemsPicked ? 'VERIFY PALLET PHOTO' : `Progress: ${pickedItems.size} / ${currentPallet.length}`}
                            </button>
                        </div>
                    </div>
                )}

                {/* Active Order - Completed */}
                {currentOrder && currentOrder.status === 'completed' && (
                    <div className="bg-green-500/5 border-2 border-green-500 rounded-3xl p-12 text-center shadow-2xl animate-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-500/40">
                            <CheckCircle className="text-black" size={64} />
                        </div>
                        <h2 className="text-4xl font-black text-white mb-2 uppercase tracking-tighter">
                            Job Complete!
                        </h2>
                        <p className="text-green-400/60 mb-10 max-w-sm mx-auto font-medium">
                            The warehouse inventory has been updated. You're ready for the next order.
                        </p>
                        <button
                            onClick={() => {
                                setLastScannedItems([]);
                                setCurrentOrder(null);
                            }}
                            className="px-16 py-6 bg-white hover:bg-gray-100 text-black font-black text-2xl rounded-2xl transition-all shadow-xl active:scale-95"
                        >
                            START NEW ORDER
                        </button>
                    </div>
                )}
            </div>

            {/* Modals */}
            {showScanner && (
                <CamScanner
                    onScanComplete={handleScanComplete}
                    onCancel={() => setShowScanner(false)}
                />
            )}

            {showVerification && currentPallet && (
                <PalletVerification
                    expectedItems={currentPallet.map(item => ({
                        sku: item.sku,
                        qty: item.qty,
                    }))}
                    palletNumber={currentPalletNumber}
                    onVerified={handleVerificationComplete}
                    onCancel={() => setShowVerification(false)}
                />
            )}

            {showWarehouseSelection && itemsNeedingSelection.length > 0 && (
                <WarehouseSelectionModal
                    items={itemsNeedingSelection}
                    onConfirm={handleWarehouseSelectionConfirm}
                    onCancel={handleWarehouseSelectionCancel}
                />
            )}

            {showSKUEditor && itemsNotFound.length > 0 && (
                <SKUEditorModal
                    items={itemsNotFound}
                    inventory={inventoryData}
                    onConfirm={handleSKUCorrections}
                    onCancel={() => setShowSKUEditor(false)}
                />
            )}
        </div>
    );
}
