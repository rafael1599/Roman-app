import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const InventoryContext = createContext();

export const InventoryProvider = ({ children }) => {
    const [inventoryData, setInventoryData] = useState([]);
    const [loading, setLoading] = useState(true);
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
        setInventoryData(prev => prev.map(i =>
            i.id === item.id ? { ...i, Quantity: newQty } : i
        ));

        try {
            const { error } = await supabase
                .from('inventory')
                .update({ Quantity: newQty })
                .eq('id', item.id);

            if (error) throw error;
        } catch (err) {
            console.error('Failed to update quantity:', err);
            // Rollback on error
            setInventoryData(prev => prev.map(i =>
                i.id === item.id ? item : i
            ));
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
            // State is updated via real-time subscription
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
                    Status: updatedFormData.Status || item.Status
                })
                .eq('id', item.id);

            if (error) throw error;
        } catch (err) {
            console.error('Error updating item:', err);
            alert('Error updating item: ' + err.message);
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
        } catch (err) {
            console.error('Error deleting item:', err);
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
            loading,
            error,
            updateQuantity,
            updateLudlowQuantity,
            updateAtsQuantity,
            addItem,
            updateItem,
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
