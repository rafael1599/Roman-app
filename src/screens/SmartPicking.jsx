import { useState } from 'react';
import { Scan, Package, AlertCircle, CheckCircle, XCircle, Undo, Edit3 } from 'lucide-react';
import CamScanner from '../features/smart-picking/components/CamScanner';
import PalletVerification from '../features/smart-picking/components/PalletVerification';
import WarehouseSelectionModal from '../features/smart-picking/components/WarehouseSelectionModal';
import SKUEditorModal from '../features/smart-picking/components/SKUEditorModal';
import { useOrderProcessing } from '../features/smart-picking/hooks/useOrderProcessing';
import { useInventory } from '../hooks/useInventoryData';

export default function SmartPicking() {
    const [showScanner, setShowScanner] = useState(false);
    const [showVerification, setShowVerification] = useState(false);
    const [showWarehouseSelection, setShowWarehouseSelection] = useState(false);
    const [showSKUEditor, setShowSKUEditor] = useState(false);
    const [pickedItems, setPickedItems] = useState(new Set());
    const [pendingOrder, setPendingOrder] = useState(null);
    const [itemsNeedingSelection, setItemsNeedingSelection] = useState([]);
    const [itemsNotFound, setItemsNotFound] = useState([]);
    const [lastScannedItems, setLastScannedItems] = useState([]);

    const {
        currentOrder,
        processOrder,
        rollbackOrder,
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
            setItemsNeedingSelection(needsSelection);
            setPendingOrder(order);
            setShowWarehouseSelection(true);
        }
    };

    /**
     * Handle warehouse selection confirmation
     */
    const handleWarehouseSelectionConfirm = (selections) => {
        console.log('✅ Warehouse selections:', selections);
        setShowWarehouseSelection(false);

        // TODO: Apply warehouse selections to the order
        // This will require updating the processOrder function to accept warehouse preferences

        // For now, just close the modal
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

    const currentPallet = currentOrder?.pallets[currentOrder.currentPalletIndex];
    const totalPallets = currentOrder?.pallets.length || 0;
    const currentPalletNumber = currentOrder ? currentOrder.currentPalletIndex + 1 : 0;
    const allItemsPicked = currentPallet?.every((item, idx) =>
        pickedItems.has(`${currentOrder.currentPalletIndex}-${idx}`)
    );

    return (
        <div className="min-h-screen bg-gray-950 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <Package className="text-green-400" size={32} />
                        <h1 className="text-3xl font-bold text-green-400">Smart Picking</h1>
                    </div>

                    {currentOrder && (
                        <button
                            onClick={handleRollback}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/50 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                        >
                            <Undo size={20} />
                            Cancel Order
                        </button>
                    )}
                </div>

                {/* No Active Order */}
                {!currentOrder && (
                    <div className="space-y-6">
                        <div className="bg-gray-900 border-2 border-green-500/30 rounded-xl p-8 text-center">
                            <Scan className="text-green-400 mx-auto mb-4" size={64} />
                            <h2 className="text-2xl font-bold text-green-400 mb-2">
                                Ready to Scan
                            </h2>
                            <p className="text-green-300/60 mb-6">
                                Scan an order invoice to start the picking process
                            </p>
                            <button
                                onClick={() => setShowScanner(true)}
                                className="px-8 py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-lg transition-colors"
                            >
                                Scan New Order
                            </button>
                        </div>

                        {/* Info */}
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <div className="text-blue-400 text-xl">ℹ️</div>
                                <div className="text-blue-300 text-sm">
                                    <strong>How it works:</strong>
                                    <ol className="list-decimal list-inside mt-2 space-y-1">
                                        <li>Scan the order invoice with your camera</li>
                                        <li>AI extracts SKUs and quantities automatically</li>
                                        <li>Inventory is deducted in real-time</li>
                                        <li>Follow the optimized picking route</li>
                                        <li>Verify each pallet with a photo</li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active Order - Completed */}
                {currentOrder && currentOrder.status === 'completed' && (
                    <div className="bg-green-500/10 border-2 border-green-500 rounded-xl p-8 text-center">
                        <CheckCircle className="text-green-400 mx-auto mb-4" size={64} />
                        <h2 className="text-2xl font-bold text-green-400 mb-2">
                            Order Complete! 🎉
                        </h2>
                        <p className="text-green-300/60 mb-6">
                            Order {currentOrder.id} has been successfully picked and verified.
                        </p>
                        <button
                            onClick={() => setShowScanner(true)}
                            className="px-8 py-4 bg-green-500 hover:bg-green-400 text-black font-bold text-lg rounded-lg transition-colors"
                        >
                            Scan Next Order
                        </button>
                    </div>
                )}

                {/* Active Order - In Progress */}
                {currentOrder && currentOrder.status === 'in_progress' && currentPallet && (
                    <div className="space-y-6">
                        {/* Order Info */}
                        <div className="bg-gray-900 border-2 border-green-500/30 rounded-xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-bold text-green-400">
                                        Order {currentOrder.id}
                                    </h2>
                                    <p className="text-green-300/60 text-sm">
                                        {new Date(currentOrder.timestamp).toLocaleString()}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-green-400">
                                        Pallet {currentPalletNumber} / {totalPallets}
                                    </div>
                                    <div className="text-green-300/60 text-sm">
                                        {currentPallet.reduce((sum, item) => sum + item.qty, 0)} items
                                    </div>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-gray-800 rounded-full h-2">
                                <div
                                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${(currentPalletNumber / totalPallets) * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* Not Found Warning - CRITICAL */}
                        {currentOrder.shortageItems.filter(item => item.status === 'not_found').length > 0 && (
                            <div className="bg-orange-500/10 border-2 border-orange-500 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <XCircle className="text-orange-400 flex-shrink-0" size={24} />
                                    <div className="flex-1">
                                        <div className="text-orange-400 font-bold text-lg">⚠️ SKUs Not Found in Inventory</div>
                                        <div className="text-orange-300/80 text-sm mt-2">
                                            The following SKUs were not found. They may have different formatting in your inventory:
                                        </div>
                                        <div className="mt-3 space-y-2">
                                            {currentOrder.shortageItems
                                                .filter(item => item.status === 'not_found')
                                                .map((item, idx) => (
                                                    <div key={idx} className="bg-orange-500/10 border border-orange-500/30 rounded p-3">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <div className="text-orange-300 font-mono font-bold">
                                                                    {item.sku}
                                                                </div>
                                                                <div className="text-orange-300/60 text-xs mt-1">
                                                                    Quantity needed: {item.qty}
                                                                </div>
                                                            </div>
                                                            {item.suggestions && item.suggestions.length > 0 && (
                                                                <div className="text-right">
                                                                    <div className="text-orange-300/60 text-xs">Similar SKUs:</div>
                                                                    <div className="text-orange-300 text-sm font-mono">
                                                                        {item.suggestions.join(', ')}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                        <div className="mt-4 flex items-center gap-3">
                                            <button
                                                onClick={() => setShowSKUEditor(true)}
                                                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg transition-colors"
                                            >
                                                <Edit3 size={18} />
                                                Edit SKUs
                                            </button>
                                            <div className="text-orange-300/80 text-xs">
                                                💡 <strong>Tip:</strong> Click to manually correct or select from suggestions
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Shortage Warning */}
                        {currentOrder.shortageItems.filter(item => item.status === 'shortage').length > 0 && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
                                    <div>
                                        <div className="text-red-400 font-semibold">Items with Shortage:</div>
                                        <div className="text-red-300/80 text-sm mt-2 space-y-1">
                                            {currentOrder.shortageItems
                                                .filter(item => item.status === 'shortage')
                                                .map((item, idx) => (
                                                    <div key={idx}>
                                                        {item.sku}: Need {item.qty}, Available {item.available || 0}
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Picking List */}
                        <div className="bg-gray-900 border-2 border-green-500/30 rounded-xl p-6">
                            <h3 className="text-xl font-bold text-green-400 mb-4">
                                Pick These Items:
                            </h3>
                            <div className="space-y-3">
                                {currentPallet.map((item, idx) => {
                                    const itemKey = `${currentOrder.currentPalletIndex}-${idx}`;
                                    const isPicked = pickedItems.has(itemKey);

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => togglePicked(itemKey)}
                                            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${isPicked
                                                ? 'bg-green-500/20 border-green-500'
                                                : 'bg-gray-800/50 border-gray-700 hover:border-green-500/50'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${isPicked
                                                            ? 'bg-green-500 border-green-500'
                                                            : 'border-gray-600'
                                                            }`}>
                                                            {isPicked && <CheckCircle className="text-black" size={20} />}
                                                        </div>
                                                        <div>
                                                            <div className="text-green-400 font-bold text-lg">
                                                                {item.sku}
                                                            </div>
                                                            <div className="text-green-300/60 text-sm">
                                                                Location: {item.location} {item.locationDetail && `(${item.locationDetail})`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-green-400 font-bold text-2xl">
                                                        {item.qty}
                                                    </div>
                                                    <div className="text-green-300/60 text-xs">
                                                        units
                                                    </div>
                                                    {item.isSplit && (
                                                        <div className="text-yellow-400 text-xs mt-1">
                                                            Split from {item.originalQty}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Verify Button */}
                        <button
                            onClick={() => setShowVerification(true)}
                            disabled={!allItemsPicked}
                            className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${allItemsPicked
                                ? 'bg-green-500 hover:bg-green-400 text-black'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {allItemsPicked ? 'Verify Pallet' : 'Mark All Items as Picked'}
                        </button>
                    </div>
                )}
            </div>

            {/* Scanner Modal */}
            {showScanner && (
                <CamScanner
                    onScanComplete={handleScanComplete}
                    onCancel={() => setShowScanner(false)}
                />
            )}

            {/* Verification Modal */}
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

            {/* Warehouse Selection Modal */}
            {showWarehouseSelection && itemsNeedingSelection.length > 0 && (
                <WarehouseSelectionModal
                    items={itemsNeedingSelection}
                    onConfirm={handleWarehouseSelectionConfirm}
                    onCancel={handleWarehouseSelectionCancel}
                />
            )}

            {/* SKU Editor Modal */}
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
