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
import { useQueryClient, useMutation } from '@tanstack/react-query';
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

  // --- MUTATIONS (Persistence Layer) ---

  const mutationOptions = {
    networkMode: 'offlineFirst' as const,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30000),
  };

  const updateQuantityMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'updateQuantity'],
    mutationFn: async (vars: {
      sku: string;
      resolvedWarehouse: string;
      location: string | null;
      finalDelta: number;
      isReversal?: boolean;
      listId?: string;
      orderNumber?: string;
      optimistic_id?: string;
    }) => {
      // Find item in state (Ref) to get ID
      const item = inventoryDataRef.current.find(
        (i) =>
          i.sku === vars.sku &&
          i.warehouse === vars.resolvedWarehouse &&
          (!vars.location || i.location === vars.location)
      );

      if (!item) throw new Error('Item not found for update');

      // SNAPSHOT & WRITE
      const { data: snapshotItem, error: fetchError } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', Number(item.id))
        .single();

      if (fetchError || !snapshotItem) throw fetchError || new Error('Item not found');

      const currentDbQty = Number(snapshotItem.quantity || 0);
      const finalQuantity = currentDbQty + vars.finalDelta;

      const { error: updateError } = await supabase
        .from('inventory')
        .update({ quantity: finalQuantity })
        .eq('id', Number(item.id));

      if (updateError) throw updateError;

      // Record Log
      await trackLog(
        {
          sku: vars.sku,
          from_warehouse: vars.finalDelta > 0 ? undefined : vars.resolvedWarehouse,
          from_location: vars.finalDelta > 0 ? undefined : (item.location || undefined),
          to_warehouse: vars.finalDelta > 0 ? vars.resolvedWarehouse : undefined,
          to_location: vars.finalDelta > 0 ? (item.location || undefined) : undefined,
          quantity_change: vars.finalDelta,
          prev_quantity: currentDbQty,
          new_quantity: finalQuantity,
          action_type: vars.finalDelta > 0 ? 'ADD' : 'DEDUCT',
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
          is_reversed: vars.isReversal,
          list_id: vars.listId,
          order_number: vars.orderNumber,
        },
        { performed_by: userName, user_id: user?.id }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    }
  });

  const addItemMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'addItem'],
    mutationFn: (vars: { warehouse: string, newItem: InventoryItemInput & { isReversal?: boolean; optimistic_id?: string } }) =>
      inventoryService.addItem(vars.warehouse, vars.newItem, locations, getServiceContext()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    }
  });

  const updateItemMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'updateItem'],
    mutationFn: (vars: { originalItem: InventoryItem, updatedFormData: InventoryItemInput & { isReversal?: boolean; optimistic_id?: string } }) =>
      inventoryService.updateItem(vars.originalItem, vars.updatedFormData, locations, getServiceContext()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    }
  });

  const moveItemMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'moveItem'],
    mutationFn: (vars: { sourceItem: InventoryItem, targetWarehouse: string, targetLocation: string, qty: number, isReversal?: boolean; optimistic_id?: string }) =>
      inventoryService.moveItem(vars.sourceItem, vars.targetWarehouse, vars.targetLocation, vars.qty, locations, getServiceContext(), vars.isReversal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    }
  });

  const deleteItemMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'deleteItem'],
    mutationFn: (vars: { warehouse: string, sku: string, optimistic_id?: string }) => {
      const item = inventoryDataRef.current.find(i => i.sku === vars.sku && i.warehouse === vars.warehouse);
      if (!item) throw new Error('Item not found');
      return inventoryService.deleteItem(item, getServiceContext());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    }
  });

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

  const pendingUpdatesRef = useRef<Record<string, { delta: number; timer: any }>>({});

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
      const key = `${sku}-${resolvedWarehouse}-${location || 'default'}`;

      // 1. OPTIMISTIC UI: Update local state immediately for instant feedback
      const event: RealtimeInventoryEvent = {
        eventType: 'UPDATE',
        new: { sku, quantity_delta: delta, warehouse: resolvedWarehouse, location } as any,
        old: { sku, warehouse: resolvedWarehouse, location } as any,
      };

      setInventoryData((current) =>
        updateInventoryCache(current, event, filtersRef.current, skuMetadataMapRef.current)
      );

      // 2. BATCHED SYNC: Debounce the server write
      if (pendingUpdatesRef.current[key]) {
        clearTimeout(pendingUpdatesRef.current[key].timer);
        pendingUpdatesRef.current[key].delta += delta;
      } else {
        pendingUpdatesRef.current[key] = { delta, timer: null };
      }

      const currentPending = pendingUpdatesRef.current[key];

      currentPending.timer = setTimeout(() => {
        const finalDelta = currentPending.delta;
        delete pendingUpdatesRef.current[key];

        // Use Mutation for the actual server call to enable persistence/retries
        updateQuantityMutation.mutate({
          sku,
          resolvedWarehouse,
          location,
          finalDelta,
          isReversal,
          listId,
          orderNumber,
          optimistic_id: `upd-${Date.now()}-${sku}`
        });
      }, 1500);
    },
    [userName, user?.id, queryClient, updateQuantityMutation]
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
        // Optimistic UI for Add: (Simulated)
        // For simplicity in addItem, we go straight to mutation which will persist if offline
        const optimistic_id = `add-${Date.now()}-${newItem.sku}`;
        await addItemMutation.mutateAsync({ warehouse, newItem: { ...newItem, optimistic_id } as any });
      } catch (err: any) {
        console.error('Error adding item:', err);
        toast.error(err.message || 'Error adding item');
      }
    },
    [addItemMutation]
  );

  const updateItem = useCallback(
    async (originalItem: InventoryItem, updatedFormData: InventoryItemInput & { isReversal?: boolean }) => {
      try {
        const optimistic_id = `edit-${Date.now()}-${originalItem.sku}`;
        await updateItemMutation.mutateAsync({ originalItem, updatedFormData: { ...updatedFormData, optimistic_id } as any });
      } catch (err: any) {
        console.error('Error updating item:', err);
        toast.error(err.message || 'Error updating item');
      }
    },
    [updateItemMutation]
  );

  const moveItem = useCallback(
    async (
      sourceItem: InventoryItem,
      targetWarehouse: string,
      targetLocation: string,
      qty: number,
      isReversal: boolean = false
    ) => {
      try {
        const optimistic_id = `move-${Date.now()}-${sourceItem.sku}`;
        await moveItemMutation.mutateAsync({ sourceItem, targetWarehouse, targetLocation, qty, isReversal, optimistic_id });
      } catch (err: any) {
        console.error('Error moving item:', err);
        toast.error(err.message || 'Error moving item');
      }
    },
    [moveItemMutation]
  );

  const deleteItem = useCallback(
    async (warehouse: string, sku: string) => {
      try {
        const optimistic_id = `del-${Date.now()}-${sku}`;
        await deleteItemMutation.mutateAsync({ warehouse, sku, optimistic_id });
      } catch (err: any) {
        console.error('Error deleting item:', err);
        toast.error(err.message || 'Error deleting item');
      }
    },
    [deleteItemMutation]
  );

  const undoAction = useCallback(
    async (logId: string) => {
      try {
        await performUndo(logId);
      } catch (err: any) {
        toast.error(err.message || 'Undo failed');
      }
    },
    [performUndo]
  );

  const syncInventoryLocations = useCallback(async () => {
    // Standard fetch-and-compare logic (keep as is for now as it's a bulk operation)
    try {
      const { data: allInv } = await supabase.from('inventory').select('id, warehouse, location, location_id');
      if (!allInv) return { successCount: 0, failCount: 0 };

      let success = 0;
      let fail = 0;

      for (const item of allInv) {
        const loc = locations.find(l => l.warehouse === item.warehouse && l.location === item.location);
        if (loc && loc.id !== item.location_id) {
          const { error } = await supabase.from('inventory').update({ location_id: loc.id }).eq('id', item.id);
          if (error) fail++;
          else success++;
        }
      }
      return { successCount: success, failCount: fail };
    } catch (err) {
      console.error('Sync locations error:', err);
      return { successCount: 0, failCount: 0 };
    }
  }, [locations]);

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
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(inventoryData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `inventory_export_${new Date().toISOString()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
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
    ludlowData: ludlowInventory,
    atsData: atsInventory,
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
    isAdmin: !!isAdmin,
    user,
    profile,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (context === undefined) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};
