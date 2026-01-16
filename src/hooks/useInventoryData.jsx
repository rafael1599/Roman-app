import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const InventoryContext = createContext();

export const InventoryProvider = ({ children }) => {
    const [inventoryData, setInventoryData] = useState([]);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);

    const trackLog = async (logData) => {
        try {
            const { error } = await supabase
                .from('inventory_logs')
                .insert([{
                    ...logData,
                    prev_quantity: logData.prev_quantity ?? null,
                    new_quantity: logData.new_quantity ?? null,
                    is_reversed: logData.is_reversed || false,
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

    // Ref to access latest state in async handlers
    const inventoryDataRef = useRef(inventoryData);
    useEffect(() => {
        inventoryDataRef.current = inventoryData;
    }, [inventoryData]);

    // 1. Initial Load
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                setLoading(true);
                const [invRes, locRes] = await Promise.all([
                    supabase.from('inventory').select('*').order('created_at', { ascending: false }),
                    supabase.from('locations').select('*')
                ]);

                if (invRes.error) throw invRes.error;
                if (locRes.error) throw locRes.error;

                setInventoryData(invRes.data || []);
                setLocations(locRes.data || []);
            } catch (err) {
                console.error('Error loading data from Supabase:', err);
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

        // Initialize from locations table first to get correct Max Capacity
        locations.forEach(loc => {
            const key = `${loc.warehouse}-${loc.location}`;
            caps[key] = {
                current: 0,
                max: loc.max_capacity || 550 // Fallback only if null in DB
            };
        });

        // Sum current inventory
        inventoryData.forEach(item => {
            const key = `${item.Warehouse}-${item.Location}`;
            if (!caps[key]) {
                // Item in location not found in locations table (legacy or error)
                caps[key] = { current: 0, max: 550 };
            }
            caps[key].current += parseInt(item.Quantity || 0);
        });
        return caps;
    }, [inventoryData, locations]);

    // Helper using REF to find item synchronously with latest state
    const findItem = (sku, warehouse, location) => {
        return inventoryDataRef.current.find(item =>
            item.SKU === sku &&
            item.Warehouse === warehouse &&
            item.Location === location
        );
    };

    const updateQuantity = async (sku, delta, warehouse = null, location = null, isReversal = false) => {
        const item = findItem(sku, warehouse, location);
        if (!item) return;

        const currentQty = parseInt(item.Quantity || 0);

        // Validation Guard: Prevent going below zero
        if (delta < 0 && currentQty <= 0) {
            console.warn('Blocked: Cannot decrement below 0');
            return;
        }

        const newQty = Math.max(0, currentQty + delta);

        // Validation Guard: Prevent no-op updates (logging nothing)
        if (newQty === currentQty) return;

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
                action_type: delta < 0 ? 'DEDUCT' : 'EDIT',
                is_reversed: isReversal
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

    const { role, isAdmin } = useAuth();

    /**
     * Resolves a location name, mapping numeric "9" to "Row 9" if applicable.
     * Also checks if the location is new and if the user has permission to create it.
     */
    const resolveLocation = async (warehouse, inputLocation) => {
        if (!inputLocation) return { name: '', isNew: false };

        // 1. Check if exact match exists in locations table
        const exactMatch = locations.find(
            l => l.warehouse === warehouse && l.location.toLowerCase() === inputLocation.toLowerCase()
        );

        if (exactMatch) {
            return { name: exactMatch.location, isNew: false };
        }

        // 2. Business Rule: Mapping numeric "9" to "Row 9"
        const isNumeric = /^\d+$/.test(inputLocation);
        if (isNumeric) {
            const rowLocation = `Row ${inputLocation}`;
            const rowMatch = locations.find(
                l => l.warehouse === warehouse && l.location.toLowerCase() === rowLocation.toLowerCase()
            );

            if (rowMatch) {
                return { name: rowMatch.location, isNew: false };
            }

            // If it's numeric but no "Row X" exists, we treat "Row X" as the target name
            return { name: rowLocation, isNew: !locations.some(l => l.warehouse === warehouse && l.location === rowLocation) };
        }

        return { name: inputLocation, isNew: true };
    };

    const addItem = async (warehouse, newItem) => {
        const qty = parseInt(newItem.Quantity) || 0;
        const inputLocation = newItem.Location || '';

        // Resolve location mapping and check if new
        const { name: targetLocation, isNew } = await resolveLocation(warehouse, inputLocation);

        // Security Check: Only admins can use/create new locations
        if (isNew && !isAdmin) {
            const errorMsg = `Unauthorized: Only administrators can create or use new locations ("${targetLocation}"). Please use an existing location.`;
            console.warn(errorMsg);
            alert(errorMsg);
            throw new Error(errorMsg);
        }

        // Auto-create location record for admin if it's new
        if (isNew && isAdmin) {
            try {
                await supabase.from('locations').insert([{
                    warehouse,
                    location: targetLocation,
                    max_capacity: 550,
                    zone: 'UNASSIGNED'
                }]);
                // We don't need to manually update local `locations` state here 
                // because we should probably have a subscription or a refresh mechanism,
                // but let's assume the user wants it at least in the inventory table.
            } catch (err) {
                console.error('Failed to auto-create location record:', err);
            }
        }

        // 1. Check if item already exists in this specific location
        const existingItem = findItem(newItem.SKU, warehouse, targetLocation);

        if (existingItem) {
            // UPDATE existing item
            const newTotal = (parseInt(existingItem.Quantity) || 0) + qty;

            // Optimistic Update
            setInventoryData(prev => prev.map(i =>
                i.id === existingItem.id ? { ...i, Quantity: newTotal } : i
            ));

            try {
                const { error } = await supabase
                    .from('inventory')
                    .update({ Quantity: newTotal })
                    .eq('id', existingItem.id);

                if (error) throw error;

                await trackLog({
                    sku: newItem.SKU || '',
                    to_warehouse: warehouse,
                    to_location: targetLocation,
                    quantity: qty,
                    prev_quantity: existingItem.Quantity,
                    new_quantity: newTotal,
                    action_type: 'ADD', // Keep as ADD (Restock)
                    is_reversed: newItem.isReversal || false
                });
            } catch (err) {
                console.error('Error updating existing item (add):', err);
                alert('Error restocking item: ' + err.message);
                // Rollback
                setInventoryData(prev => prev.map(i =>
                    i.id === existingItem.id ? existingItem : i
                ));
            }
            return;
        }

        // 2. INSERT new item (if not exists)
        const itemToInsert = {
            SKU: newItem.SKU || '',
            Location: targetLocation,
            Quantity: qty,
            Location_Detail: newItem.Location_Detail || '',
            Warehouse: warehouse,
            Status: newItem.Status || 'Active'
        };

        try {
            const { error } = await supabase
                .from('inventory')
                .insert([itemToInsert]);

            if (error) throw error;

            await trackLog({
                sku: newItem.SKU || '',
                to_warehouse: warehouse,
                to_location: targetLocation,
                quantity: qty,
                prev_quantity: 0,
                new_quantity: qty,
                action_type: 'ADD',
                is_reversed: newItem.isReversal || false
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

        // Detect if it was a movement or just an edit
        const inputLocation = updatedFormData.Location || item.Location;
        const { name: targetLocation, isNew } = await resolveLocation(updatedFormData.Warehouse || item.Warehouse, inputLocation);

        // Security Check
        if (isNew && !isAdmin) {
            const errorMsg = `Unauthorized: Only administrators can create or use new locations ("${targetLocation}").`;
            alert(errorMsg);
            throw new Error(errorMsg);
        }

        if (isNew && isAdmin) {
            try {
                await supabase.from('locations').insert([{
                    warehouse: updatedFormData.Warehouse || item.Warehouse,
                    location: targetLocation,
                    max_capacity: 550,
                    zone: 'UNASSIGNED'
                }]);
            } catch (err) {
                console.error('Failed to auto-create location record (update):', err);
            }
        }

        try {
            const { error } = await supabase
                .from('inventory')
                .update({
                    SKU: updatedFormData.SKU,
                    Location: targetLocation,
                    Quantity: parseInt(updatedFormData.Quantity),
                    Location_Detail: updatedFormData.Location_Detail,
                    Warehouse: updatedFormData.Warehouse || item.Warehouse,
                    Status: updatedFormData.Status || item.Status
                })
                .eq('id', item.id);

            if (error) throw error;

            const isMove = (updatedFormData.Warehouse || item.Warehouse) !== item.Warehouse || targetLocation !== item.Location;
            await trackLog({
                sku: item.SKU,
                from_warehouse: item.Warehouse,
                from_location: item.Location,
                to_warehouse: updatedFormData.Warehouse || item.Warehouse,
                to_location: targetLocation,
                quantity: updatedFormData.Quantity,
                prev_quantity: item.Quantity,
                new_quantity: updatedFormData.Quantity,
                action_type: isMove ? 'MOVE' : 'EDIT',
                is_reversed: updatedFormData.isReversal || false
            });
        } catch (err) {
            console.error('Error updating item:', err);
            alert('Error updating item: ' + err.message);
        }
    };

    const moveItem = async (sourceItem, targetWarehouse, targetLocation, qty, isReversal = false) => {
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

        // Resolve target location mapping and check if new
        const { name: resolvedTargetLocation, isNew } = await resolveLocation(targetWarehouse, targetLocation);

        // Security Check
        if (isNew && !isAdmin) {
            const errorMsg = `Unauthorized: Only administrators can create or use new locations ("${resolvedTargetLocation}").`;
            alert(errorMsg);
            throw new Error(errorMsg);
        }

        if (isNew && isAdmin) {
            try {
                await supabase.from('locations').insert([{
                    warehouse: targetWarehouse,
                    location: resolvedTargetLocation,
                    max_capacity: 550,
                    zone: 'UNASSIGNED'
                }]);
            } catch (err) {
                console.error('Failed to auto-create location record (move):', err);
            }
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
            i.Location === resolvedTargetLocation
        );

        if (existingTarget) {
            const newQty = (existingTarget.Quantity || 0) + qty;
            setInventoryData(prev => prev.map(i => i.id === existingTarget.id ? { ...i, Quantity: newQty } : i));
            await supabase.from('inventory').update({ Quantity: newQty }).eq('id', existingTarget.id);
        } else {
            const { error } = await supabase.from('inventory').insert([{
                SKU: sourceItem.SKU,
                Warehouse: targetWarehouse,
                Location: resolvedTargetLocation,
                Quantity: qty,
                Location_Detail: sourceItem.Location_Detail,
                Status: sourceItem.Status || 'Active',
                capacity: 550
            }]);

            if (error) {
                // The error will be caught by the outer try-catch, but good to be explicit
                throw error;
            }
        }

        // 3. Track Log
        await trackLog({
            sku: sourceItem.SKU,
            from_warehouse: sourceItem.Warehouse,
            from_location: sourceItem.Location,
            to_warehouse: targetWarehouse,
            to_location: resolvedTargetLocation,
            quantity: qty,
            prev_quantity: sourceItem.Quantity,
            new_quantity: remainingQty,
            action_type: 'MOVE',
            is_reversed: isReversal
        });
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
                const { data: itemToMoveBack, error: findError } = await supabase
                    .from('inventory')
                    .select('*')
                    .eq('SKU', log.sku)
                    .eq('Warehouse', log.to_warehouse)
                    .eq('Location', log.to_location)
                    .single();

                if (findError || !itemToMoveBack) {
                    throw new Error(`Cannot undo move: Item ${log.sku} not found at destination ${log.to_warehouse}-${log.to_location} in the database.`);
                }

                await moveItem(
                    itemToMoveBack,
                    log.from_warehouse,
                    log.from_location,
                    log.quantity,
                    true // isReversal
                );
            } else if (log.action_type === 'DEDUCT') {
                // Return items (ADD back)
                await addItem(log.from_warehouse, {
                    SKU: log.sku,
                    Location: log.from_location,
                    Quantity: log.quantity,
                    isReversal: true
                });
            } else if (log.action_type === 'ADD') {
                // Remove added items (DELETE or Subtract)
                await updateQuantity(log.sku, -log.quantity, log.to_warehouse, log.to_location, true);
            } else if (log.action_type === 'EDIT') {
                // Restore previous quantity (Not as easy if other changes happened, but we try)
                await updateQuantity(log.sku, log.prev_quantity - log.new_quantity, log.from_warehouse, log.from_location, true);
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
