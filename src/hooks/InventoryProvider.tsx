import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { inventoryKeys } from '../lib/query-keys';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useInventoryLogs } from './useInventoryLogs';
import { useLocationManagement } from './useLocationManagement';
import { inventoryService, type InventoryServiceContext } from '../services/inventory.service';
import { type InventoryItem, type InventoryItemWithMetadata, type InventoryItemInput } from '../schemas/inventory.schema';
import { inventoryApi } from '../services/inventoryApi';
import { type SKUMetadata, type SKUMetadataInput } from '../schemas/skuMetadata.schema';
import { updateInventoryCache, type InventoryFilters, type RealtimeInventoryEvent } from '../utils/inventorySync';

interface InventoryContextType {
  inventoryData: InventoryItem[];
  ludlowData: InventoryItem[];
  atsData: InventoryItem[];
  ludlowInventory: InventoryItem[];
  atsInventory: InventoryItem[];
  locationCapacities: Record<string, { current: number; max: number }>;
  reservedQuantities: Record<string, number>;
  fetchLogs: () => Promise<any[]>;
  loading: boolean;
  error: string | null;
  updateQuantity: (
    sku: string,
    delta: number,
    warehouse?: string | null,
    location?: string | null,
    isReversal?: boolean,
    listId?: string,
    orderNumber?: string
  ) => Promise<void>;
  updateLudlowQuantity: (sku: string, delta: number, location?: string | null) => Promise<void>;
  updateAtsQuantity: (sku: string, delta: number, location?: string | null) => Promise<void>;
  addItem: (warehouse: string, newItem: InventoryItemInput) => Promise<void>;
  updateItem: (originalItem: InventoryItem, updatedFormData: InventoryItemInput) => Promise<void>;
  moveItem: (
    sourceItem: InventoryItem,
    targetWarehouse: string,
    targetLocation: string,
    qty: number,
    isReversal?: boolean
  ) => Promise<void>;
  undoAction: (logId: string) => Promise<void>;
  deleteItem: (warehouse: string, sku: string) => Promise<void>;
  exportData: () => void;
  syncInventoryLocations: () => Promise<{ successCount: number; failCount: number }>;
  updateInventory: (newData: InventoryItem[]) => void;
  updateLudlowInventory: (newData: InventoryItem[]) => void;
  updateAtsInventory: (newData: InventoryItem[]) => void;
  updateSKUMetadata: (metadata: SKUMetadataInput) => Promise<void>;
  syncFilters: (filters: InventoryFilters) => void;
  isAdmin: boolean;
  user: any;
  profile: any;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider = ({ children }: { children: ReactNode }) => {
  const [inventoryData, setInventoryData] = useState<InventoryItemWithMetadata[]>([]);
  const [skuMetadataMap, setSkuMetadataMap] = useState<Record<string, SKUMetadata>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Identity & permissions
  const { isAdmin, user, profile } = useAuth();
  const userName = profile?.full_name || user?.email || 'Warehouse Team';

  // Sub-hooks
  const { trackLog, fetchLogs, undoAction: performUndo } = useInventoryLogs();
  const { locations } = useLocationManagement();

  const inventoryDataRef = useRef(inventoryData);
  const skuMetadataMapRef = useRef(skuMetadataMap);
  const filtersRef = useRef<InventoryFilters>({ search: '', warehouse: undefined });
  const isInitialConnection = useRef(true);

  useEffect(() => {
    inventoryDataRef.current = inventoryData;
  }, [inventoryData]);

  useEffect(() => {
    skuMetadataMapRef.current = skuMetadataMap;
  }, [skuMetadataMap]);

  const syncFilters = useCallback((filters: InventoryFilters) => {
    filtersRef.current = filters;
  }, []);

  // Initial Load - Parallel queries
  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);

        const [inv, meta] = await Promise.all([
          inventoryApi.fetchInventory(),
          inventoryApi.fetchAllMetadata(),
        ]);
        console.log('📦 Inventory loaded:', inv.length);

        const metaMap: Record<string, SKUMetadata> = {};
        (meta || []).forEach((m: any) => {
          metaMap[m.sku] = m;
        });
        setSkuMetadataMap(metaMap);

        const enriched: InventoryItemWithMetadata[] = inv.map((item) => ({
          ...item,
          sku_metadata: metaMap[item.sku] || (item as any).sku_metadata,
        }));

