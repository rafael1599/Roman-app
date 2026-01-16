import React, { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventoryData';
import { useViewMode } from '../context/ViewModeContext';
import { SearchInput } from '../components/ui/SearchInput';
import { InventoryCard } from '../features/inventory/components/InventoryCard';
import { InventoryModal } from '../features/inventory/components/InventoryModal';
import { PickingCartDrawer } from '../features/picking/components/PickingCartDrawer';
import CamScanner from '../features/smart-picking/components/CamScanner';
import { useOrderProcessing } from '../features/smart-picking/hooks/useOrderProcessing';
import { naturalSort } from '../utils/sortUtils';
import { Plus, Warehouse, ArrowRightLeft } from 'lucide-react';
import { MovementModal } from '../features/inventory/components/MovementModal';
import { CapacityBar } from '../components/ui/CapacityBar';

import { usePickingSession } from '../hooks/usePickingSession';

export const InventoryScreen = () => {
    const { inventoryData, locationCapacities, updateQuantity, addItem, updateItem, moveItem, deleteItem, loading } = useInventory();
    const { viewMode } = useViewMode(); // 'stock' | 'picking'
    const { processOrder, executeDeduction, currentOrder } = useOrderProcessing();

    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [modalMode, setModalMode] = useState('add');
    const [selectedWarehouseForAdd, setSelectedWarehouseForAdd] = useState('LUDLOW');
    const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);

    // Picking Mode State (Now Server-Side)
    const {
        cartItems,
        setCartItems, // Exposed for scanner
        addToCart,
        updateCartQty,
        removeFromCart,
        isSaving
    } = usePickingSession();

    const [showScanner, setShowScanner] = useState(false);

    // --- Stock Mode Handlers ---
    const handleAddItem = (warehouse = 'LUDLOW') => {
        setModalMode('add');
        setSelectedWarehouseForAdd(warehouse);
        setEditingItem(null);
        setIsModalOpen(true);
    };

    const handleEditItem = (item) => {
        setModalMode('edit');
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleDelete = () => {
        if (editingItem) {
            deleteItem(editingItem.Warehouse, editingItem.SKU);
        }
    };

    const saveItem = (formData) => {
        const targetWarehouse = formData.Warehouse;
        if (modalMode === 'add') {
            addItem(targetWarehouse, formData);
        } else {
            updateItem(editingItem.Warehouse, editingItem.SKU, formData);
        }
    };

    const handleMoveStock = async (moveData) => {
        try {
            await moveItem(moveData.sourceItem, moveData.targetWarehouse, moveData.targetLocation, moveData.quantity);
            alert('Stock successfully moved!');
        } catch (err) {
            console.error('Error moving stock:', err);
            alert('Move failed: ' + err.message);
        }
    };

    const handleQuickMove = (item) => {
        // We reuse the MovementModal but skip step 1 in the future or just pre-fill it
        setEditingItem(item);
        setIsMovementModalOpen(true);
    };

    // --- Picking Mode Handlers ---

    const handleCardClick = (item) => {
        if (viewMode === 'stock') {
            handleEditItem(item);
        } else {
            // Picking Mode: Add to Cart
            addToCart(item);
        }
    };

    // Note: addToCart, updateCartQty, removeFromCart are now imported from hook
    // We removed the local implementations.


    const handleScanComplete = (scannedLines) => {
        // scannedLines is likely [{ sku, qty, ... }] (needs verification of structure)
        // Check SmartPicking.jsx logic: it seems it just gets raw data and processes it.
        // For now, let's assume it returns objects that we try to match against inventory.

        // This is a simplified "Add to Cart" logic for scanned items
        // We might not know location/warehouse yet if it's just a generated list.
        // However, for Unified Screen, we ideally want to map them to real items immediately if possible,
        // OR add them as "Pending Location Selection" items.
        // Given the requirement is to use "Current Draft", let's map them to a generic cart item if not found?
        // Actually, let's just create cart items with SKU and let the user resolve?
        // Wait, the user said "same logic as interactive warehouse label".
        // Let's create cart items. If we don't have location, we might need a way to resolve it.
        // BUT, simplified assumption: We match to LUDLOW or first found for now, or just add as raw items.

        const newItems = scannedLines.map(line => {
            // Try to find in current filtered data or global inventory to enrich?
            const match = inventoryData.find(i => i.SKU === line.sku);
            return match ? { ...match, pickingQty: line.qty || 1 } : { SKU: line.sku, pickingQty: line.qty || 1, Location: 'UNKNOWN', Warehouse: 'UNKNOWN' };
        });

        setCartItems(prev => [...prev, ...newItems]);
        setShowScanner(false);
    };

    const handleDeduct = async () => {
        if (cartItems.length === 0) return;

        const totalUnits = cartItems.reduce((acc, item) => acc + (item.pickingQty || 0), 0);
        const confirmDeduct = window.confirm(`Confirm deduction of ${totalUnits} units across ${cartItems.length} items from inventory?`);
        if (!confirmDeduct) return;

        try {
            // Deduct each item sequentially
            for (const item of cartItems) {
                const delta = -(item.pickingQty || 0);
                await updateQuantity(item.SKU, delta, item.Warehouse, item.Location);
            }

            alert("Deduction complete! Inventory has been updated.");
            setCartItems([]); // Clear cart after success
        } catch (error) {
            console.error("Deduction error:", error);
            alert("Error during deduction. Please check your internet connection.");
        }
    };


    // --- Data Processing ---
    const filteredData = useMemo(() => {
        const lowerSearch = search.toLowerCase();
        return inventoryData.filter(item => {
            const hasStock = (parseInt(item.Quantity) || 0) > 0;
            const matchesSearch = !search ||
                (item.SKU && item.SKU.toLowerCase().includes(lowerSearch)) ||
                (item.Location && item.Location.toLowerCase().includes(lowerSearch)) ||
                (item.Warehouse && item.Warehouse.toLowerCase().includes(lowerSearch));

            if (search) {
                // When searching, ONLY show items that have stock AND match
                return hasStock && matchesSearch;
            }
            // When browsing, show all items (including 0 qty) so locations/headers stay
            return matchesSearch;
        });
    }, [inventoryData, search]);

    const groupedData = useMemo(() => {
        const groups = {};
        filteredData.forEach(item => {
            const wh = item.Warehouse || 'UNKNOWN';
            const loc = item.Location || 'Unknown Location';

            if (!groups[wh]) groups[wh] = {};
            if (!groups[wh][loc]) groups[wh][loc] = [];

            groups[wh][loc].push(item);
        });
        return groups;
    }, [filteredData]);

    const sortedWarehouses = useMemo(() => {
        const warehouses = Object.keys(groupedData);
        return warehouses.sort((a, b) => {
            if (a === 'LUDLOW') return -1;
            if (b === 'LUDLOW') return 1;
            return a.localeCompare(b);
        });
    }, [groupedData]);

    if (loading) return <div className="p-8 text-center text-muted font-bold uppercase tracking-widest animate-pulse">Loading Global Inventory...</div>;

    return (
        <div className="pb-4 relative">
            <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search SKU, Loc, Warehouse..."
                mode={viewMode}
                onScanClick={() => setShowScanner(true)}
            />

            <div className="p-4 space-y-12">
                {sortedWarehouses.flatMap(wh =>
                    Object.keys(groupedData[wh]).sort(naturalSort).map(location => (
                        <div key={`${wh}-${location}`} className="space-y-4">
                            <div className="sticky top-[89px] bg-main/95 backdrop-blur-sm z-30 py-3 border-b border-subtle group">
                                <div className="flex items-center gap-4 px-1">
                                    {/* Capacity Bar Side (3/4 approx) - NOW ON LEFT */}
                                    <div className="flex-[3]">
                                        <CapacityBar
                                            current={locationCapacities[`${wh}-${location}`]?.current || 0}
                                            max={locationCapacities[`${wh}-${location}`]?.max || 550}
                                        />
                                    </div>

                                    {/* Info Side (1/3 approx) - NOW ON RIGHT */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-content text-xl font-black uppercase tracking-tighter truncate" title={location}>
                                            {location}
                                        </h3>
                                    </div>

                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-1">
                                {groupedData[wh][location]
                                    .filter(item => (parseInt(item.Quantity) || 0) > 0)
                                    .map((item, idx) => {
                                        // Check if item is in cart to highlight?
                                        const isInCart = cartItems.some(c => c.SKU === item.SKU && c.Warehouse === item.Warehouse && c.Location === item.Location);

                                        return (
                                            <div key={`${item.id || item.SKU}-${idx}`} className={isInCart ? 'ring-1 ring-accent rounded-lg' : ''}>
                                                <InventoryCard
                                                    sku={item.SKU}
                                                    quantity={item.Quantity}
                                                    detail={item.Location_Detail}
                                                    warehouse={item.Warehouse}
                                                    onIncrement={() => updateQuantity(item.SKU, 1, item.Warehouse, item.Location)}
                                                    onDecrement={() => updateQuantity(item.SKU, -1, item.Warehouse, item.Location)}
                                                    onMove={() => handleQuickMove(item)}
                                                    onClick={() => handleCardClick(item)}
                                                    mode={viewMode}
                                                />
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    ))
                )}

                {sortedWarehouses.length === 0 && (
                    <div className="text-center text-muted mt-20 py-20 border-2 border-dashed border-subtle rounded-3xl">
                        <Warehouse className="mx-auto mb-4 opacity-20" size={48} />
                        <p className="text-xl font-black uppercase tracking-widest opacity-30">No inventory found</p>
                    </div>
                )}
            </div>

            {/* Floating Action Buttons (Stock Mode Only) */}
            {viewMode === 'stock' && (
                <div className="fixed bottom-24 right-4 flex flex-col gap-3 z-40">
                    <button
                        onClick={() => handleAddItem('LUDLOW')}
                        className="w-16 h-16 ios-btn-primary shadow-2xl shadow-accent/40 active:scale-90 transition-transform"
                        title="Add New SKU"
                    >
                        <Plus size={32} strokeWidth={3} />
                    </button>
                </div>
            )}

            {/* Picking Cart Drawer (Picking Mode Only) */}
            {viewMode === 'picking' && (
                <PickingCartDrawer
                    cartItems={cartItems}
                    onUpdateQty={updateCartQty}
                    onRemoveItem={removeFromCart}
                    onDeduct={handleDeduct}
                />
            )}

            {/* Modals */}
            <InventoryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={saveItem}
                onDelete={handleDelete}
                initialData={editingItem}
                mode={modalMode}
                screenType={selectedWarehouseForAdd || (editingItem?.Warehouse)}
            />

            {showScanner && (
                <CamScanner
                    onScanComplete={handleScanComplete}
                    onCancel={() => setShowScanner(false)}
                />
            )}
            <MovementModal
                isOpen={isMovementModalOpen}
                onClose={() => setIsMovementModalOpen(false)}
                onMove={handleMoveStock}
                initialSourceItem={editingItem}
            />
        </div>
    );
};
