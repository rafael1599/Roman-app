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
import { inventoryService as legacyInventoryService } from '../services/inventoryService';
import { inventoryService, type InventoryServiceContext } from '../services/inventory.service';
import { type InventoryItem, type InventoryItemWithMetadata, type InventoryItemInput } from '../schemas/inventory.schema';
import { inventoryApi } from '../services/inventoryApi';
import { type SKUMetadata, type SKUMetadataInput } from '../schemas/skuMetadata.schema';
import { type InventoryLog } from '../schemas/log.schema';
import { debounce } from '../utils/debounce';

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
  isAdmin: boolean;
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  user: any; // Auth User object is usually complex, keeping any for now but can be User
  profile: any; // Profile is also from AuthContext
  demoLogs: InventoryLog[];
  resetDemo: () => void;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider = ({ children }: { children: ReactNode }) => {
  const [inventoryData, setInventoryData] = useState<InventoryItemWithMetadata[]>([]);
  const [demoInventoryData, setDemoInventoryData] = useState<InventoryItemWithMetadata[]>([]);
  const [demoLogs, setDemoLogs] = useState<InventoryLog[]>([]);
  const [skuMetadataMap, setSkuMetadataMap] = useState<Record<string, SKUMetadata>>({});
  const [reservedQuantities, setReservedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Identity & permissions
  const { isAdmin, isDemoMode, toggleDemoMode, user, profile } = useAuth();
  const userName = profile?.full_name || user?.email || 'Warehouse Team';

  // Current effective data
  const activeData = isDemoMode ? demoInventoryData : inventoryData;

  // Sub-hooks
  const { trackLog, fetchLogs, undoAction: performUndo } = useInventoryLogs();
  const { locations } = useLocationManagement();

  const inventoryDataRef = useRef(inventoryData);
  useEffect(() => {
    inventoryDataRef.current = inventoryData;
  }, [inventoryData]);

  const logBuffersRef = useRef<Record<string, any>>({});

  // Initial Load - Parallel queries (JOIN not possible without FK relationship)
  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);

        // Fetch inventory and metadata in parallel
        const [inv, meta] = await Promise.all([
          inventoryApi.fetchInventory(),
          inventoryApi.fetchAllMetadata(),
        ]);
        console.log('📦 Inventory loaded:', inv.length);

        // Create metadata map for quick enrichment
        const metaMap: Record<string, SKUMetadata> = {};
        meta.forEach((m) => {
          metaMap[m.sku] = m;
        });
        setSkuMetadataMap(metaMap);

        // Enrich inventory with metadata
        const enriched: InventoryItemWithMetadata[] = inv.map((item) => ({
          ...item,
          sku_metadata: metaMap[item.SKU] || (item as any).sku_metadata,
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

  // Initialize demo data from real data when entering demo mode
  useEffect(() => {
    if (isDemoMode && demoInventoryData.length === 0 && inventoryData.length > 0) {
      setDemoInventoryData(inventoryData);
    }
  }, [isDemoMode, inventoryData]);

  const resetDemo = useCallback(() => {
    setDemoInventoryData(inventoryData);
    setDemoLogs([]);
  }, [inventoryData]);

  // Helper to enrich a single item
  const enrichItem = useCallback(
    (item: InventoryItem): InventoryItemWithMetadata => ({
      ...item,
      sku_metadata: skuMetadataMap[item.SKU] || (item as any).sku_metadata,
    }),
    [skuMetadataMap]
  );

  // Real-time Subscription (Inventory)
  useEffect(() => {
    const channel = supabase
      .channel('inventory_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setInventoryData((prev) => [enrichItem(payload.new as InventoryItem), ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setInventoryData((prev) =>
            prev.map((item) => (item.id === payload.new.id ? enrichItem(payload.new as InventoryItem) : item))
          );
        } else if (payload.eventType === 'DELETE') {
          setInventoryData((prev) => prev.filter((item) => item.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Reservation Logic
  // Reservation Logic
  // Reservation Logic
  const calculateReservations = useCallback((lists: { items: unknown }[]) => {
    const reservations: Record<string, number> = {};
    lists.forEach((list) => {
      const items = list.items as unknown as { SKU: string; Warehouse: string; Location: string; pickingQty: number }[];
      if (Array.isArray(items)) {
        items.forEach((item) => {
          const key = `${item.SKU}|${item.Warehouse}|${item.Location}`;
          reservations[key] = (reservations[key] || 0) + (item.pickingQty || 0);
        });
      }
    });
    setReservedQuantities(reservations);
  }, []);

  const fetchReservations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('picking_lists')
        .select('id, items, status')
        .in('status', ['ready_to_double_check', 'double_checking', 'needs_correction']);

      if (error) throw error;
      // console.log('🔄 [Reservations] Recalculating reserved stock...', { count: data?.length });
      calculateReservations(data || []);
    } catch (err) {
      console.error('Error fetching reservations:', err);
    }
  }, [calculateReservations]);

  // Real-time Subscription (Picking Lists for reservations)
  // OPTIMIZATION: Debounced to prevent mass refetches when multiple lists change rapidly
  useEffect(() => {
    fetchReservations();

    // Create debounced version to throttle realtime updates
    const debouncedFetchReservations = debounce(fetchReservations, 200);

    const channel = supabase
      .channel('picking_lists_reservations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'picking_lists',
        },
        () => {
          debouncedFetchReservations(); // Max 1 call per second
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReservations]);

  // Capacity calculations
  const locationCapacities = useMemo(() => {
    const caps: Record<string, { current: number; max: number }> = {};

    locations.forEach((loc) => {
      const key = `${loc.warehouse}-${loc.location}`;
      caps[key] = { current: 0, max: loc.max_capacity || 550 };
    });

    inventoryData.forEach((item) => {
      const key = `${item.Warehouse}-${item.Location}`;
      if (!caps[key]) caps[key] = { current: 0, max: 550 };
      caps[key].current += Number(item.Quantity || 0);
    });

    return caps;
  }, [inventoryData, locations]);

  // Demo Capacity calculations
  const demoLocationCapacities = useMemo(() => {
    const caps: Record<string, { current: number; max: number }> = {};

    locations.forEach((loc) => {
      const key = `${loc.warehouse}-${loc.location}`;
      caps[key] = { current: 0, max: loc.max_capacity || 550 };
    });

    demoInventoryData.forEach((item) => {
      const key = `${item.Warehouse}-${item.Location}`;
      if (!caps[key]) caps[key] = { current: 0, max: 550 };
      caps[key].current += Number(item.Quantity || 0);
    });

    return caps;
  }, [demoInventoryData, locations]);

  const activeCapacities = isDemoMode ? demoLocationCapacities : locationCapacities;

  // Helper context for services
  const getServiceContext = (): InventoryServiceContext => ({
    isAdmin: !!isAdmin,
    userInfo: { performed_by: userName, user_id: user?.id },
    trackLog,
  });

  const findItem = useCallback(
    (sku: string, warehouse: string, location: string) => {
      const key = `${sku}-${warehouse}-${location}`;
      const map = new Map<string, InventoryItem>();
      activeData.forEach((item) => {
        const k = `${item.SKU}-${item.Warehouse}-${item.Location}`;
        map.set(k, item);
      });
      return map.get(key);
    },
    [activeData]
  );

  // --- ACTIONS ---

  const updateQuantity = useCallback(
    async (
      sku: string,
      delta: number,
      warehouse: string | null = null,
      location: string | null = null,
      isReversal = false,
      listId?: string,
      orderNumber?: string
    ) => {
      const item = findItem(sku, warehouse || '', location || '');
      if (!item) return;

      const currentQty = Number(item.Quantity || 0);
      // Don't allow negative deltas on items with no stock, UNLESS this is a reversal operation
      if (delta < 0 && currentQty <= 0 && !isReversal) return;

      const newQty = Math.max(0, currentQty + delta);
      if (newQty === currentQty) return;

      if (isDemoMode) {
        setDemoInventoryData((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, Quantity: newQty } : i))
        );
        // Add to demo logs
        const action = delta > 0 ? 'ADD' : 'DEDUCT';
        setDemoLogs((prev) => [
          {
            id: `demo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            sku,
            from_warehouse: warehouse as any,
            from_location: location as any,
            quantity: Math.abs(delta),
            prev_quantity: currentQty,
            new_quantity: newQty,
            action_type: action,
            created_at: new Date(),
            performed_by: userName,
            is_reversed: false,
            to_warehouse: null,
            to_location: null,
            list_id: listId || null,
            order_number: orderNumber || null,
          } as InventoryLog,
          ...prev,
        ]);
        return;
      }

      // Optimistic UI update
      setInventoryData((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, Quantity: newQty } : i))
      );

      // Debounce database updates
      const bufferKey = `${item.id}`;
      const existingBuffer = logBuffersRef.current[bufferKey];
      if (existingBuffer?.timer) clearTimeout(existingBuffer.timer);

      const netDelta = (existingBuffer?.netDelta || 0) + delta;
      const initialQty = existingBuffer?.initialQty ?? currentQty;

      logBuffersRef.current[bufferKey] = {
        netDelta,
        initialQty,
        item,
        isReversal,
        listId,
        orderNumber,
        timer: setTimeout(async () => {
          const finalBuffer = logBuffersRef.current[bufferKey];
          delete logBuffersRef.current[bufferKey];

          if (!finalBuffer || finalBuffer.netDelta === 0) return;

          // 1. Fetch latest server quantity to minimize overwrite impact
          const { data: latestItem } = await supabase
            .from('inventory')
            .select('Quantity')
            .eq('id', finalBuffer.item.id)
            .single();

          const serverQty = latestItem ? Number(latestItem.Quantity) : finalBuffer.initialQty;
          const finalQty = Math.max(0, serverQty + finalBuffer.netDelta);
          const actualChange = finalQty - serverQty;

          if (actualChange === 0) return;

          try {
            const { error } = await supabase
              .from('inventory')
              .update({ Quantity: finalQty })
              .eq('id', finalBuffer.item.id);
            if (error) throw error;

            const action = actualChange > 0 ? 'ADD' : 'DEDUCT';
            await trackLog(
              {
                sku: finalBuffer.item.SKU,
                from_warehouse: finalBuffer.item.Warehouse as 'LUDLOW' | 'ATS',
                from_location: finalBuffer.item.Location || undefined,
                quantity: Math.abs(actualChange),
                prev_quantity: serverQty,
                new_quantity: finalQty,
                action_type: action,
                is_reversed: finalBuffer.isReversal,
                list_id: finalBuffer.listId,
                order_number: finalBuffer.orderNumber,
              },
              { performed_by: userName, user_id: user?.id }
            );

            // Invalidate the infinite query to refresh the list
            queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
          } catch (err) {
            console.error('Failed to update quantity (debounced):', err);
            // Revert to initial state on error
            setInventoryData((prev) =>
              prev.map((i) => (i.id === finalBuffer.item.id ? { ...i, Quantity: serverQty } : i))
            );
          }
        }, 500),
      };
    },
    [findItem, trackLog, userName, user?.id]
  );

  const addItem = useCallback(
    async (warehouse: string, newItem: InventoryItemInput) => {
      if (isDemoMode) {
        const id = `demo-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const item: InventoryItemWithMetadata = {
          SKU: newItem.SKU || '',
          Quantity: newItem.Quantity || 0,
          Warehouse: warehouse as any, // "LUDLOW" | "ATS"
          Location: newItem.Location || null, // null is valid for InventoryItem
          sku_note: newItem.sku_note || '',
          Status: newItem.Status || 'Active',
          id: id,
          created_at: new Date(),
          location_id: null,
          Capacity: undefined,
        };
        setDemoInventoryData((prev) => [item, ...prev]);
        setDemoLogs((prev) => [
          {
            id: `demo-log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            sku: newItem.SKU,
            to_warehouse: warehouse,
            to_location: newItem.Location || null,
            quantity: newItem.Quantity,
            action_type: 'ADD',
            created_at: new Date(),
            performed_by: userName,
            is_reversed: false,
          } as InventoryLog,
          ...prev,
        ]);
        return;
      }
      try {
        await inventoryService.addItem(warehouse, newItem, locations, getServiceContext());
        queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error adding item';
        console.error('Error adding item:', err);
        toast.error(errorMsg);
      }
    },
    [isDemoMode, locations, getServiceContext, userName]
  );

  const updateItem = useCallback(
    async (originalItem: InventoryItem, updatedFormData: InventoryItemInput) => {
      if (isDemoMode) {
        setDemoInventoryData((prev) =>
          prev.map((i) =>
            i.SKU === originalItem.SKU && i.Warehouse === originalItem.Warehouse // Use originalItem for matching
              ? { ...i, ...updatedFormData }
              : i
          )
        );
        setDemoLogs((prev) => [
          {
            id: `demo-upd-log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            sku: updatedFormData.SKU || originalItem.SKU,
            from_warehouse: originalItem.Warehouse as any,
            from_location: originalItem.Location || null,
            to_warehouse: (updatedFormData as any).Warehouse || null,
            to_location: (updatedFormData as any).Location || null,
            quantity: 0,
            prev_quantity: originalItem.Quantity,
            new_quantity: (updatedFormData as any).Quantity || originalItem.Quantity,
            action_type: 'EDIT',
            created_at: new Date(),
            performed_by: userName,
            is_reversed: false,
          } as InventoryLog,
          ...prev,
        ]);
        return;
      }
      try {
        const ctx = getServiceContext();
        const result = await legacyInventoryService.updateItem(
          originalItem,
          updatedFormData,
          locations,
          ctx
        );
        queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });

        if (result && result.action === 'merged') {
          toast.success(
            `🚀 Dynamic Merge: Internal stock of "${result.source}" has been consolidated into existing SKU "${result.target}".`
          );
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error updating item';
        console.error('Error updating item:', err);
        toast.error(errorMsg);
      }
    },
    [isDemoMode, locations, getServiceContext, userName]
  );

  const moveItem = useCallback(
    async (
      sourceItem: InventoryItem,
      targetWarehouse: string,
      targetLocation: string,
      qty: number,
      isReversal = false
    ) => {
      if (isDemoMode) {
        const newSourceQty = Math.max(0, Number(sourceItem.Quantity) - qty);

        setDemoInventoryData((prev) => {
          let updated = prev.map((i) =>
            i.id === sourceItem.id ? { ...i, Quantity: newSourceQty } : i
          );
          const targetIdx = updated.findIndex(
            (i) =>
              i.SKU === sourceItem.SKU &&
              i.Warehouse === targetWarehouse &&
              i.Location === targetLocation
          );
          if (targetIdx >= 0) {
            updated = updated.map((item, idx) =>
              idx === targetIdx ? { ...item, Quantity: Number(item.Quantity) + qty } : item
            );
          } else {
            updated.push({
              ...sourceItem,
              id: `demo-move-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              Warehouse: targetWarehouse as any,
              Location: targetLocation,
              Quantity: qty,
              created_at: new Date(),
            } as any);
          }
          return updated;
        });

        setDemoLogs((prev) => [
          {
            id: `demo-move-log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            sku: sourceItem.SKU,
            from_warehouse: sourceItem.Warehouse as any,
            from_location: sourceItem.Location as any,
            to_warehouse: targetWarehouse as any,
            to_location: targetLocation as any,
            quantity: qty,
            prev_quantity: sourceItem.Quantity,
            new_quantity: newSourceQty,
            action_type: 'MOVE',
            created_at: new Date(),
            performed_by: userName,
            is_reversed: false,
          } as InventoryLog,
          ...prev,
        ]);
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
    [isDemoMode, locations, getServiceContext, userName]
  );

  const deleteItem = useCallback(
    async (warehouse: string, sku: string) => {
      const item = activeData.find((i) => i.SKU === sku && i.Warehouse === warehouse);
      if (!item) return;

      if (isDemoMode) {
        setDemoInventoryData((prev) => prev.filter((i) => i.id !== item.id));
        setDemoLogs((prev) => [
          {
            id: `demo-del-log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            sku,
            from_warehouse: warehouse as any,
            from_location: item.Location as any,
            to_warehouse: null,
            to_location: null,
            quantity: item.Quantity,
            prev_quantity: item.Quantity,
            new_quantity: 0,
            action_type: 'DELETE',
            created_at: new Date(),
            performed_by: userName,
            is_reversed: false,
          } as InventoryLog,
          ...prev,
        ]);
        return;
      }

      try {
        const { error } = await supabase.from('inventory').delete().eq('id', item.id);
        if (error) throw error;

        await trackLog(
          {
            sku,
            from_warehouse: warehouse as 'LUDLOW' | 'ATS',
            from_location: item.Location || undefined,
            quantity: item.Quantity,
            prev_quantity: item.Quantity,
            new_quantity: 0,
            action_type: 'DELETE',
            item_id: (typeof item.id === 'string' ? parseInt(item.id) : item.id) as number,
          },
          { performed_by: userName, user_id: user?.id }
        );
        queryClient.invalidateQueries({ queryKey: inventoryKeys.lists() });
      } catch (err) {
        console.error('Error deleting item:', err);
      }
    },
    [activeData, isDemoMode, trackLog, userName, user?.id]
  );

  const undoAction = useCallback(
    async (logId: string) => {
      if (isDemoMode) {
        if (logId.startsWith('demo-')) {
          // TODO: Implement local undo for demo actions if needed.
          // For now, we block it to avoid complexity/confusion or modifying the real DB logic.
          toast.error('Undo is currently not supported for simulated actions in Demo Mode.');
        } else {
          toast.error('Cannot undo real production actions while in Demo Mode.');
        }
        return;
      }
      const result = await performUndo(logId, {
        addItem,
        moveItem,
        updateQuantity,
        updateItem,
      });
      if (!result.success) toast.error('Undo failed: ' + result.error);
    },
    [performUndo, addItem, moveItem, updateQuantity, updateItem, isDemoMode]
  );

  const syncInventoryLocations = useCallback(async () => {
    if (isDemoMode) {
      console.log('Skipping syncInventoryLocations in Demo Mode');
      return { successCount: 0, failCount: 0 };
    }
    return await legacyInventoryService.syncInventoryLocations(inventoryData, locations);
  }, [inventoryData, locations, isDemoMode]);

  const updateSKUMetadata = useCallback(
    async (metadata: SKUMetadataInput) => {
      if (isDemoMode) {
        // Simulate metadata update locally
        setSkuMetadataMap((prev) => ({ ...prev, [metadata.sku]: metadata }));
        setDemoInventoryData((prev) =>
          prev.map((item) =>
            item.SKU === metadata.sku ? { ...item, sku_metadata: metadata } : item
          )
        );
        return;
      }

      try {
        const updated = await inventoryApi.upsertMetadata(metadata);

        // Update metadata map
        setSkuMetadataMap((prev) => ({ ...prev, [metadata.sku]: updated }));

        // Update local state for all items with this SKU
        setInventoryData((prev) =>
          prev.map((item) =>
            item.SKU === metadata.sku ? { ...item, sku_metadata: updated } : item
          )
        );
      } catch (err: unknown) {
        console.error('Error updating SKU metadata:', err);
        throw err;
      }
    },
    [isDemoMode]
  );

  const exportData = useCallback(() => {
    if (!inventoryData.length) return;
    const cleanData = inventoryData.map(({ id, created_at, ...rest }) => rest);
    const headers = Object.keys(cleanData[0] || {}).join(',');
    const csvRows = cleanData.map((obj) =>
      Object.values(obj)
        .map((val) => `"${val}"`)
        .join(',')
    );
    const csvContent = [headers, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }, [inventoryData]);

  const contextValue: InventoryContextType = useMemo(
    () => ({
      inventoryData: activeData,
      ludlowData: activeData.filter((i) => i.Warehouse === 'LUDLOW'),
      atsData: activeData.filter((i) => i.Warehouse === 'ATS'),
      ludlowInventory: activeData.filter((i) => i.Warehouse === 'LUDLOW'),
      atsInventory: activeData.filter((i) => i.Warehouse === 'ATS'),
      locationCapacities: activeCapacities,
      reservedQuantities,
      fetchLogs,
      loading,
      error,
      updateQuantity,
      updateLudlowQuantity: (sku, delta, loc) => updateQuantity(sku, delta, 'LUDLOW', loc),
      updateAtsQuantity: (sku, delta, loc) => updateQuantity(sku, delta, 'ATS', loc),
      addItem,
      updateItem,
      moveItem,
      undoAction,
      deleteItem,
      exportData,
      syncInventoryLocations,
      updateInventory: (newData) => {
        if (isDemoMode) setDemoInventoryData(newData);
        else setInventoryData(newData);
      },
      updateLudlowInventory: (newData) => {
        if (isDemoMode) {
          setDemoInventoryData((prev) => [
            ...prev.filter((i) => i.Warehouse !== 'LUDLOW'),
            ...newData,
          ]);
        } else {
          setInventoryData((prev) => [...prev.filter((i) => i.Warehouse !== 'LUDLOW'), ...newData]);
        }
      },
      updateAtsInventory: (newData) => {
        if (isDemoMode) {
          setDemoInventoryData(
            (prev) =>
              [
                ...prev.filter((i) => i.Warehouse !== 'ATS'),
                ...newData,
              ] as InventoryItemWithMetadata[]
          );
        } else {
          setInventoryData(
            (prev) =>
              [
                ...prev.filter((i) => i.Warehouse !== 'ATS'),
                ...newData,
              ] as InventoryItemWithMetadata[]
          );
        }
      },
      updateSKUMetadata,
      isAdmin: !!isAdmin,
      isDemoMode,
      toggleDemoMode,
      user,
      profile,
      demoLogs,
      resetDemo,
    }),
    [
      activeData,
      activeCapacities,
      reservedQuantities,
      fetchLogs,
      loading,
      error,
      updateQuantity,
      addItem,
      updateItem,
      moveItem,
      undoAction,
      deleteItem,
      exportData,
      syncInventoryLocations,
      updateSKUMetadata,
      isAdmin,
      isDemoMode,
      toggleDemoMode,
      user,
      profile,
      demoLogs,
      resetDemo,
    ]
  );

  return <InventoryContext.Provider value={contextValue}>{children}</InventoryContext.Provider>;
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) throw new Error('useInventory must be used within an InventoryProvider');
  return context;
};