        setInventoryData(enriched || []);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load inventory data';
        console.error('Error loading inventory data:', err);
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, []);

  // Realtime Subscription - "Quirurgical Sync"
  useEffect(() => {
    /**
     * NOTE: Ensure that RLS policies for the 'inventory' table allow 'SELECT' for the connected user.
     * If RLS is not properly configured, 'payload.new' will be empty on UPDATE/INSERT events.
     * The table must also have Realtime enabled in the Supabase Dashboard.
     */
    const channel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        (payload) => {
          // DIAGNOSTIC LOGS
          console.group('📡 Realtime Sync Debug');
          console.log('Event Type:', payload.eventType);
          console.log('Original Payload:', payload);

          if (payload.eventType !== 'DELETE' && !payload.new) {
            console.error('❌ CRITICAL: payload.new is missing! This usually means:');
            console.error('1. RLS is blocking SELECT for this user.');
            console.error('2. Replica Identity is not set to FULL in the inventory table.');
          }
          console.groupEnd();

          const event: RealtimeInventoryEvent = {
            eventType: payload.eventType as any,
            new: payload.new as any,
            old: payload.old as any,
          };

          // 1. Update React Query Cache for persistence and cross-component sync
          queryClient.setQueriesData({ queryKey: inventoryKeys.all }, (old: any) => {
            return updateInventoryCache(
              old,
              event,
              filtersRef.current,
              skuMetadataMapRef.current
            );
          });

          // 2. Update Local State for immediate UI reaction in this Provider
          setInventoryData((current) => {
            return updateInventoryCache(
              current,
              event,
              filtersRef.current,
              skuMetadataMapRef.current
            );
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (isInitialConnection.current) {
            console.log('🔌 Realtime: Initial connection established.');
            isInitialConnection.current = false;
          } else {
            console.log('🔄 Realtime: Reconnected. Resyncing inventory to close the "Elevator Gap"...');
            // Force a refresh of all inventory data to catch missed events
            queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
            toast.success('Connection restored. Syncing inventory...', { icon: '🔄' });
          }
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`⚠️ Realtime: Connection ${status}. Retrying...`);
          toast.error('Connection unstable. Retrying sync...', { id: 'connection-error' });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const getServiceContext = useCallback((): InventoryServiceContext => {
    return {
      isAdmin,
      userInfo: {
        performed_by: userName,
        user_id: user?.id,
      },
      trackLog,
      onLocationCreated: () => {
        queryClient.invalidateQueries({ queryKey: inventoryKeys.locations() });
      },
    };
  }, [isAdmin, userName, user?.id, trackLog, queryClient]);

  const ludlowInventory = useMemo(
    () => inventoryData.filter((i) => i.warehouse === 'LUDLOW' && i.quantity > 0),
    [inventoryData]
  );

  const atsInventory = useMemo(
    () => inventoryData.filter((i) => i.warehouse === 'ATS' && i.quantity > 0),
    [inventoryData]
  );

  const ludlowData = useMemo(() => ludlowInventory, [ludlowInventory]);
  const atsData = useMemo(() => atsInventory, [atsInventory]);

  const locationCapacities = useMemo(() => {
    const capacities: Record<string, { current: number; max: number }> = {};

    inventoryData.forEach((item) => {
      if (!item.location) return;
      const key = `${item.warehouse}-${item.location}`;

      if (!capacities[key]) {
        const locConfig = locations.find(
          (l) => l.warehouse === item.warehouse && l.location === item.location
        );
        capacities[key] = {
          current: 0,
          max: locConfig?.max_capacity || 550,
        };
      }
      capacities[key].current += item.quantity || 0;
    });

    return capacities;
  }, [inventoryData, locations]);

  const pendingUpdatesRef = useRef<Record<string, { delta: number, timer: any }>>({});

  const updateQuantity = useCallback(
    async (
      sku: string,
      delta: number,
      warehouse: string | null = null,
      location: string | null = null,
      isReversal: boolean = false,
      listId?: string,
      orderNumber?: string
    ) => {
      const resolvedWarehouse = warehouse || 'LUDLOW';
      const updateKey = `${sku}-${resolvedWarehouse}-${location || 'any'}`;

      // 1. Instant Optimistic UI Update
      setInventoryData((prev) =>
        prev.map((i) =>
          i.sku === sku && i.warehouse === resolvedWarehouse && (!location || i.location === location)
            ? { ...i, quantity: i.quantity + delta }
            : i
        )
      );

      // 2. Buffer the Delta
      if (!pendingUpdatesRef.current[updateKey]) {
        pendingUpdatesRef.current[updateKey] = { delta: 0, timer: null };
      }

      const currentPending = pendingUpdatesRef.current[updateKey];
      currentPending.delta += delta;

      // 3. Clear existing timer to reset debounce
      if (currentPending.timer) {
        clearTimeout(currentPending.timer);
      }

      // 4. Set final sync timer (Merge Logic)
      currentPending.timer = setTimeout(async () => {
        const finalDelta = currentPending.delta;
        delete pendingUpdatesRef.current[updateKey]; // Cleanup buffer FIRST to allow new cycles

        if (finalDelta === 0) return;

        try {
          // Find the item for DB reference
          const item = inventoryDataRef.current.find(
            (i) =>
              i.sku === sku &&
              i.warehouse === resolvedWarehouse &&
              (!location || i.location === location)
          );

          if (!item) return;

          // SNAPSHOT & WRITE (Atomic update in one go)
          const { data: snapshotItem, error: fetchError } = await supabase
            .from('inventory')
            .select('*')
            .eq('id', Number(item.id))
            .single();

          if (fetchError || !snapshotItem) throw fetchError || new Error('Item not found');

          const currentDbQty = Number(snapshotItem.quantity || 0);
          const finalQuantity = currentDbQty + finalDelta;

          const { error: updateError } = await supabase
            .from('inventory')
            .update({ quantity: finalQuantity })
            .eq('id', Number(item.id));

          if (updateError) throw updateError;

          // Record Log (Will be merged by trackLog if timing is close)
          await trackLog(
            {
              sku,
              from_warehouse: finalDelta > 0 ? undefined : resolvedWarehouse,
              from_location: finalDelta > 0 ? undefined : (item.location || undefined),
              to_warehouse: finalDelta > 0 ? resolvedWarehouse : undefined,
              to_location: finalDelta > 0 ? (item.location || undefined) : undefined,
              quantity_change: finalDelta,
              prev_quantity: currentDbQty,
              new_quantity: finalQuantity,
              action_type: finalDelta > 0 ? 'ADD' : 'DEDUCT',
              item_id: String(item.id),
              location_id: item.location_id,
              snapshot_before: {
                id: snapshotItem.id,
                sku: snapshotItem.sku,
                quantity: snapshotItem.quantity,
                location_id: snapshotItem.location_id,
                location: snapshotItem.location,
                warehouse: snapshotItem.warehouse
              },
              is_reversed: isReversal,
              list_id: listId,
              order_number: orderNumber,
            },
            { performed_by: userName, user_id: user?.id }
          );

          queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
        } catch (err) {
          console.error('[UpdateQuantity] Error syncing batched update:', err);
          toast.error(`Sync error for ${sku}. Please refresh.`);
        }
      }, 1500); // 1500ms debounce
    },
    [trackLog, userName, user?.id, queryClient]
  );

  const updateLudlowQuantity = useCallback(
    async (sku: string, delta: number, location: string | null = null) => {
      return updateQuantity(sku, delta, 'LUDLOW', location);
    },
    [updateQuantity]
  );

  const updateAtsQuantity = useCallback(
    async (sku: string, delta: number, location: string | null = null) => {
      return updateQuantity(sku, delta, 'ATS', location);
    },
    [updateQuantity]
  );

  const addItem = useCallback(
    async (warehouse: string, newItem: InventoryItemInput & { force_id?: string | number; isReversal?: boolean }) => {
      try {
        await inventoryService.addItem(warehouse, newItem, locations, getServiceContext());
        queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error adding item';
        console.error('Error adding item:', err);
        toast.error(errorMsg);
      }
    },
    [locations, getServiceContext, queryClient]
  );

  const updateItem = useCallback(
    async (originalItem: InventoryItem, updatedFormData: InventoryItemInput & { isReversal?: boolean }) => {
      try {
        await inventoryService.updateItem(originalItem, updatedFormData, locations, getServiceContext());
        queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error updating item';
        console.error('Error updating item:', err);
        toast.error(errorMsg);
      }
    },
    [locations, getServiceContext, queryClient]
  );

  const moveItem = useCallback(
    async (
      sourceItem: InventoryItem,
      targetWarehouse: string,
      targetLocation: string,
      qty: number,
      isReversal = false
    ) => {
      if (!sourceItem || !targetWarehouse || !targetLocation) {
        toast.error('Missing required fields for move');
        return;
      }
      try {
        await inventoryService.moveItem(
          sourceItem,
          targetWarehouse,
          targetLocation,
          qty,
          locations,
          getServiceContext(),
          isReversal
        );
        queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error moving item';
        console.error('Error moving item:', err);
        toast.error(errorMsg);
      }
    },
    [locations, getServiceContext, queryClient]
  );

  const deleteItem = useCallback(
    async (warehouse: string, sku: string) => {
      const item = inventoryData.find((i) => i.sku === sku && i.warehouse === warehouse);
      if (!item) return;

      try {
        await inventoryService.deleteItem(item as any, getServiceContext());
        queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      } catch (err: any) {
        console.error('Delete item fail:', err);
        toast.error(err.message || 'Error deleting item');
      }
    },
    [inventoryData, getServiceContext, queryClient]
  );

  const undoAction = useCallback(
    async (logId: string) => {
      // New RPC-based undo doesn't require client-side actions
      const result = await performUndo(logId);

      if (!result.success) {
        toast.error(result.error || 'Undo failed');
        return;
      }

      toast.success('Action undone successfully');
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    },
    [performUndo, queryClient]
  );

  const syncInventoryLocations = useCallback(async () => {
    // Note: This logic could also be moved to the service if needed.
    // For now, keeping legacy check logic if it works, but using cleaner API calls.
    const legacyItems = inventoryData.filter((item) => !item.location_id);
    const results = await Promise.all(
      legacyItems.map(async (item) => {
        const config = locations.find(
          (l) =>
            l.warehouse === item.warehouse &&
            item.location &&
            l.location.toLowerCase() === item.location.toLowerCase() &&
            l.is_active
        );

        if (config) {
          const { error } = await supabase
            .from('inventory')
            .update({ location_id: config.id })
            .eq('id', Number(item.id));

          return !error;
        }
        return false;
      })
    );

    const successCount = results.filter(Boolean).length;
    const failCount = results.length - successCount;

    queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    return { successCount, failCount };
  }, [inventoryData, locations, queryClient]);

  const updateSKUMetadata = useCallback(
    async (metadata: SKUMetadataInput) => {
      try {
        await inventoryApi.upsertMetadata(metadata);

        setSkuMetadataMap((prev) => ({
          ...prev,
          [metadata.sku]: metadata as SKUMetadata,
        }));

        queryClient.invalidateQueries({ queryKey: inventoryKeys.metadata(metadata.sku) });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error updating metadata';
        console.error('Error updating SKU metadata:', err);
        toast.error(errorMsg);
      }
    },
    [queryClient]
  );

  const exportData = useCallback(() => {
    const csvContent = [
      ['SKU', 'Quantity', 'Location', 'Warehouse', 'Status'].join(','),
      ...inventoryData.map((item) =>
        [item.sku, item.quantity, item.location || '', item.warehouse, item.status || 'Active'].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-export-${new Date().toISOString()}.csv`;
    a.click();
  }, [inventoryData]);

  const updateInventory = useCallback((newData: InventoryItem[]) => {
    setInventoryData(newData as InventoryItemWithMetadata[]);
  }, []);

  const updateLudlowInventory = useCallback(
    (newData: InventoryItem[]) => {
      setInventoryData((prev) => [
        ...prev.filter((i) => i.warehouse !== 'LUDLOW'),
        ...(newData as InventoryItemWithMetadata[]),
      ]);
    },
    []
  );

  const updateAtsInventory = useCallback(
    (newData: InventoryItem[]) => {
      setInventoryData((prev) => [
        ...prev.filter((i) => i.warehouse !== 'ATS'),
        ...(newData as InventoryItemWithMetadata[]),
      ]);
    },
    []
  );

  const value: InventoryContextType = {
    inventoryData,
    ludlowData,
    atsData,
    ludlowInventory,
    atsInventory,
    locationCapacities,
    reservedQuantities: {},
    fetchLogs,
    loading,
    error,
    updateQuantity,
    updateLudlowQuantity,
    updateAtsQuantity,
    addItem,
    updateItem,
    moveItem,
    undoAction,
    deleteItem,
    exportData,
    syncInventoryLocations,
    updateInventory,
    updateLudlowInventory,
    updateAtsInventory,
    updateSKUMetadata,
    syncFilters,
    isAdmin,
    user,
    profile,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within InventoryProvider');
  }
  return context;
};
