import { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useInventoryLogs } from './useInventoryLogs';
import { useLocationManagement } from './useLocationManagement';
import { inventoryService, InventoryServiceContext } from '../services/inventoryService';
import {
    type InventoryItem,
    type InventoryItemWithMetadata
} from '../schemas/inventory.schema';
import { inventoryApi } from '../services/inventoryApi';
import { type SKUMetadataInput } from '../schemas/skuMetadata.schema';

interface InventoryContextType {
    inventoryData: InventoryItem[];
    ludlowData: InventoryItem[];
    atsData: InventoryItem[];
    ludlowInventory: InventoryItem[];
    atsInventory: InventoryItem[];
    locationCapacities: Record<string, { current: number; max: number }>;
    fetchLogs: () => Promise<any[]>;
    loading: boolean;
    error: string | null;
    updateQuantity: (sku: string, delta: number, warehouse?: string | null, location?: string | null, isReversal?: boolean) => Promise<void>;
    updateLudlowQuantity: (sku: string, delta: number, location?: string | null) => Promise<void>;
    updateAtsQuantity: (sku: string, delta: number, location?: string | null) => Promise<void>;
    addItem: (warehouse: string, newItem: any) => Promise<void>;
    updateItem: (warehouse: string, originalSku: string, updatedFormData: any) => Promise<void>;
    moveItem: (sourceItem: InventoryItem, targetWarehouse: string, targetLocation: string, qty: number, isReversal?: boolean) => Promise<void>;
    undoAction: (logId: string) => Promise<void>;
    deleteItem: (warehouse: string, sku: string) => Promise<void>;
    exportData: () => void;
    syncInventoryLocations: () => Promise<{ successCount: number; failCount: number }>;
    updateInventory: (newData: InventoryItem[]) => void;
    updateLudlowInventory: (newData: InventoryItem[]) => void;
    updateAtsInventory: (newData: InventoryItem[]) => void;
    updateSKUMetadata: (metadata: SKUMetadataInput) => Promise<void>;
    isAdmin: boolean;
    user: any;
    profile: any;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider = ({ children }: { children: ReactNode }) => {
    const [inventoryData, setInventoryData] = useState<InventoryItemWithMetadata[]>([]);
    const [skuMetadataMap, setSkuMetadataMap] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Identity & permissions
    const { isAdmin, user, profile } = useAuth();
    const userName = profile?.full_name || user?.email || 'Warehouse Team';

    // Sub-hooks
    const { trackLog, fetchLogs, undoAction: performUndo } = useInventoryLogs();
    const { locations } = useLocationManagement();

    const inventoryDataRef = useRef(inventoryData);
    useEffect(() => {
        inventoryDataRef.current = inventoryData;
    }, [inventoryData]);

    const logBuffersRef = useRef<Record<string, any>>({});

    // Initial Load
    useEffect(() => {
        const loadAllData = async () => {
            try {
                setLoading(true);
                // Fetch inventory and metadata in parallel
                const [inv, meta] = await Promise.all([
                    inventoryApi.fetchInventory(),
                    inventoryApi.fetchAllMetadata()
                ]);

                // Create metadata map for quick enrichment
                const metaMap: Record<string, any> = {};
                meta.forEach(m => { metaMap[m.sku] = m; });
                setSkuMetadataMap(metaMap);

                // Enrich inventory with metadata
                const enriched = inv.map(item => ({
                    ...item,
                    sku_metadata: metaMap[item.SKU] || item.sku_metadata
                }));

                setInventoryData(enriched || []);
            } catch (err: any) {
                console.error('Error loading inventory data:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadAllData();
    }, []);

    // Helper to enrich a single item
    const enrichItem = useCallback((item: any) => ({
        ...item,
        sku_metadata: skuMetadataMap[item.SKU] || item.sku_metadata
    }), [skuMetadataMap]);

    // Real-time Subscription
    useEffect(() => {
        const channel = supabase
            .channel('inventory_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setInventoryData(prev => [enrichItem(payload.new), ...prev]);
                } else if (payload.eventType === 'UPDATE') {
                    setInventoryData(prev => prev.map(item =>
                        item.id === payload.new.id ? enrichItem(payload.new) : item
                    ));
                } else if (payload.eventType === 'DELETE') {
                    setInventoryData(prev => prev.filter(item => item.id !== payload.old.id));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Capacity calculations
    const locationCapacities = useMemo(() => {
        const caps: Record<string, { current: number; max: number }> = {};

        locations.forEach(loc => {
            const key = `${loc.warehouse}-${loc.location}`;
            caps[key] = { current: 0, max: loc.max_capacity || 550 };
        });

        inventoryData.forEach(item => {
            const key = `${item.Warehouse}-${item.Location}`;
            if (!caps[key]) caps[key] = { current: 0, max: 550 };
            caps[key].current += Number(item.Quantity || 0);
        });

        return caps;
    }, [inventoryData, locations]);

    // Helper context for services
    const getServiceContext = (): InventoryServiceContext => ({
        isAdmin: !!isAdmin,
        userInfo: { performed_by: userName, user_id: user?.id },
        trackLog
    });

    const inventoryMap = useMemo(() => {
        const map = new Map<string, InventoryItem>();
        inventoryData.forEach(item => {
            const key = `${item.SKU}-${item.Warehouse}-${item.Location}`;
            map.set(key, item);
        });
        return map;
    }, [inventoryData]);

    const findItem = useCallback((sku: string, warehouse: string, location: string) => {
        const key = `${sku}-${warehouse}-${location}`;
        return inventoryMap.get(key);
    }, [inventoryMap]);

    // --- ACTIONS ---

    const updateQuantity = useCallback(async (sku: string, delta: number, warehouse: string | null = null, location: string | null = null, isReversal = false) => {
        const item = findItem(sku, warehouse || '', location || '');
        if (!item) return;

        const currentQty = Number(item.Quantity || 0);
        if (delta < 0 && currentQty <= 0) return;

        const newQty = Math.max(0, currentQty + delta);
        if (newQty === currentQty) return;

        // Optimistic UI update
        setInventoryData(prev => prev.map(i => i.id === item.id ? { ...i, Quantity: newQty } : i));

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
            timer: setTimeout(async () => {
                const finalBuffer = logBuffersRef.current[bufferKey];
                delete logBuffersRef.current[bufferKey];

                if (!finalBuffer || finalBuffer.netDelta === 0) return;

                const finalQty = Math.max(0, finalBuffer.initialQty + finalBuffer.netDelta);

                try {
                    const { error } = await supabase.from('inventory').update({ Quantity: finalQty }).eq('id', finalBuffer.item.id);
                    if (error) throw error;

                    const action = finalBuffer.netDelta > 0 ? 'ADD' : 'DEDUCT';
                    await trackLog({
                        sku: finalBuffer.item.SKU,
                        from_warehouse: finalBuffer.item.Warehouse as 'LUDLOW' | 'ATS',
                        from_location: finalBuffer.item.Location || undefined,
                        quantity: Math.abs(finalBuffer.netDelta),
                        prev_quantity: finalBuffer.initialQty,
                        new_quantity: finalQty,
                        action_type: action,
                        is_reversed: finalBuffer.isReversal
                    }, { performed_by: userName, user_id: user?.id });

                } catch (err) {
                    console.error('Failed to update quantity (debounced):', err);
                    setInventoryData(prev => prev.map(i =>
                        i.id === finalBuffer.item.id ? { ...i, Quantity: finalBuffer.initialQty } : i
                    ));
                }
            }, 500)
        };
    }, [findItem, trackLog, userName, user?.id]);

    const addItem = useCallback(async (warehouse: string, newItem: any) => {
        try {
            await inventoryService.addItem(warehouse, newItem, locations, getServiceContext());
        } catch (err: any) {
            console.error('Error adding item:', err);
            alert(err.message);
        }
    }, [locations, getServiceContext]);

    const updateItem = useCallback(async (warehouse: string, originalSku: string, updatedFormData: any) => {
        try {
            const ctx = getServiceContext();

            // Pass locations from hook state to service
            const result = await inventoryService.updateItem(
                warehouse,
                originalSku,
                updatedFormData,
                locations,
                ctx
            );

            // PHASE 3: Merge Feedback
            if (result && result.action === 'merged') {
                alert(`🚀 Dynamic Merge: Internal stock of "${result.source}" has been consolidated into existing SKU "${result.target}".`);
            }

        } catch (err: any) {
            console.error('Error updating item:', err);
            alert(err.message);
        }
    }, [locations, getServiceContext]);

    const moveItem = useCallback(async (sourceItem: InventoryItem, targetWarehouse: string, targetLocation: string, qty: number, isReversal = false) => {
        try {
            await inventoryService.moveItem(sourceItem, targetWarehouse, targetLocation, qty, locations, getServiceContext(), isReversal);
        } catch (err: any) {
            console.error('Error moving item:', err);
            alert(err.message);
        }
    }, [locations, getServiceContext]);

    const deleteItem = useCallback(async (warehouse: string, sku: string) => {
        const item = inventoryData.find(i => i.SKU === sku && i.Warehouse === warehouse);
        if (!item) return;

        try {
            const { error } = await supabase.from('inventory').delete().eq('id', item.id);
            if (error) throw error;

            await trackLog({
                sku,
                from_warehouse: warehouse as 'LUDLOW' | 'ATS',
                from_location: item.Location || undefined,
                quantity: item.Quantity,
                prev_quantity: item.Quantity,
                new_quantity: 0,
                action_type: 'DELETE',
                item_id: item.id
            }, { performed_by: userName, user_id: user?.id });
        } catch (err) {
            console.error('Error deleting item:', err);
        }
    }, [inventoryData, trackLog, userName, user?.id]);

    const undoAction = useCallback(async (logId: string) => {
        const result = await performUndo(logId, {
            addItem,
            moveItem,
            updateQuantity,
            updateItem
        });
        if (!result.success) alert('Undo failed: ' + result.error);
    }, [performUndo, addItem, moveItem, updateQuantity, updateItem]);

    const syncInventoryLocations = useCallback(async () => {
        return await inventoryService.syncInventoryLocations(inventoryData, locations);
    }, [inventoryData, locations]);

    const updateSKUMetadata = useCallback(async (metadata: SKUMetadataInput) => {
        try {
            const updated = await inventoryApi.upsertMetadata(metadata);

            // Update metadata map
            setSkuMetadataMap(prev => ({ ...prev, [metadata.sku]: updated }));

            // Update local state for all items with this SKU
            setInventoryData(prev => prev.map(item =>
                item.SKU === metadata.sku ? { ...item, sku_metadata: updated } : item
            ));
        } catch (err: any) {
            console.error('Error updating SKU metadata:', err);
            throw err;
        }
    }, []);

    const exportData = useCallback(() => {
        if (!inventoryData.length) return;
        const cleanData = inventoryData.map(({ id, created_at, ...rest }) => rest);
        const headers = Object.keys(cleanData[0] || {}).join(',');
        const csvRows = cleanData.map(obj => Object.values(obj).map(val => `"${val}"`).join(','));
        const csvContent = [headers, ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }, [inventoryData]);

    const contextValue: InventoryContextType = useMemo(() => ({
        inventoryData,
        ludlowData: inventoryData.filter(i => i.Warehouse === 'LUDLOW'),
        atsData: inventoryData.filter(i => i.Warehouse === 'ATS'),
        ludlowInventory: inventoryData.filter(i => i.Warehouse === 'LUDLOW'),
        atsInventory: inventoryData.filter(i => i.Warehouse === 'ATS'),
        locationCapacities,
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
        updateInventory: (newData) => setInventoryData(newData),
        updateLudlowInventory: (newData) => {
            setInventoryData(prev => [...prev.filter(i => i.Warehouse !== 'LUDLOW'), ...newData]);
        },
        updateAtsInventory: (newData) => {
            setInventoryData(prev => [...prev.filter(i => i.Warehouse !== 'ATS'), ...newData] as InventoryItemWithMetadata[]);
        },
        updateSKUMetadata,
        isAdmin: !!isAdmin,
        user,
        profile
    }), [
        inventoryData,
        locationCapacities,
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
        user,
        profile
    ]);

    return (
        <InventoryContext.Provider value={contextValue}>
            {children}
        </InventoryContext.Provider>
    );
};

export const useInventory = () => {
    const context = useContext(InventoryContext);
    if (!context) throw new Error("useInventory must be used within an InventoryProvider");
    return context;
};
