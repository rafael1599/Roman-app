import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useInventory } from '../hooks/InventoryProvider';
import { useViewMode } from '../context/ViewModeContext';
import { SearchInput } from '../components/ui/SearchInput';
import { useDebounce } from '../hooks/useDebounce';
import { InventoryCard } from '../features/inventory/components/InventoryCard';
import { InventoryModal } from '../features/inventory/components/InventoryModal';
import { PickingCartDrawer } from '../features/picking/components/PickingCartDrawer';
import CamScanner from '../features/smart-picking/components/CamScanner';
import { naturalSort } from '../utils/sortUtils';
import { Plus, Warehouse, Sparkles, X } from 'lucide-react';
import { MovementModal } from '../features/inventory/components/MovementModal';
import { CapacityBar } from '../components/ui/CapacityBar';
import toast from 'react-hot-toast';

import { usePickingSession } from '../hooks/usePickingSession';
import { useAuth } from '../context/AuthContext';
import { useLocationManagement } from '../hooks/useLocationManagement';
import LocationEditorModal from '../features/warehouse-management/components/LocationEditorModal';
import { useError } from '../context/ErrorContext';
import { useConfirmation } from '../context/ConfirmationContext';
import { SessionInitializationModal } from '../features/picking/components/SessionInitializationModal';

