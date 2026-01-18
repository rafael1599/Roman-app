import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { useLocationManagement } from '../hooks/useLocationManagement';
import LocationEditorModal from '../features/warehouse-management/components/LocationEditorModal';

export const InventoryScreen = () => {
    const { inventoryData, locationCapacities, updateQuantity, addItem, updateItem, moveItem, deleteItem, loading } = useInventory();
    const { viewMode } = useViewMode(); // 'stock' | 'picking'
    const { processOrder, executeDeduction, currentOrder } = useOrderProcessing();

    const [search, setSearch] = useState('');
    useEffect(() => {
        setVisibleGroups(20);
    }, [search]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [modalMode, setModalMode] = useState('add');
    const [visibleGroups, setVisibleGroups] = useState(20);
    const [selectedWarehouseForAdd, setSelectedWarehouseForAdd] = useState('LUDLOW');
    const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
    const [locationBeingEdited, setLocationBeingEdited] = useState(null);

    const { isAdmin } = useAuth();
    const { locations: allMappedLocations, createLocation, updateLocation, deactivateLocation, refresh: refreshLocations } = useLocationManagement();

    // Picking Mode State (Now Server-Side)
    const {
        cartItems,
        setCartItems, // Exposed for scanner
        addToCart,
        updateCartQty,
        setCartQty,
        removeFromCart,
        isSaving
    } = usePickingSession();

    const [showScanner, setShowScanner] = useState(false);

    // --- Stock Mode Handlers ---
    const handleAddItem = useCallback((warehouse = 'LUDLOW') => {
        setModalMode('add');
        setSelectedWarehouseForAdd(warehouse);
        setEditingItem(null);
        setIsModalOpen(true);
    }, []);

    const handleEditItem = useCallback((item) => {
        setModalMode('edit');
        setEditingItem(item);
        setIsModalOpen(true);
    }, []);

    const handleDelete = useCallback(() => {
        if (editingItem) {
            deleteItem(editingItem.Warehouse, editingItem.SKU);
        }
    }, [editingItem, deleteItem]);

    const saveItem = useCallback((formData) => {
        const targetWarehouse = formData.Warehouse;
        if (modalMode === 'add') {
            addItem(targetWarehouse, formData);
        } else {
            updateItem(editingItem.Warehouse, editingItem.SKU, formData);
        }
    }, [modalMode, addItem, updateItem, editingItem]);

    const handleMoveStock = useCallback(async (moveData) => {
        try {
            await moveItem(moveData.sourceItem, moveData.targetWarehouse, moveData.targetLocation, moveData.quantity);
            alert('Stock successfully moved!');
        } catch (err) {
            console.error('Error moving stock:', err);
            alert('Move failed: ' + err.message);
        }
    }, [moveItem]);

    const handleQuickMove = useCallback((item) => {
        // We reuse the MovementModal but skip step 1 in the future or just pre-fill it
        setEditingItem(item);
        setIsMovementModalOpen(true);
    }, []);


    const handleOpenLocationEditor = useCallback((warehouse, locationName, locationId) => {
        if (!isAdmin || viewMode !== 'stock') return;

        // 1. Prioridad: Intento de coincidencia por ID exacto de la base de datos
        // (Esto resuelve problemas de duplicados como "9" vs "Row 9")
        let loc = null;
        if (locationId) {
            loc = allMappedLocations.find(l => l.id === locationId);
        }

        // 2. Coincidencia por Nombre Exacto
        if (!loc) {
            loc = allMappedLocations.find(l =>
                l.warehouse === warehouse &&
                l.location.toLowerCase() === locationName.toLowerCase()
            );
        }

        if (loc) {
            setLocationBeingEdited(loc);
        } else {
            // 3. Fallback: Si no existe en la base de datos de configuraciones, 
            // permitimos crearla al vuelo usando los datos del inventario como base.
            console.warn(`No DB record found for location "${locationName}" (Warehouse: ${warehouse}).`);

            setLocationBeingEdited({
                warehouse,
                location: locationName,
                max_capacity: 550,
                zone: 'UNASSIGNED',
                picking_order: 999,
                isNew: true
            });
        }
    }, [isAdmin, viewMode, allMappedLocations]);

    const handleSaveLocation = useCallback(async (formData) => {
        let result;
        if (locationBeingEdited?.isNew) {
            // Crear nueva ubicación
            const { isNew, ...dataToCreate } = formData;
            result = await createLocation(dataToCreate);
        } else {
            // Actualizar existente
            result = await updateLocation(locationBeingEdited.id, formData);
        }

        if (result.success) {
            setLocationBeingEdited(null);
            window.location.reload();
        } else {
            alert(`Error saving: ${result.error}`);
        }
    }, [locationBeingEdited, createLocation, updateLocation]);

    const handleDeleteLocation = useCallback(async (id) => {
        if (locationBeingEdited?.isNew) {
            // Caso especial: La ubicación no existe en la DB de configuraciones, 
            // pero el usuario quiere "eliminarla" de la vista de inventario.
            // Esto implica borrar o mover todos los SKUs que tengan ese string.
            const totalUnits = inventoryData
                .filter(i => i.Warehouse === locationBeingEdited.warehouse && i.Location === locationBeingEdited.location)
                .reduce((sum, i) => sum + (i.Quantity || 0), 0);

            const confirmMsg = `This is a "ghost" location (it only exists as text on ${totalUnits} inventory units). 
Do you want to PERMANENTLY DELETE all these products so the location disappears?`;

            if (window.confirm(confirmMsg)) {
                const itemsToDelete = inventoryData.filter(i =>
                    i.Warehouse === locationBeingEdited.warehouse &&
                    i.Location === locationBeingEdited.location
                );

                for (const item of itemsToDelete) {
                    await deleteItem(item.Warehouse, item.SKU);
                }

                setLocationBeingEdited(null);
                window.location.reload();
            }
            return;
        }

        const result = await deactivateLocation(id);
        if (result.success) {
            setLocationBeingEdited(null);
            window.location.reload();
        }
    }, [locationBeingEdited, inventoryData, deleteItem, deactivateLocation]);

    // --- Picking Mode Handlers ---

    const handleCardClick = useCallback((item) => {
        if (viewMode === 'stock') {
            handleEditItem(item);
        } else {
            // Picking Mode: Add to Cart
            addToCart(item);
        }
    }, [viewMode, handleEditItem, addToCart]);

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

    const handleDeduct = useCallback(async () => {
        if (cartItems.length === 0) return;

        const totalUnits = cartItems.reduce((acc, item) => acc + (item.pickingQty || 0), 0);
        const confirmDeduct = window.confirm(`Confirm deduction of ${totalUnits} units across ${cartItems.length} items from inventory?`);
        if (!confirmDeduct) return;

        try {
            // Elimination of Waterfall: Parallelize updates
            await Promise.all(cartItems.map(item => {
                const delta = -(item.pickingQty || 0);
                return updateQuantity(item.SKU, delta, item.Warehouse, item.Location);
            }));

            alert("Deduction complete! Inventory has been updated.");
            setCartItems([]);
        } catch (error) {
            console.error("Deduction error:", error);
            alert("Error during deduction. Please check your internet connection.");
        }
    }, [cartItems, updateQuantity, setCartItems]);


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
            const locName = item.Location || 'Unknown Location';

            if (!groups[wh]) groups[wh] = {};
            if (!groups[wh][locName]) {
                groups[wh][locName] = {
                    items: [],
                    locationId: item.location_id
                };
            }

            groups[wh][locName].items.push(item);
            // Prefer items that have a location_id to define the block's ID
            if (item.location_id && !groups[wh][locName].locationId) {
                groups[wh][locName].locationId = item.location_id;
            }
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

    // --- Pagination Logic ---
    const allLocationBlocks = useMemo(() => {
        return sortedWarehouses.flatMap(wh =>
            Object.keys(groupedData[wh]).sort(naturalSort).map(location => ({
                wh,
                location,
                items: groupedData[wh][location].items,
                locationId: groupedData[wh][location].locationId
            }))
        );
    }, [sortedWarehouses, groupedData]);

    const paginatedBlocks = useMemo(() => {
        return allLocationBlocks.slice(0, visibleGroups);
    }, [allLocationBlocks, visibleGroups]);

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
                {paginatedBlocks.map(({ wh, location, items, locationId }) => (
                    <div key={`${wh}-${location}`} className="space-y-4">
                        <div className="sticky top-[84px] bg-main/95 backdrop-blur-sm z-30 py-3 border-b border-subtle group">
                            <div className="flex items-center gap-4 px-1">
                                <div className="flex-[3]">
                                    <CapacityBar
                                        current={locationCapacities[`${wh}-${location}`]?.current || 0}
                                        max={locationCapacities[`${wh}-${location}`]?.max || 550}
                                    />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3
                                        className={`text-content text-xl font-black uppercase tracking-tighter truncate ${isAdmin && viewMode === 'stock' ? 'cursor-pointer hover:text-accent transition-colors' : ''}`}
                                        title={isAdmin && viewMode === 'stock' ? 'Click to edit location' : location}
                                        onClick={() => handleOpenLocationEditor(wh, location, locationId)}
                                    >
                                        {location}
                                    </h3>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-1">
                            {items
                                .filter(item => (parseInt(item.Quantity) || 0) > 0)
                                .map((item, idx) => {
                                    const isInCart = cartItems.some(c => c.SKU === item.SKU && c.Warehouse === item.Warehouse && c.Location === item.Location);
                                    return (
                                        <div key={item.id || `${item.SKU}-${item.Warehouse}-${item.Location}`} className={isInCart ? 'ring-1 ring-accent rounded-lg' : ''}>
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
                ))}

                {allLocationBlocks.length > visibleGroups && (
                    <div className="flex justify-center py-8">
                        <button
                            onClick={() => setVisibleGroups(prev => prev + 20)}
                            className="px-8 py-4 bg-subtle text-accent font-black uppercase tracking-widest rounded-2xl hover:bg-accent hover:text-white transition-all active:scale-95 shadow-lg"
                        >
                            Load More Locations ({allLocationBlocks.length - visibleGroups} remaining)
                        </button>
                    </div>
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
                    onSetQty={setCartQty}
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

            {!!locationBeingEdited && (
                <LocationEditorModal
                    location={locationBeingEdited}
                    onSave={handleSaveLocation}
                    onDelete={handleDeleteLocation}
                    onCancel={() => setLocationBeingEdited(null)}
                />
            )}
        </div>
    );
};
