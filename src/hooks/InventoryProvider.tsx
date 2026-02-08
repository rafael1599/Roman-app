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
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { inventoryKeys } from '../lib/query-keys';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useInventoryLogs } from './useInventoryLogs';
import { useLocationManagement } from './useLocationManagement';
import { usePickingListsSubscription } from './usePickingListsSubscription';
import { inventoryService, type InventoryServiceContext } from '../services/inventory.service';
import { type InventoryItem, type InventoryItemWithMetadata, type InventoryItemInput } from '../schemas/inventory.schema';
import { inventoryApi } from '../services/inventoryApi';
import { type SKUMetadata, type SKUMetadataInput } from '../schemas/skuMetadata.schema';
import { type InventoryLog } from '../schemas/log.schema';
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
  deleteItem: (warehouse: string, sku: string, location?: string | null) => Promise<void>;
  processPickingList: (listId: string, palletsQty?: number, totalUnits?: number) => Promise<void>;
  exportData: () => void;
  syncInventoryLocations: () => Promise<{ successCount: number; failCount: number }>;
  updateInventory: (newData: InventoryItem[]) => void;
  updateLudlowInventory: (newData: InventoryItem[]) => void;
  updateAtsInventory: (newData: InventoryItem[]) => void;
  updateSKUMetadata: (metadata: SKUMetadataInput) => Promise<void>;
  syncFilters: (filters: InventoryFilters) => void;
  getAvailableStock: (sku: string, warehouse?: string) => number;
  showInactive: boolean;
  setShowInactive: (show: boolean) => void;
  isAdmin: boolean;
  user: any;
  profile: any;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider = ({
  children,
  debounceDelay = 1500,
}: {
  children: ReactNode;
  debounceDelay?: number;
}) => {
  const [inventoryData, setInventoryData] = useState<InventoryItemWithMetadata[]>([]);
  const [skuMetadataMap, setSkuMetadataMap] = useState<Record<string, SKUMetadata>>({});
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Identity & permissions
  const { isAdmin, user, profile } = useAuth();
  const userName = profile?.full_name || user?.email || 'Warehouse Team';

  // Sub-hooks
  const { trackLog, fetchLogs, undoAction: performUndo } = useInventoryLogs();
  const { locations } = useLocationManagement();

  // Activate Realtime subscription for picking_lists (Level 3)
  usePickingListsSubscription();

  // Fetch active picking lists for reservation calculation (Level 2)
  const { data: pickingLists = [] } = useQuery({
    queryKey: ['picking_lists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('picking_lists')
        .select('id, items, status, user_id')
        .in('status', ['active', 'needs_correction', 'ready_to_double_check', 'double_checking']);

      if (error) {
        console.error('[PICKING_LISTS_QUERY_ERROR]', error);
        throw error;
      }

      return data || [];
    },
    staleTime: 0, // Always refetch on mount/invalidation
    refetchOnWindowFocus: true,
  });

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

  // Initial Load - Parallel queries + Cleanup
  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);

        // Clean corrupted mutations from previous sessions
        const { cleanupCorruptedMutations } = await import('../lib/query-client');
        await cleanupCorruptedMutations();

        // ✅ ADD: Clean stale optimistic logs (>60s old)
        const logs = queryClient.getQueryData(['inventory_logs', 'TODAY']);
        if (Array.isArray(logs)) {
          const now = Date.now();
          const cleaned = logs.filter(log => {
            if (!(log as any).isOptimistic) return true;
            const created = new Date(log.created_at).getTime();
            const age = now - created;
            return age < 60000; // Keep only if <60s old
          });
          if (cleaned.length !== logs.length) {
            console.log(`[CLEANUP] Removed ${logs.length - cleaned.length} stale optimistic logs`);
            queryClient.setQueryData(['inventory_logs', 'TODAY'], cleaned);
          }
        }

        const data = await inventoryApi.fetchInventoryWithMetadata(showInactive);
        console.log('📦 Inventory loaded with metadata:', data.length);

        const metaMap: Record<string, SKUMetadata> = {};
        const enriched: InventoryItemWithMetadata[] = (data || []).map((item: any) => {
          // If this item has joined metadata, store it in our lookup map for quick access elsewhere
          if (item.sku_metadata && !metaMap[item.sku]) {
            metaMap[item.sku] = item.sku_metadata;
          }

          return {
            ...item,
            // Ensure the item carries its metadata or falls back to what's in the map 
            // (though in this JOIN they are the same)
            sku_metadata: item.sku_metadata || (item as any).sku_metadata,
          } as InventoryItemWithMetadata;
        });

        setSkuMetadataMap(metaMap);
        setInventoryData(enriched);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load inventory data';
        console.error('Error loading inventory data:', err);
        setError(errorMsg);
      } finally {
        setLoading(false);

        // Background prefetch of History logs for offline availability
        queryClient.prefetchQuery({
          queryKey: ['inventory_logs', 'TODAY'],
          queryFn: async () => {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            let query = supabase
              .from('inventory_logs')
              .select('*, picking_lists(order_number)')
              .gte('created_at', startOfToday.toISOString())
              .order('created_at', { ascending: false });

            if (!isAdmin) {
              query = query.neq('action_type', 'SYSTEM_RECONCILIATION');
            }

            const { data, error } = await query.limit(50);

            if (error) throw error;
            return (data || []).map((log: any) => ({
              ...log,
              order_number: log.order_number || log.picking_lists?.order_number,
            }));
          },
          staleTime: 1000 * 60 * 1,
        });
      }
    };
    loadAllData();
  }, [showInactive]);

  // --- MUTATIONS (Persistence Layer) ---

  const mutationOptions = {
    networkMode: 'offlineFirst' as const,
    retry: process.env.NODE_ENV === 'test' ? 0 : 3,
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
      preservedItem?: InventoryItemWithMetadata;
    }) => {
      const { data, error } = await supabase.rpc('adjust_inventory_quantity', {
        p_sku: vars.sku,
        p_warehouse: vars.resolvedWarehouse,
        p_location: vars.location || '',
        p_delta: vars.finalDelta,
        p_performed_by: userName,
        p_user_id: (user?.id || undefined) as any,
        p_user_role: profile?.role || 'staff',
        p_list_id: vars.listId,
        p_order_number: vars.orderNumber
      });

      if (error) throw error;
      return data;
    },
    onMutate: async (vars) => {
      console.log(`[FORENSIC][MUTATION][QUANTITY_START] ${new Date().toISOString()} - SKU: ${vars.sku}, Delta: ${vars.finalDelta}, Optimistic ID: ${vars.optimistic_id}`);
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ['inventory_logs'] });

      // Snapshot the previous value for rollback
      const previousLogs = queryClient.getQueryData(['inventory_logs', 'TODAY']);

      // Find the item to get complete data for the log
      // Use preservedItem (snapshot from before optimistic update) if available
      const item = vars.preservedItem || inventoryDataRef.current.find(
        (i) =>
          i.sku === vars.sku &&
          i.warehouse === vars.resolvedWarehouse &&
          (!vars.location || i.location === vars.location)
      );

      if (item) {
        // Optimistically update the logs cache by injecting a temporary log
        queryClient.setQueryData(['inventory_logs', 'TODAY'], (old: any) => {
          const optimisticLog = {
            id: vars.optimistic_id || `temp-${Date.now()}-${vars.sku}`,
            sku: vars.sku,
            action_type: vars.finalDelta > 0 ? 'ADD' : 'DEDUCT',
            quantity_change: vars.finalDelta,
            from_warehouse: vars.resolvedWarehouse,
            from_location: item.location || undefined,
            to_warehouse: vars.resolvedWarehouse,
            to_location: item.location || undefined,
            prev_quantity: item.quantity,
            new_quantity: (item.quantity || 0) + vars.finalDelta,
            created_at: new Date().toISOString(),
            performed_by: userName,
            is_reversed: false,
            order_number: vars.orderNumber,
            list_id: vars.listId,
            isOptimistic: true, // Mark as temporary
          };

          // Insert at beginning of array
          return Array.isArray(old) ? [optimisticLog, ...old] : [optimisticLog];
        });
      }

      // Return context for rollback
      return { previousLogs, previousItem: item };
    },
    onError: (err, vars, context) => {
      console.error(`[FORENSIC][MUTATION][QUANTITY_ERROR] ${new Date().toISOString()} - SKU: ${vars.sku}`, err);
      // Rollback on error
      if (context?.previousLogs) {
        queryClient.setQueryData(['inventory_logs', 'TODAY'], context.previousLogs);
      }

      // Rollback local state (Inventory Data)
      const prevItem = context?.previousItem;
      console.log(`[FORENSIC][ROLLBACK] ${new Date().toISOString()} - Mutation failed, attempting rollback`, {
        sku: vars.sku,
        prevId: prevItem?.id,
        prevQty: prevItem?.quantity
      });

      if (prevItem) {
        setInventoryData((current) => {
          const next = current.map(item =>
            item.id === prevItem.id ? prevItem as InventoryItemWithMetadata : item
          );
          return next;
        });
      }

      toast.error(`Error updating ${vars.sku}: ${err.message}`);
    },
    onSuccess: (_data, vars) => {
      console.log(`[FORENSIC][MUTATION][QUANTITY_SUCCESS] ${new Date().toISOString()} - SKU: ${vars.sku}`);
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['inventory_logs'] });
    }
  });

  const addItemMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'addItem'],
    mutationFn: (vars: { warehouse: string, newItem: InventoryItemInput & { isReversal?: boolean; optimistic_id?: string } }) =>
      inventoryService.addItem(vars.warehouse, vars.newItem, locations, getServiceContext()),
    onMutate: (vars) => {
      console.log(`[FORENSIC][MUTATION][ADD_START] ${new Date().toISOString()} - SKU: ${vars.newItem.sku}, Optimistic ID: ${vars.newItem.optimistic_id}`);
    },
    onSuccess: () => {
      console.log(`[FORENSIC][MUTATION][ADD_SUCCESS] ${new Date().toISOString()}`);
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    }
  });

  const updateItemMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'updateItem'],
    mutationFn: (vars: { originalItem: InventoryItem, updatedFormData: InventoryItemInput & { isReversal?: boolean; optimistic_id?: string } }) =>
      inventoryService.updateItem(vars.originalItem, vars.updatedFormData, locations, getServiceContext()),
    onMutate: (vars) => {
      console.log(`[FORENSIC][MUTATION][UPDATE_START] ${new Date().toISOString()} - SKU: ${vars.updatedFormData.sku}, Optimistic ID: ${vars.updatedFormData.optimistic_id}`);
    },
    onSuccess: () => {
      console.log(`[FORENSIC][MUTATION][UPDATE_SUCCESS] ${new Date().toISOString()}`);
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    }
  });

  const moveItemMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'moveItem'],
    mutationFn: async (vars: {
      sourceItem: InventoryItem;
      targetWarehouse: string;
      targetLocation: string;
      qty: number;
      isReversal?: boolean;
      optimistic_id?: string;
    }) => {
      return inventoryService.moveItem(
        vars.sourceItem,
        vars.targetWarehouse,
        vars.targetLocation,
        vars.qty,
        getServiceContext()
      );
    },
    onMutate: (vars) => {
      console.log(`[FORENSIC][MUTATION][MOVE_START] ${new Date().toISOString()} - SKU: ${vars.sourceItem.sku}, Qty: ${vars.qty}, Optimistic ID: ${vars.optimistic_id}`);
    },
    onSuccess: () => {
      console.log(`[FORENSIC][MUTATION][MOVE_SUCCESS] ${new Date().toISOString()}`);
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    }
  });

  const deleteItemMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'deleteItem'],
    mutationFn: async (vars: {
      warehouse: string;
      sku: string;
      location?: string | null;
      optimistic_id?: string;
    }) => {
      const item = inventoryDataRef.current.find(i =>
        i.sku === vars.sku &&
        i.warehouse === vars.warehouse &&
        (!vars.location || i.location === vars.location)
      );
      if (!item) throw new Error('Item not found');

      const { error } = await supabase.rpc('delete_inventory_item', {
        p_item_id: Number(item.id),
        p_performed_by: userName,
        p_user_id: user?.id
      });

      if (error) throw error;
      return true;
    },
    onMutate: (vars) => {
      console.log(`[FORENSIC][MUTATION][DELETE_START] ${new Date().toISOString()} - SKU: ${vars.sku}, Optimistic ID: ${vars.optimistic_id}`);
    },
    onSuccess: () => {
      console.log(`[FORENSIC][MUTATION][DELETE_SUCCESS] ${new Date().toISOString()}`);
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
    }
  });

  const processPickingListMutation = useMutation({
    ...mutationOptions,
    mutationKey: ['inventory', 'processPickingList'],
    mutationFn: async (vars: {
      listId: string;
      palletsQty?: number;
      totalUnits?: number;
    }) => {
      console.log(`[FORENSIC][MUTATION][PICKING_RPC_START] ${new Date().toISOString()} - ListID: ${vars.listId}`);

      const { data, error } = await supabase.rpc('process_picking_list', {
        p_list_id: vars.listId,
        p_performed_by: userName,
        p_user_id: user?.id,
        p_pallets_qty: vars.palletsQty,
        p_total_units: vars.totalUnits,
        p_user_role: profile?.role || 'staff'
      });

      if (error) {
        console.error('[PICKING_RPC_ERROR]', error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      console.log(`[FORENSIC][MUTATION][PICKING_RPC_SUCCESS] ${new Date().toISOString()}`);
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['inventory_logs'] });
      queryClient.invalidateQueries({ queryKey: ['picking_lists'] });
      toast.success('Inventory updated successfully!');
    }
  });

  // Realtime Subscription - "Quirurgical Sync" with Robust Connection Handling
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimeout: NodeJS.Timeout;
    let retryCount = 0;
    const setupSubscription = () => {
      // Ensure any previous zombie channel is cleaned
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }

      console.log(`[FORENSIC][REALTIME][INVENTORY_INIT] ${new Date().toISOString()} - Setting up channel inventory-status-sync`);

      channel = supabase
        .channel('inventory-status-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory' },
          (payload) => {
            const newItem = payload.new as any;
            console.log(`[FORENSIC][REALTIME][INVENTORY_EVENT] ${new Date().toISOString()} - Event: ${payload.eventType}, SKU: ${newItem?.sku}`);
            const event: RealtimeInventoryEvent = {
              eventType: payload.eventType as any,
              new: newItem,
              old: payload.old as any,
            };

            // Update React Query Cache for persistence and cross-component sync
            queryClient.setQueriesData({ queryKey: inventoryKeys.all }, (old: any) => {
              return updateInventoryCache(
                old,
                event,
                filtersRef.current,
                skuMetadataMapRef.current
              );
            });

            // Update Local State for immediate UI reaction
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
        .subscribe((status, err) => {
          console.log(`[FORENSIC][REALTIME][INVENTORY_STATUS] ${new Date().toISOString()} - Status: ${status}`);

          if (err) {
            console.error(`[FORENSIC][REALTIME][INVENTORY_ERROR] ${new Date().toISOString()}`, err);
          }

          if (status === 'SUBSCRIBED') {
            retryCount = 0; // Reset on success
            if (isInitialConnection.current) {
              console.log('🔌 Realtime: Initial connection established.');
              isInitialConnection.current = false;
            } else {
              console.log('🔄 Realtime: Reconnected. Resyncing inventory...');
              queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
              // Invalidate logs to prevent cache drift
              queryClient.invalidateQueries({ queryKey: ['inventory_logs'] });
            }
          }

          // Handle disconnection/errors by retrying with exponential backoff or simple limit
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // CRITICAL: Only call removeChannel if NOT already closed to avoid infinite recursion
            if (status !== 'CLOSED' && channel) {
              supabase.removeChannel(channel);
              channel = null;
            }

            retryCount++;
            if (retryCount <= 3) {
              console.warn(`[FORENSIC][REALTIME][INVENTORY_RETRY] ${new Date().toISOString()} - Status: ${status}. Retry ${retryCount}/3 in 5s...`);
              clearTimeout(retryTimeout);
              retryTimeout = setTimeout(setupSubscription, 5000);
            } else {
              console.error(`[FORENSIC][REALTIME][INVENTORY_FATAL] ${new Date().toISOString()} - Max retries reached.`);
              toast.error('Inventory live updates disconnected. Please refresh if this persists.', {
                duration: 6000,
                id: 'realtime-inventory-error'
              });
            }
          }
        });
    };

    setupSubscription();

    return () => {
      console.log(`[FORENSIC][REALTIME][INVENTORY_CLEANUP] ${new Date().toISOString()}`);
      if (channel) supabase.removeChannel(channel);
      clearTimeout(retryTimeout);
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

  const pendingUpdatesRef = useRef<Record<string, { delta: number; timer: any; item?: any }>>({});

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
      const normalizedLocation = location ? location.trim().toUpperCase() : null;
      const key = `${sku}-${resolvedWarehouse}-${normalizedLocation || 'default'}`;

      // 1. OPTIMISTIC UI: Find the current item to preserve all fields
      const currentItem = inventoryDataRef.current.find(
        (i) =>
          i.sku === sku &&
          i.warehouse === resolvedWarehouse &&
          (!normalizedLocation || i.location === normalizedLocation)
      );

      // Early return if item not found
      if (!currentItem) {
        console.error(`[updateQuantity] Item not found: ${sku} in ${resolvedWarehouse}/${location}`);
        return;
      }

      // Preserve item reference BEFORE optimistic update for mutation
      const itemSnapshot = { ...currentItem };

      const newQuantity = (currentItem.quantity || 0) + delta;
      const event: RealtimeInventoryEvent = {
        eventType: 'UPDATE',
        new: {
          ...currentItem,
          quantity: newQuantity,
          location: normalizedLocation || currentItem.location,
          is_active: newQuantity > 0 ? true : currentItem.is_active,
          _lastUpdateSource: 'local',
        } as any,
        old: currentItem as any,
      };

      setInventoryData((current) =>
        updateInventoryCache(current, event, filtersRef.current, skuMetadataMapRef.current)
      );

      // --- IMMEDIATE OPTIMISTIC LOG INJECTION (Fixes 1.5s gap) ---
      const optimisticId = `upd-${Date.now()}-${sku}`;
      queryClient.setQueryData(['inventory_logs', 'TODAY'], (old: any) => {
        const optimisticLog = {
          id: optimisticId,
          sku: sku,
          action_type: delta > 0 ? 'ADD' : 'DEDUCT',
          quantity_change: delta,
          from_warehouse: delta > 0 ? undefined : resolvedWarehouse,
          from_location: delta > 0 ? undefined : (currentItem.location || undefined),
          to_warehouse: delta > 0 ? resolvedWarehouse : undefined,
          to_location: delta > 0 ? (currentItem.location || undefined) : undefined,
          prev_quantity: currentItem.quantity,
          new_quantity: (currentItem.quantity || 0) + delta,
          created_at: new Date().toISOString(),
          performed_by: userName,
          is_reversed: false,
          order_number: orderNumber,
          list_id: listId,
          isOptimistic: true,
        };
        return Array.isArray(old) ? [optimisticLog, ...old] : [optimisticLog];
      });

      // 2. BATCHED SYNC: Debounce the server write
      if (pendingUpdatesRef.current[key]) {
        clearTimeout(pendingUpdatesRef.current[key].timer);
        pendingUpdatesRef.current[key].delta += delta;
      } else {
        pendingUpdatesRef.current[key] = { delta, timer: null, item: itemSnapshot };
      }

      const currentPending = pendingUpdatesRef.current[key];

      currentPending.timer = setTimeout(() => {
        const finalDelta = currentPending.delta;
        const savedItem = currentPending.item; // Use preserved item
        delete pendingUpdatesRef.current[key];

        // Use Mutation with preserved item reference
        updateQuantityMutation.mutate({
          sku,
          resolvedWarehouse,
          location: normalizedLocation,
          finalDelta,
          isReversal,
          listId,
          orderNumber,
          optimistic_id: optimisticId, // Sync IDs
          preservedItem: savedItem, // Pass the original item with valid ID
        });
      }, debounceDelay);
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
    async (warehouse: string, sku: string, location: string | null = null) => {
      try {
        const optimistic_id = `del-${Date.now()}-${sku}`;
        await deleteItemMutation.mutateAsync({ warehouse, sku, location, optimistic_id });
      } catch (err: any) {
        console.error('Error deleting item:', err);
        toast.error(err.message || 'Error deleting item');
      }
    },
    [deleteItemMutation]
  );

  // Helper to apply reverse arithmetic to inventory
  const applyLogReversal = useCallback((currentData: InventoryItemWithMetadata[], log: InventoryLog): InventoryItemWithMetadata[] => {
    let newData = [...currentData];

    try {
      if (log.action_type === 'MOVE') {
        const qty = Math.abs(log.quantity_change);

        // Deduct from Target
        if (log.to_warehouse && (log.to_location || log.to_location_id)) {
          const targetIndex = newData.findIndex(
            i => i.sku === log.sku &&
              i.warehouse === log.to_warehouse &&
              (log.to_location_id ? i.location_id === log.to_location_id : i.location === log.to_location)
          );

          if (targetIndex > -1) {
            newData[targetIndex] = {
              ...newData[targetIndex],
              quantity: Math.max(0, newData[targetIndex].quantity - qty)
            };
          }
        }

        // Add back to Source
        if (log.from_warehouse && (log.from_location || log.location_id)) {
          const sourceIndex = newData.findIndex(
            i => i.sku === log.sku &&
              i.warehouse === log.from_warehouse &&
              (log.location_id ? i.location_id === log.location_id : i.location === log.from_location)
          );

          if (sourceIndex > -1) {
            newData[sourceIndex] = {
              ...newData[sourceIndex],
              quantity: newData[sourceIndex].quantity + qty
            };
          } else {
            // Create if missing (simplified restoration)
            const newItem: InventoryItemWithMetadata = {
              id: log.item_id ? Number(log.item_id) : -Math.floor(Math.random() * 1000000),
              sku: log.sku,
              warehouse: log.from_warehouse! as any,
              location: log.from_location || 'Unknown',
              location_id: log.location_id || undefined,
              quantity: qty,
              is_active: true,
              sku_note: log.snapshot_before?.sku_note,
              created_at: new Date()
            };
            newData.push(newItem);
          }
        }
      } else if (log.action_type === 'ADD') {
        // Reverse ADD = Deduct
        const qty = Math.abs(log.quantity_change);
        const wh = log.to_warehouse || log.from_warehouse;
        const loc = log.to_location || log.from_location;

        const idx = newData.findIndex(i => i.sku === log.sku && i.warehouse === wh && i.location === loc);
        if (idx > -1) {
          newData[idx] = { ...newData[idx], quantity: Math.max(0, newData[idx].quantity - qty) };
        }
      } else if (log.action_type === 'DEDUCT') {
        // Reverse DEDUCT = Add
        const qty = Math.abs(log.quantity_change);
        const wh = log.from_warehouse || log.to_warehouse;
        const loc = log.from_location || log.to_location;

        const idx = newData.findIndex(i => i.sku === log.sku && i.warehouse === wh && i.location === loc);
        if (idx > -1) {
          newData[idx] = { ...newData[idx], quantity: newData[idx].quantity + qty };
        } else {
          // Restore if missing
          const newItem: InventoryItemWithMetadata = {
            id: log.item_id ? Number(log.item_id) : -Math.floor(Math.random() * 1000000),
            sku: log.sku,
            warehouse: wh! as any,
            location: loc || 'Unknown',
            location_id: log.location_id || undefined,
            quantity: qty,
            is_active: true,
            created_at: new Date()
          };
          newData.push(newItem);
        }
      } else if (log.action_type === 'DELETE') {
        // Restore item
        if (log.snapshot_before) {
          const snap = log.snapshot_before;
          newData.push({
            ...snap,
            id: snap.id ? Number(snap.id) : -Math.floor(Math.random() * 1000000),
            is_active: true
          } as InventoryItemWithMetadata);
        }
      }
    } catch (e) {
      console.warn('Optimistic undo calculation failed:', e);
    }
    return newData;
  }, []);

  const undoAction = useCallback(
    async (logId: string) => {
      try {
        // 1. Optimistic Update of Local State (for instant offline feedback)
        // Retrieve log from react-query cache
        const logs = queryClient.getQueryData<InventoryLog[]>(['inventory_logs', 'TODAY']) || [];
        const targetLog = logs.find(l => l.id === logId);

        if (targetLog) {
          console.log(`[Undo] Optimistically reversing log ${logId} in local state`);
          setInventoryData(prev => applyLogReversal(prev, targetLog));
        }

        // 2. Perform actual undo (Queued if offline)
        await performUndo(logId);
      } catch (err: any) {
        toast.error(err.message || 'Undo failed');
        // We could revert the state here if we stored previous state, but
        // for typical errors (network), we want to keep the optimistic state.
        // Critical errors will force a refetch anyway.
      }
    },
    [performUndo, queryClient, applyLogReversal]
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

  // Level 2: Calculate reservedQuantities from active picking lists
  const reservedQuantities = useMemo(() => {
    const reservations: Record<string, number> = {};

    // Defensive coding: handle null/undefined pickingLists
    if (!Array.isArray(pickingLists)) {
      return reservations;
    }

    pickingLists.forEach((list) => {
      // Defensive coding: handle null/empty items
      if (!list.items || !Array.isArray(list.items)) {
        return;
      }

      list.items.forEach((item: any) => {
        // Defensive coding: validate required fields
        if (!item.sku) {
          console.warn('[RESERVED_QTY_CALCULATION] Item missing SKU:', item);
          return;
        }

        const key = `${item.sku}-${item.warehouse || 'UNKNOWN'}`;
        const qty = Number(item.pickingQty) || 0;

        if (qty > 0) {
          reservations[key] = (reservations[key] || 0) + qty;
        }
      });
    });

    console.log('[RESERVED_QTY_CALCULATED]', {
      timestamp: new Date().toISOString(),
      totalLists: pickingLists.length,
      totalReservations: Object.keys(reservations).length,
      sample: Object.entries(reservations).slice(0, 3),
    });

    return reservations;
  }, [pickingLists]);

  // Helper function: Get available stock (physical - reserved)
  const getAvailableStock = useCallback(
    (sku: string, warehouse?: string) => {
      const targetWarehouse = warehouse || 'LUDLOW';
      // Aggregate physical stock from all locations in the target warehouse
      const physicalQty = inventoryData
        .filter((item) => item.sku === sku && item.warehouse === targetWarehouse)
        .reduce((sum, item) => sum + (item.quantity || 0), 0);

      // Get reserved quantity
      const reservationKey = `${sku}-${targetWarehouse}`;
      const reservedQty = reservedQuantities[reservationKey] || 0;

      return Math.max(0, physicalQty - reservedQty);
    },
    [inventoryData, reservedQuantities]
  );

  const value: InventoryContextType = {
    inventoryData,
    ludlowData: ludlowInventory,
    atsData: atsInventory,
    ludlowInventory,
    atsInventory,
    locationCapacities,
    reservedQuantities,
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
    processPickingList: async (listId: string, palletsQty?: number, totalUnits?: number) => {
      await processPickingListMutation.mutateAsync({ listId, palletsQty, totalUnits });
    },
    exportData,
    syncInventoryLocations,
    updateInventory,
    updateLudlowInventory,
    updateAtsInventory,
    updateSKUMetadata,
    syncFilters,
    getAvailableStock,
    showInactive,
    setShowInactive,
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
