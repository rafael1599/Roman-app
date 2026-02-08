import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useInventory } from '../hooks/InventoryProvider';
import { useViewMode } from '../context/ViewModeContext';
import { SearchInput } from '../components/ui/SearchInput.tsx';
import { useDebounce } from '../hooks/useDebounce';
import { InventoryCard } from '../features/inventory/components/InventoryCard';
import { InventoryModal } from '../features/inventory/components/InventoryModal';
import { PickingCartDrawer } from '../features/picking/components/PickingCartDrawer';
import CamScanner from '../features/smart-picking/components/CamScanner';
import { naturalSort } from '../utils/sortUtils';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Warehouse from 'lucide-react/dist/esm/icons/warehouse';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import X from 'lucide-react/dist/esm/icons/x';
import Mail from 'lucide-react/dist/esm/icons/mail'; // Added Mail icon
import { MovementModal } from '../features/inventory/components/MovementModal';
import { CapacityBar } from '../components/ui/CapacityBar.tsx';
import toast from 'react-hot-toast';
import { getOptimizedPickingPath, calculatePallets } from '../utils/pickingLogic';

import { usePickingSession } from '../context/PickingContext';
import { useAuth } from '../context/AuthContext';
import { useLocationManagement } from '../hooks/useLocationManagement';
import LocationEditorModal from '../features/warehouse-management/components/LocationEditorModal';
import { useError } from '../context/ErrorContext';
import { useConfirmation } from '../context/ConfirmationContext';
import { SessionInitializationModal } from '../features/picking/components/SessionInitializationModal';
import { InventoryItemWithMetadata } from '../schemas/inventory.schema';
import { Location } from '../schemas/location.schema';
import { supabase } from '../lib/supabase';

const SEARCHING_MESSAGE = (
  <div className="py-20 text-center text-muted font-bold uppercase tracking-widest animate-pulse">
    Searching Inventory...
  </div>
);

const NO_INVENTORY_MESSAGE = (
  <div className="text-center text-muted mt-20 py-20 border-2 border-dashed border-subtle rounded-3xl">
    <Warehouse className="mx-auto mb-4 opacity-20" size={48} />
    <p className="text-xl font-black uppercase tracking-widest opacity-30">
      No inventory found
    </p>
  </div>
);

