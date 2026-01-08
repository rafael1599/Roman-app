import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

const InventoryContext = createContext();

export const InventoryProvider = ({ children }) => {
    const [inventoryData, setInventoryData] = useState([]);
    const [loading, setLoading] = useState(true);

    const trackLog = async (logData) => {
        try {
            const { error } = await supabase
                .from('inventory_logs')
                .insert([{
                    ...logData,
                    prev_quantity: logData.prev_quantity ?? null,
                    new_quantity: logData.new_quantity ?? null,
                    performed_by: 'Warehouse Team',
                    created_at: new Date().toISOString()
                }]);
            if (error) console.error('Logging error:', error);
        } catch (err) {
            console.error('Log tracking failed:', err);
        }
    };

    const fetchLogs = async () => {
        try {
            const { data, error } = await supabase
                .from('inventory_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) {
                console.error('Error fetching logs:', error);
                return [];
            }
            return data || [];
        } catch (err) {
            console.error('Fetch logs failed:', err);
            return [];
        }
    };
    const [error, setError] = useState(null);

    // 1. Initial Load
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('inventory')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setInventoryData(data || []);
            } catch (err) {
                console.error('Error loading inventory from Supabase:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
    }, []);

    // 2. Real-time Subscription
    useEffect(() => {
        const channel = supabase
            .channel('inventory_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'inventory' },
                (payload) => {
                    console.log('🔄 Real-time update received:', payload);

                    if (payload.eventType === 'INSERT') {
                        setInventoryData(prev => [payload.new, ...prev]);
                    } else if (payload.eventType === 'UPDATE') {
                        setInventoryData(prev => prev.map(item =>
                            item.id === payload.new.id ? payload.new : item
                        ));
                    } else if (payload.eventType === 'DELETE') {
                        setInventoryData(prev => prev.filter(item => item.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, []);

    // 3. Aggregate capacity per location
    const locationCapacities = useMemo(() => {
        const caps = {};
        inventoryData.forEach(item => {
            const key = `${item.Warehouse}-${item.Location}`;
            if (!caps[key]) caps[key] = { current: 0, max: 550 };
            caps[key].current += parseInt(item.Quantity || 0);
            // We use the capacity of the first item found for simplicity, or default
            if (item.Capacity) caps[key].max = item.Capacity;
        });
        return caps;
    }, [inventoryData]);

    // Helper to find local item by composite key (for quantity updates with no ID yet)
    const findItem = (sku, warehouse, location) => {
        return inventoryData.find(item =>
            item.SKU === sku &&
            item.Warehouse === warehouse &&
            item.Location === location
        );
    };

    const updateQuantity = async (sku, delta, warehouse = null, location = null) => {
        const item = findItem(sku, warehouse, location);
        if (!item) return;

        const newQty = Math.max(0, parseInt(item.Quantity || 0) + delta);

        // Optimistic update
        if (newQty === 0) {
            setInventoryData(prev => prev.map(i =>
                i.id === item.id ? { ...i, Quantity: 0 } : i
            ));
        } else {
            setInventoryData(prev => prev.map(i =>
                i.id === item.id ? { ...i, Quantity: newQty } : i
            ));
        }

        try {
            let res;
            if (newQty === 0) {
                res = await supabase.from('inventory').update({ Quantity: 0 }).eq('id', item.id);
            } else {
                res = await supabase.from('inventory').update({ Quantity: newQty }).eq('id', item.id);
            }

            if (res.error) throw res.error;

            await trackLog({
                sku: item.SKU,
                from_warehouse: item.Warehouse,
                from_location: item.Location,
                quantity: Math.abs(delta),
                prev_quantity: item.Quantity,
                new_quantity: newQty,
                action_type: delta < 0 ? 'DEDUCT' : 'EDIT'
            });

        } catch (err) {
            console.error('Failed to update quantity:', err);
            // Rollback on error
            setInventoryData(prev => {
                const exists = prev.some(i => i.id === item.id);
                if (!exists) return [...prev, item];
                return prev.map(i => i.id === item.id ? item : i);
            });
        }
    };

    const updateLudlowQuantity = (sku, delta, location = null) => updateQuantity(sku, delta, 'LUDLOW', location);
    const updateAtsQuantity = (sku, delta, location = null) => updateQuantity(sku, delta, 'ATS', location);

    const addItem = async (warehouse, newItem) => {
        const itemToInsert = {
            SKU: newItem.SKU || '',
            Location: newItem.Location || '',
            Quantity: parseInt(newItem.Quantity) || 0,
            Location_Detail: newItem.Location_Detail || '',
            Warehouse: warehouse,
            Status: newItem.Status || 'Active'
        };

        try {
            const { data, error } = await supabase
                .from('inventory')
                .insert([itemToInsert])
                .select();

            if (error) throw error;

            await trackLog({
                sku: newItem.SKU || '',
                to_warehouse: warehouse,
                to_location: newItem.Location || '',
                quantity: parseInt(newItem.Quantity) || 0,
                prev_quantity: 0,
                new_quantity: parseInt(newItem.Quantity) || 0,
                action_type: 'ADD'
            });
        } catch (err) {
            console.error('Error adding item:', err);
            alert('Error adding item: ' + err.message);
        }
    };

    const updateItem = async (warehouse, originalSku, updatedFormData) => {
        // Find by local search since we don't pass ID everywhere yet
        // In a real app we'd use ID, but to minimize changes elsewhere:
        const item = inventoryData.find(i => i.SKU === originalSku && i.Warehouse === warehouse);
        if (!item) return;

        try {
            const { error } = await supabase
                .from('inventory')
                .update({
                    SKU: updatedFormData.SKU,
                    Location: updatedFormData.Location,
                    Quantity: parseInt(updatedFormData.Quantity),
                    Location_Detail: updatedFormData.Location_Detail,
                    Warehouse: updatedFormData.Warehouse || item.Warehouse,
                    Status: updatedFormData.Status || item.Status
                })
                .eq('id', item.id);

            if (error) throw error;

            // Detect if it was a movement or just an edit
            const isMove = updatedFormData.Warehouse !== item.Warehouse || updatedFormData.Location !== item.Location;
            await trackLog({
                sku: item.SKU,
                from_warehouse: item.Warehouse,
                from_location: item.Location,
                to_warehouse: updatedFormData.Warehouse || item.Warehouse,
                to_location: updatedFormData.Location || item.Location,
                quantity: updatedFormData.Quantity,
                prev_quantity: item.Quantity,
                new_quantity: updatedFormData.Quantity,
                action_type: isMove ? 'MOVE' : 'EDIT'
            });
        } catch (err) {
            console.error('Error updating item:', err);
            alert('Error updating item: ' + err.message);
        }
    };

    const moveItem = async (sourceItem, targetWarehouse, targetLocation, qty) => {
        try {
            // 0. Concurrency Pre-check (Server-side check)
            const { data: serverItem, error: checkError } = await supabase
                .from('inventory')
                .select('Quantity')
                .eq('id', sourceItem.id)
                .single();

            if (checkError || !serverItem) throw new Error('Item no longer exists in source.');
            if (serverItem.Quantity < qty) {
                throw new Error(`Stock mismatch: Found ${serverItem.Quantity} units, but tried to move ${qty}. Use Undo or Refresh.`);
            }

            // 1. Update Source (Optimistic)
            const remainingQty = sourceItem.Quantity - qty;
            if (remainingQty <= 0) {
                setInventoryData(prev => prev.map(i => i.id === sourceItem.id ? { ...i, Quantity: 0 } : i));
                await supabase.from('inventory').update({ Quantity: 0 }).eq('id', sourceItem.id);
            } else {
                setInventoryData(prev => prev.map(i => i.id === sourceItem.id ? { ...i, Quantity: remainingQty } : i));
                await supabase.from('inventory').update({ Quantity: remainingQty }).eq('id', sourceItem.id);
            }

            // 2. Update Destination
            const existingTarget = inventoryData.find(i =>
                i.SKU === sourceItem.SKU &&
                i.Warehouse === targetWarehouse &&
                i.Location === targetLocation
            );

            if (existingTarget) {
                const newQty = (existingTarget.Quantity || 0) + qty;
                setInventoryData(prev => prev.map(i => i.id === existingTarget.id ? { ...i, Quantity: newQty } : i));
                await supabase.from('inventory').update({ Quantity: newQty }).eq('id', existingTarget.id);
            } else {
                const { data, error } = await supabase.from('inventory').insert([{
                    SKU: sourceItem.SKU,
                    Warehouse: targetWarehouse,
                    Location: targetLocation,
                    Quantity: qty,
                    Location_Detail: sourceItem.Location_Detail,
                    Status: sourceItem.Status || 'Active',
                    Capacity: 550
                }]).select();

                if (data?.[0]) {
                    setInventoryData(prev => [...prev, data[0]]);
                }
            }

            // 3. Track Log
            await trackLog({
                sku: sourceItem.SKU,
                from_warehouse: sourceItem.Warehouse,
                from_location: sourceItem.Location,
                to_warehouse: targetWarehouse,
                to_location: targetLocation,
                quantity: qty,
                prev_quantity: sourceItem.Quantity,
                new_quantity: remainingQty,
                action_type: 'MOVE'
            });

        } catch (err) {
            console.error('Movement failed:', err);
            alert('Transfer failed. Please check your connection.');
        }
    };

    const deleteItem = async (warehouse, sku) => {
        const item = inventoryData.find(i => i.SKU === sku && i.Warehouse === warehouse);
        if (!item) return;

        try {
            const { error } = await supabase
                .from('inventory')
                .delete()
                .eq('id', item.id);

            if (error) throw error;

            await trackLog({
                sku: sku,
                from_warehouse: warehouse,
                from_location: item.Location,
                quantity: item.Quantity,
                prev_quantity: item.Quantity,
                new_quantity: 0,
                action_type: 'DELETE'
            });
        } catch (err) {
            console.error('Error deleting item:', err);
        }
    };

    const undoAction = async (logId) => {
        try {
            const { data: log, error: fetchError } = await supabase
                .from('inventory_logs')
                .select('*')
                .eq('id', logId)
                .single();

            if (fetchError || !log) throw new Error('Action log not found');
            if (log.is_reversed) throw new Error('Action already undone');

            // --- Reversal Logic ---
            if (log.action_type === 'MOVE') {
                // MOVE B->A (Return items to source)
                await moveItem(
                    { SKU: log.sku, Quantity: log.quantity, Warehouse: log.to_warehouse, Location: log.to_location },
                    log.from_warehouse,
                    log.from_location,
                    log.quantity
                );
            } else if (log.action_type === 'DEDUCT') {
                // Return items (ADD back)
                await addItem(log.from_warehouse, {
                    SKU: log.sku,
                    Location: log.from_location,
                    Quantity: log.quantity
                });
            } else if (log.action_type === 'ADD') {
                // Remove added items (DELETE or Subtract)
                await updateQuantity(log.sku, -log.quantity, log.to_warehouse, log.to_location);
            } else if (log.action_type === 'EDIT') {
                // Restore previous quantity (Not as easy if other changes happened, but we try)
                await updateQuantity(log.sku, log.prev_quantity - log.new_quantity, log.from_warehouse, log.from_location);
            }

            // Mark as reversed
            await supabase
                .from('inventory_logs')
                .update({ is_reversed: true })
                .eq('id', logId);

        } catch (err) {
            console.error('Undo failed:', err.message);
            alert('Undo failed: ' + err.message);
        }
    };

    const exportData = () => {
        if (!inventoryData || !inventoryData.length) return;

        // Remove Supabase metadata for export
        const cleanData = inventoryData.map(({ id, created_at, ...rest }) => rest);

        const headers = Object.keys(cleanData[0]).join(',');
        const csvRows = cleanData.map(obj =>
            Object.values(obj).map(val => `"${val}"`).join(',')
        );
        const csvContent = [headers, ...csvRows].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const updateInventory = async (newData) => {
        // Batch update is complex in Supabase if we want to replace EVERYTHING.
        // Usually safer to upsert or handle specific changes.
        // For Smart Picking map builder:
        console.warn('updateInventory (bulk) is being called. Implementation depends on use case.');
        setInventoryData(newData);
    };

    return (
        <InventoryContext.Provider value={{
            inventoryData,
            ludlowData: inventoryData.filter(item => item.Warehouse === 'LUDLOW'),
            atsData: inventoryData.filter(item => item.Warehouse === 'ATS'),
            ludlowInventory: inventoryData.filter(item => item.Warehouse === 'LUDLOW'),
            atsInventory: inventoryData.filter(item => item.Warehouse === 'ATS'),
            locationCapacities,
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
            updateInventory,
            updateLudlowInventory: (newData) => {
                setInventoryData(prev => [
                    ...prev.filter(i => i.Warehouse !== 'LUDLOW'),
                    ...newData
                ]);
            },
            updateAtsInventory: (newData) => {
                setInventoryData(prev => [
                    ...prev.filter(i => i.Warehouse !== 'ATS'),
                    ...newData
                ]);
            }
        }}>
            {children}
        </InventoryContext.Provider>
    );
};

export const useInventory = () => {
    const context = useContext(InventoryContext);
    if (!context) throw new Error("useInventory must be used within an InventoryProvider");
    return context;
};