export const InventoryScreen = () => {
  const {
    inventoryData,
    locationCapacities,
    updateQuantity,
    addItem,
    updateItem,
    moveItem,
    deleteItem,
    loading,
  } = useInventory();

  const [localSearch, setLocalSearch] = useState('');
  const debouncedSearch = useDebounce(localSearch, 300);

  // Client-side filtering and pagination logic
  const [displayCount, setDisplayCount] = useState(100);

  const filteredInventory = useMemo(() => {
    const s = debouncedSearch.toLowerCase().trim();
    return inventoryData.filter((item) => {
      // Basic stock filter (match server behavior: Quantity > 0)
      if ((item.Quantity || 0) <= 0) return false;

      if (!s) return true;

      // Multi-field search
      return (
        (item.SKU || '').toLowerCase().includes(s) ||
        (item.Location || '').toLowerCase().includes(s) ||
        (item.Location_Detail || '').toLowerCase().includes(s) ||
        (item.Warehouse || '').toLowerCase().includes(s)
      );
    });
  }, [inventoryData, debouncedSearch]);

  const inventory = useMemo(() => {
    return filteredInventory.slice(0, displayCount);
  }, [filteredInventory, displayCount]);

  const hasNextPage = displayCount < filteredInventory.length;
  const remaining = Math.max(0, filteredInventory.length - inventory.length);

  const loadMore = useCallback(() => {
    setDisplayCount((prev) => prev + 100);
  }, []);

  const isLoading = loading; // Map provider loading to isLoading

  // Scroll to top when search changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setDisplayCount(100); // Reset pagination on search
  }, [debouncedSearch]);

  const { viewMode } = useViewMode(); // 'stock' | 'picking'

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [modalMode, setModalMode] = useState('add');
  const [selectedWarehouseForAdd, setSelectedWarehouseForAdd] = useState('LUDLOW');
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [locationBeingEdited, setLocationBeingEdited] = useState<any>(null);

  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isAdmin } = useAuth();
  const { showError } = useError();
  const { showConfirmation } = useConfirmation();
  const {
    locations: allMappedLocations,
    createLocation,
    updateLocation,
    deactivateLocation,
  } = useLocationManagement();

  // Welcome Message Logic
  useEffect(() => {
    const checkWelcome = () => {
      const hasBeenShown = localStorage.getItem('roman_welcome_genesis_shown');
      const releaseTime = new Date('2026-01-19T08:00:00-05:00').getTime();
      const currentTime = Date.now();

      if (!hasBeenShown && currentTime >= releaseTime) {
        setShowWelcome(true);
        welcomeTimerRef.current = setTimeout(() => {
          setShowWelcome(false);
          localStorage.setItem('roman_welcome_genesis_shown', 'true');
        }, 5000);
      }
    };

    checkWelcome();
    return () => {
      if (welcomeTimerRef.current) clearTimeout(welcomeTimerRef.current);
    };
  }, []);

  // Picking Mode State
  const {
    cartItems,
    activeListId,
    orderNumber,
    setOrderNumber,
    setCartItems,
    addToCart,
    updateCartQty,
    setCartQty,
    removeFromCart,
    completeList,
    markAsReady,
    lockForCheck,
    releaseCheck,
    returnToPicker,
    loadExternalList,
    sessionMode,
    checkedBy,
    ownerId,
    revertToPicking,
    notes,
    isNotesLoading,
    addNote,
    resetSession,
    getAvailableStock,
    deleteList,
    returnToBuilding,
  } = usePickingSession();

  const { externalDoubleCheckId, setExternalDoubleCheckId } = useViewMode();

  const [showScanner, setShowScanner] = useState(false);
  const [isProcessingDeduction, setIsProcessingDeduction] = useState(false);

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

  const saveItem = useCallback(
    (formData) => {
      const targetWarehouse = formData.Warehouse;
      if (modalMode === 'add') {
        addItem(targetWarehouse, formData);
      } else {
        updateItem(editingItem, formData);
      }
    },
    [modalMode, addItem, updateItem, editingItem]
  );

  const handleMoveStock = useCallback(
    async (moveData) => {
      try {
        await moveItem(
          moveData.sourceItem,
          moveData.targetWarehouse,
          moveData.targetLocation,
          moveData.quantity
        );
        toast.success('Stock successfully moved!');
      } catch (err) {
        console.error('Error moving stock:', err);
        showError('Move failed', err.message);
      }
    },
    [moveItem, showError]
  );

  const handleQuickMove = useCallback((item) => {
    setEditingItem(item);
    setIsMovementModalOpen(true);
  }, []);

  const handleOpenLocationEditor = useCallback(
    (warehouse, locationName, locationId) => {
      if (!isAdmin || viewMode !== 'stock') return;
      let loc = null;
      if (locationId) {
        loc = allMappedLocations.find((l) => l.id === locationId);
      }
      if (!loc) {
        loc = allMappedLocations.find(
          (l) =>
            l.warehouse === warehouse && l.location.toLowerCase() === locationName.toLowerCase()
        );
      }
      if (loc) {
        setLocationBeingEdited(loc);
      } else {
        setLocationBeingEdited({
          warehouse,
          location: locationName,
          max_capacity: 550,
          zone: 'UNASSIGNED',
          picking_order: 999,
          isNew: true,
        });
      }
    },
    [isAdmin, viewMode, allMappedLocations]
  );

  const handleSaveLocation = useCallback(
    async (formData) => {
      let result;
      if (locationBeingEdited?.isNew) {
        const { isNew, ...dataToCreate } = formData;
        result = await createLocation(dataToCreate);
      } else {
        result = await updateLocation(locationBeingEdited.id, formData);
      }

      if (result.success) {
        setLocationBeingEdited(null);
        window.location.reload();
      } else {
        showError('Error saving location', result.error);
      }
    },
    [locationBeingEdited, createLocation, updateLocation, showError]
  );

  const handleDeleteLocation = useCallback(
    async (id) => {
      if (locationBeingEdited?.isNew) {
        const totalUnits = inventoryData
          .filter(
            (i) =>
              i.Warehouse === locationBeingEdited.warehouse &&
              i.Location === locationBeingEdited.location
          )
          .reduce((sum, i) => sum + (i.Quantity || 0), 0);

        const confirmMsg = `This is a "ghost" location (it only exists as text on ${totalUnits} inventory units). 
Do you want to PERMANENTLY DELETE all these products so the location disappears?`;

        showConfirmation(
          'Delete Ghost Location',
          confirmMsg,
          async () => {
            const itemsToDelete = inventoryData.filter(
              (i) =>
                i.Warehouse === locationBeingEdited.warehouse &&
                i.Location === locationBeingEdited.location
            );
            for (const item of itemsToDelete) {
              await deleteItem(item.Warehouse, item.SKU);
            }
            setLocationBeingEdited(null);
            window.location.reload();
          },
          null,
          'Permanently Delete',
          'Cancel'
        );
        return;
      }

      const result = await deactivateLocation(id);
      if (result.success) {
        setLocationBeingEdited(null);
        window.location.reload();
      }
    },
    [locationBeingEdited, inventoryData, deleteItem, deactivateLocation, showConfirmation]
  );

  // --- Picking Mode Handlers ---
  const handleCardClick = useCallback(
    (item) => {
      if (viewMode === 'stock') {
        handleEditItem(item);
      } else {
        addToCart(item);
      }
    },
    [viewMode, handleEditItem, addToCart]
  );

  const handleScanComplete = (scannedLines) => {
    const newItems = scannedLines.map((line) => {
      const match = inventoryData.find((i) => i.SKU === line.sku);
      return match
        ? { ...match, pickingQty: line.qty || 1 }
        : { SKU: line.sku, pickingQty: line.qty || 1, Location: 'UNKNOWN', Warehouse: 'UNKNOWN' };
    });
    setCartItems((prev) => [...prev, ...newItems]);
    setShowScanner(false);
  };

  const processedData = useMemo(() => {
    return inventory;
  }, [inventory]);

  const groupedData = useMemo(() => {
    const groups = {};
    processedData.forEach((item) => {
      const wh = item.Warehouse || 'UNKNOWN';
      const locName = item.Location || 'Unknown Location';

      if (!groups[wh]) groups[wh] = {};
      if (!groups[wh][locName]) {
        groups[wh][locName] = {
          items: [],
          locationId: item.location_id,
        };
      }

      groups[wh][locName].items.push(item);
      if (item.location_id && !groups[wh][locName].locationId) {
        groups[wh][locName].locationId = item.location_id;
      }
    });
    return groups;
  }, [processedData]);

  const sortedWarehouses = useMemo(() => {
    const warehouses = Object.keys(groupedData);
    return warehouses.sort((a, b) => {
      if (a === 'LUDLOW') return -1;
      if (b === 'LUDLOW') return 1;
      return a.localeCompare(b);
    });
  }, [groupedData]);

  const locationBlocks = useMemo(() => {
    return sortedWarehouses.flatMap((wh) =>
      Object.keys(groupedData[wh])
        .sort(naturalSort)
        .map((location) => ({
          wh,
          location,
          items: groupedData[wh][location].items,
          locationId: groupedData[wh][location].locationId,
        }))
    );
  }, [sortedWarehouses, groupedData]);

  // REMOVED EARLY LOADING RETURN TO PREVENT KEYBOARD DISMISSAL
  // Layout must remain stable while charging

  // Removed isError check as we are using local data now


  return (
    <div className="pb-4 relative">
      <SessionInitializationModal />

      {showWelcome && (
        <div className="mx-4 mt-4 relative group animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-accent to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative bg-surface border border-accent/20 rounded-2xl p-6 overflow-hidden">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center shrink-0 border border-accent/20">
                <Sparkles className="text-accent" size={24} />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black text-content uppercase tracking-tight mb-1">
                  Roman System is officially Live
                </h2>
                <p className="text-sm text-muted font-medium leading-relaxed max-w-lg">
                  The warehouse digital era begins now. Every movement is recorded to ensure
                  precision and speed. Happy picking!
                </p>
              </div>
              <button
                onClick={() => {
                  setShowWelcome(false);
                  localStorage.setItem('roman_welcome_genesis_shown', 'true');
                }}
                className="p-2 hover:bg-main rounded-lg text-muted hover:text-content transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            <div className="absolute -right-8 -bottom-8 opacity-[0.03] text-accent">
              <Warehouse size={160} />
            </div>
          </div>
        </div>
      )}

      <SearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search SKU, Loc, Warehouse..."
        mode={viewMode}
        onScanClick={() => setShowScanner(true)}
      />

      <div className="p-4 space-y-12 min-h-[50vh]">
        {isLoading && !inventory.length ? (
          <div className="py-20 text-center text-muted font-bold uppercase tracking-widest animate-pulse">
            Searching Inventory...
          </div>
        ) : (
          locationBlocks.map(({ wh, location, items, locationId }) => (
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
                {items.map((item) => {
                  const isInCart = cartItems.some(
                    (c) =>
                      c.SKU === item.SKU &&
                      c.Warehouse === item.Warehouse &&
                      c.Location === item.Location
                  );

                  // Calculate availability for picking mode
                  const stockInfo = viewMode === 'picking' ? getAvailableStock(item) : null;

                  return (
                    <div
                      key={`inv-row-${item.id}-${item.SKU}`}
                      className={
                        isInCart && viewMode === 'picking' ? 'ring-1 ring-accent rounded-lg' : ''
                      }
                    >
                      <InventoryCard
                        sku={item.SKU}
                        quantity={item.Quantity}
                        detail={item.Location_Detail}
                        warehouse={item.Warehouse}
                        onIncrement={() =>
                          updateQuantity(item.SKU, 1, item.Warehouse, item.Location)
                        }
                        onDecrement={() =>
                          updateQuantity(item.SKU, -1, item.Warehouse, item.Location)
                        }
                        onMove={() => handleQuickMove(item)}
                        onClick={() => handleCardClick(item)}
                        mode={viewMode === 'picking' ? sessionMode : 'stock'}
                        reservedByOthers={stockInfo?.reservedByOthers || 0}
                        available={stockInfo?.available}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {hasNextPage && (
          <div className="flex flex-col items-center gap-4 py-8">
            <button
              onClick={loadMore}
              className="px-8 py-4 font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shadow-lg bg-subtle text-accent hover:bg-accent hover:text-white"
            >
              Load More Results ({remaining} items remaining)
            </button>
          </div>
        )}

        {sortedWarehouses.length === 0 && (
          <div className="text-center text-muted mt-20 py-20 border-2 border-dashed border-subtle rounded-3xl">
            <Warehouse className="mx-auto mb-4 opacity-20" size={48} />
            <p className="text-xl font-black uppercase tracking-widest opacity-30">
              No inventory found
            </p>
          </div>
        )}
      </div>

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

      {viewMode === 'picking' && (
        <PickingCartDrawer
          cartItems={cartItems}
          activeListId={activeListId}
          orderNumber={orderNumber}
          sessionMode={sessionMode}
          checkedBy={checkedBy}
          externalDoubleCheckId={externalDoubleCheckId}
          onClearExternalTrigger={() => setExternalDoubleCheckId(null)}
          onLoadExternalList={loadExternalList}
          onLockForCheck={lockForCheck}
          onReleaseCheck={releaseCheck}
          onReturnToPicker={returnToPicker}
          onRevertToPicking={revertToPicking}
          onMarkAsReady={markAsReady}
          notes={notes}
          isNotesLoading={isNotesLoading}
          onAddNote={addNote}
          onResetSession={resetSession}
          ownerId={ownerId}
          onUpdateOrderNumber={setOrderNumber}
          onUpdateQty={updateCartQty}
          onSetQty={setCartQty}
          onRemoveItem={removeFromCart}
          onDelete={deleteList}
          onReturnToBuilding={returnToBuilding}
          onDeduct={async (items, isVerified: boolean) => {
            if (!isVerified) {
              await releaseCheck(activeListId!);
              toast('Order sent to verification queue', {
                icon: '📋',
                duration: 4000,
              });
              return true;
            }

            if (isProcessingDeduction) return false;
            setIsProcessingDeduction(true);
            try {
              await Promise.all(
                items.map((item) => {
                  const delta = -(item.pickingQty || 0);
                  return updateQuantity(
                    item.SKU,
                    delta,
                    item.Warehouse,
                    item.Location,
                    false,
                    activeListId,
                    orderNumber
                  );
                })
              );
              await completeList();
              toast.success('Deduction complete! Inventory updated.');
              return true;
            } catch (error) {
              console.error('Deduction error:', error);
              showError('Failed to deduct inventory', 'Some items might not have been updated.');
              throw error;
            } finally {
              setIsProcessingDeduction(false);
            }
          }}
        />
      )}

      <InventoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={saveItem}
        onDelete={handleDelete}
        initialData={editingItem}
        mode={modalMode}
        screenType={selectedWarehouseForAdd || editingItem?.Warehouse}
      />

      {showScanner && (
        <CamScanner onScanComplete={handleScanComplete} onCancel={() => setShowScanner(false)} />
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