export const InventoryScreen = () => {
  const {
    inventoryData,
    locationCapacities,
    updateQuantity,
    addItem,
    updateItem,
    moveItem,
    deleteItem,
    processPickingList,
    loading,
    syncFilters,
    showInactive,
    setShowInactive,
  } = useInventory();

  const [localSearch, setLocalSearch] = useState('');
  const debouncedSearch = useDebounce(localSearch, 300);

  // Sync filters with provider for Context-Aware Realtime updates
  useEffect(() => {
    syncFilters({ search: debouncedSearch });
  }, [debouncedSearch, syncFilters]);

  // Client-side filtering and pagination logic (by location)
  const [displayLocationCount, setDisplayLocationCount] = useState(50);

  const filteredInventory = useMemo(() => {
    const s = debouncedSearch.toLowerCase().trim();
    return inventoryData.filter((item) => {
      // Show all active items (even with quantity 0)
      // We no longer filter out quantity <= 0 here because the user wants them visible
      // unless specifically deactivated (is_active = FALSE), which is handled by the initial query.

      if (!s) return true;

      // Multi-field search
      return (
        (item.sku || '').toLowerCase().includes(s) ||
        (item.location || '').toLowerCase().includes(s) ||
        (item.sku_note || '').toLowerCase().includes(s) ||
        (item.warehouse || '').toLowerCase().includes(s)
      );
    });
  }, [inventoryData, debouncedSearch]);

  const isLoading = loading;

  const allGroupedData = useMemo(() => {
    const groups: Record<
      string,
      Record<string, { items: typeof filteredInventory; locationId?: string | null }>
    > = {};
    filteredInventory.forEach((item) => {
      const wh = item.warehouse || 'UNKNOWN';
      const locName = item.location || 'Unknown Location';

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
  }, [filteredInventory]);

  const allSortedWarehouses = useMemo(() => {
    const warehouses = Object.keys(allGroupedData);
    return warehouses.sort((a, b) => {
      if (a === 'LUDLOW') return -1;
      if (b === 'LUDLOW') return 1;
      return a.localeCompare(b);
    });
  }, [allGroupedData]);

  const allLocationBlocks = useMemo(() => {
    return allSortedWarehouses.flatMap((wh) =>
      Object.keys(allGroupedData[wh])
        .sort(naturalSort)
        .map((location) => ({
          wh,
          location,
          items: allGroupedData[wh][location].items,
          locationId: allGroupedData[wh][location].locationId,
        }))
    );
  }, [allSortedWarehouses, allGroupedData]);

  const locationBlocks = useMemo(() => {
    return allLocationBlocks.slice(0, displayLocationCount);
  }, [allLocationBlocks, displayLocationCount]);

  const hasNextPage = displayLocationCount < allLocationBlocks.length;
  const remaining = Math.max(0, allLocationBlocks.length - locationBlocks.length);

  const loadMore = useCallback(() => {
    setDisplayLocationCount((prev) => prev + 50);
  }, []);

  // Scroll to top when search changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setDisplayLocationCount(50); // Reset pagination on search
  }, [debouncedSearch]);

  const { viewMode } = useViewMode(); // 'stock' | 'picking'

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemWithMetadata | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedWarehouseForAdd, setSelectedWarehouseForAdd] = useState('LUDLOW');
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [locationBeingEdited, setLocationBeingEdited] = useState<Location | any>(null);

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
    customer,
    updateCustomerDetails,
    setCartItems,
    addToCart,
    updateCartQty,
    setCartQty,
    removeFromCart,
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

  const handleEditItem = useCallback((item: InventoryItemWithMetadata) => {
    setModalMode('edit');
    setEditingItem(item);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback(() => {
    if (editingItem) {
      deleteItem(editingItem.warehouse, editingItem.sku, editingItem.location);
    }
  }, [editingItem, deleteItem]);

  const saveItem = useCallback(
    (formData: any) => {
      const targetWarehouse = formData.warehouse;
      if (modalMode === 'add') {
        addItem(targetWarehouse, formData);
      } else if (editingItem) {
        updateItem(editingItem, formData);
      }
    },
    [modalMode, addItem, updateItem, editingItem]
  );

  const handleMoveStock = useCallback(
    async (moveData: { sourceItem: InventoryItemWithMetadata; targetWarehouse: 'LUDLOW' | 'ATS'; targetLocation: string; quantity: number }) => {
      try {
        await moveItem(
          moveData.sourceItem,
          moveData.targetWarehouse,
          moveData.targetLocation,
          moveData.quantity
        );
        toast.success('Stock successfully moved!');
      } catch (err: any) {
        console.error('Error moving stock:', err);
        showError('Move failed', err.message);
      }
    },
    [moveItem, showError]
  );

  const handleQuickMove = useCallback((item: InventoryItemWithMetadata) => {
    setEditingItem(item);
    setIsMovementModalOpen(true);
  }, []);

  const handleOpenLocationEditor = useCallback(
    (warehouse: string, locationName: string, locationId?: string | null) => {
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
    async (formData: any) => {
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
    async (id: string) => {
      if (locationBeingEdited?.isNew) {
        const totalUnits = inventoryData
          .filter(
            (i) =>
              i.warehouse === locationBeingEdited.warehouse &&
              i.location === locationBeingEdited.location
          )
          .reduce((sum, i) => sum + (i.quantity || 0), 0);

        const confirmMsg = `This is a "ghost" location (it only exists as text on ${totalUnits} inventory units). 
Do you want to PERMANENTLY DELETE all these products so the location disappears?`;

        showConfirmation(
          'Delete Ghost Location',
          confirmMsg,
          async () => {
            const itemsToDelete = inventoryData.filter(
              (i) =>
                i.warehouse === locationBeingEdited.warehouse &&
                i.location === locationBeingEdited.location
            );
            for (const item of itemsToDelete) {
              await deleteItem(item.warehouse, item.sku);
            }
            setLocationBeingEdited(null);
            window.location.reload();
          },
          undefined,
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
    (item: InventoryItemWithMetadata) => {
      if (viewMode === 'stock') {
        handleEditItem(item);
      } else {
        addToCart(item);
      }
    },
    [viewMode, handleEditItem, addToCart]
  );

  const handleScanComplete = (scannedLines: any[]) => {
    const newItems: any[] = scannedLines.map((line) => {
      const match = inventoryData.find((i) => i.sku === line.sku);
      if (match) {
        return { ...match, pickingQty: line.qty || 1 };
      }
      return {
        id: -1,
        sku: line.sku,
        quantity: 0,
        location: 'UNKNOWN',
        warehouse: 'LUDLOW',
        created_at: new Date(),
        pickingQty: line.qty || 1,
      };
    });
    setCartItems((prev) => [...prev, ...newItems]);
    setShowScanner(false);
  };

  // REMOVED EARLY LOADING RETURN TO PREVENT KEYBOARD DISMISSAL
  // Layout must remain stable while charging

  // Removed isError check as we are using local data now


  // --- Manual Snapshot Trigger ---
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const triggerDailySnapshot = useCallback(async () => {
    try {
      if (!confirm('Are you sure you want to trigger the Daily Snapshot email now?')) return;

      setIsSendingEmail(true);
      const now = new Date();
      // YYYY-MM-DD
      const snapshot_date = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      toast.loading('Generating snapshot and sending email...', { id: 'snapshot-toast' });

      // Call the daily-snapshot function
      const { data, error } = await supabase.functions.invoke('daily-snapshot', {
        body: { snapshot_date }
      });

      if (error) throw error;

      if (data?.email_error) {
        throw new Error(`Email Error: ${JSON.stringify(data.email_error)}`);
      }

      toast.success('Snapshot generated and email sent!', { id: 'snapshot-toast' });
      console.log('Snapshot success:', data);

    } catch (err: any) {
      console.error('Snapshot failed:', err);
      toast.error(`Failed: ${err.message || 'Unknown error'}`, { id: 'snapshot-toast' });
    } finally {
      setIsSendingEmail(false);
    }
  }, []);

  return (
    <div className="pb-4 relative">
      <SessionInitializationModal />

      {/* Manual Snapshot Button (Admin Stock Mode Only) */}
      {isAdmin && viewMode === 'stock' && (
        <div className="fixed bottom-40 right-4 z-40 flex flex-col gap-3">
          <button
            onClick={triggerDailySnapshot}
            disabled={isSendingEmail}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${isSendingEmail
                ? 'bg-subtle text-muted cursor-wait'
                : 'bg-surface text-accent border border-accent/20 hover:bg-accent hover:text-white'
              }`}
            title="Trigger Daily Snapshot Email"
          >
            {isSendingEmail ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
            ) : (
              <Mail size={20} />
            )}
          </button>
        </div>
      )}


      {showWelcome ? (
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
      ) : null}

      <SearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search SKU, Loc, Warehouse..."
        mode={viewMode as any}
        onScanClick={() => setShowScanner(true)}
      />

      <div className="px-4 pt-2 flex items-center gap-2">
        <input
          type="checkbox"
          id="show-inactive"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="rounded border-neutral-600 bg-surface text-accent focus:ring-accent focus:ring-offset-0 h-4 w-4"
        />
        <label htmlFor="show-inactive" className="text-sm text-muted font-medium cursor-pointer select-none">
          Show Deleted Items
        </label>
      </div>


      <div className="p-4 space-y-12 min-h-[50vh]">
        {isLoading && !locationBlocks.length ? (
          SEARCHING_MESSAGE
        ) : (
          locationBlocks.map(({ wh, location, items, locationId }, index) => {
            const isFirstInWarehouse = index === 0 || locationBlocks[index - 1].wh !== wh;

            return (
              <div key={`${wh}-${location}`} className="space-y-4">
                {isFirstInWarehouse && (
                  <div className="flex items-center gap-4 pt-8 pb-2">
                    <div className="h-px flex-1 bg-subtle" />
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-content bg-surface px-6 py-2 rounded-full border border-subtle shadow-sm flex items-center gap-3">
                      <Warehouse className="text-accent" size={24} />
                      {wh === 'DELETED ITEMS' ? 'Warehouse: Deleted Items' : `Warehouse: ${wh}`}
                    </h2>
                    <div className="h-px flex-1 bg-subtle" />
                  </div>
                )}

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
                        c.sku === item.sku &&
                        c.warehouse === item.warehouse &&
                        c.location === item.location
                    );

                    // Calculate availability for picking mode
                    const stockInfo = viewMode === 'picking' ? getAvailableStock(item) : null;

                    return (
                      <div
                        key={`inv-row-${item.id}-${item.sku}`}
                        className={`animate-slide-in-new ${isInCart && viewMode === 'picking' ? 'ring-1 ring-accent rounded-lg' : ''
                          }`}
                      >
                        <InventoryCard
                          sku={item.sku}
                          quantity={item.quantity}
                          detail={item.sku_note}
                          warehouse={item.warehouse}
                          onIncrement={() =>
                            updateQuantity(item.sku, 1, item.warehouse, item.location)
                          }
                          onDecrement={() =>
                            updateQuantity(item.sku, -1, item.warehouse, item.location)
                          }
                          onMove={() => handleQuickMove(item)}
                          onClick={() => handleCardClick(item)}
                          mode={viewMode === 'picking' ? sessionMode : 'stock'}
                          reservedByOthers={stockInfo?.reservedByOthers || 0}
                          available={stockInfo?.available}
                          lastUpdateSource={(item as any)._lastUpdateSource}
                          is_active={item.is_active}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {hasNextPage ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <button
              onClick={loadMore}
              className="px-8 py-4 font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shadow-lg bg-subtle text-accent hover:bg-accent hover:text-white"
            >
              Load More Locations ({remaining} remaining)
            </button>
          </div>
        ) : null}

        {allLocationBlocks.length === 0 ? NO_INVENTORY_MESSAGE : null}
      </div>

      {viewMode === 'stock' ? (
        <div className="fixed bottom-24 right-4 flex flex-col gap-3 z-40">
          <button
            onClick={() => handleAddItem('LUDLOW')}
            className="w-16 h-16 ios-btn-primary shadow-2xl shadow-accent/40 active:scale-90 transition-transform"
            title="Add New SKU"
          >
            <Plus size={32} strokeWidth={3} />
          </button>
        </div>
      ) : null}

      {viewMode === 'picking' ? (
        <PickingCartDrawer
          cartItems={cartItems as any}
          activeListId={activeListId}
          orderNumber={orderNumber}
          customer={customer}
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
          notes={notes as any}
          isNotesLoading={isNotesLoading}
          onAddNote={addNote}
          onResetSession={resetSession}
          ownerId={ownerId}
          onUpdateOrderNumber={setOrderNumber}
          onUpdateCustomer={(details) => {
            if (customer?.id) {
              updateCustomerDetails(customer.id, details);
            }
          }}
          onUpdateQty={updateCartQty}
          onSetQty={setCartQty}
          onRemoveItem={removeFromCart}
          onDelete={deleteList}
          onReturnToBuilding={returnToBuilding}
          onDeduct={async (items, isVerified: boolean) => {
            if (isProcessingDeduction) return false;
            setIsProcessingDeduction(true);

            try {
              if (!isVerified) {
                // Rule: All-or-nothing verification. 
                // However, our current UI might call onDeduct with isVerified=false when "releasing"
                // but the user wants to ENSURE that deductions only happen at 100%.
                // Based on the new rule, we block deduction if not verified.
                await releaseCheck(activeListId!);
                toast('Order released to queue (No deduction made)', {
                  icon: '📋',
                  duration: 4000,
                });
                return true;
              }

              // Calculate final metrics before completing
              const totalUnits = items.reduce((acc: number, item: any) => acc + (item.pickingQty || 0), 0);
              const optimizedPath = getOptimizedPickingPath(items, allMappedLocations);
              const calculatedPallets = calculatePallets(optimizedPath);
              const pallets_qty = calculatedPallets.length;

              await processPickingList(
                activeListId!,
                pallets_qty,
                totalUnits
              );
              return true;
            } catch (error: any) {
              console.error('Operation failed:', error);
              const isVerification = !isVerified;
              showError(
                isVerification ? 'Verification failed' : 'Deduction failed',
                error.message || 'Network error or connection lost.'
              );
              throw error;
            } finally {
              setIsProcessingDeduction(false);
            }
          }}
        />
      ) : null}

      <InventoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={saveItem}
        onDelete={handleDelete}
        initialData={editingItem}
        mode={modalMode}
        screenType={selectedWarehouseForAdd || editingItem?.warehouse}
      />

      {showScanner ? (
        <CamScanner onScanComplete={handleScanComplete} onCancel={() => setShowScanner(false)} />
      ) : null}
      <MovementModal
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        onMove={handleMoveStock}
        initialSourceItem={editingItem}
      />

      {locationBeingEdited ? (
        <LocationEditorModal
          location={locationBeingEdited}
          onSave={handleSaveLocation}
          onDelete={handleDeleteLocation}
          onCancel={() => setLocationBeingEdited(null)}
        />
      ) : null}
    </div>
  );
};
