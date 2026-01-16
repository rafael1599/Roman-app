import { supabase } from '../lib/supabaseClient';

/**
 * Hook to manage complex stock movements and location resolution logic.
 */
export const useInventoryMovement = (contextState) => {
    const {
        inventoryData,
        setInventoryData,
        locations,
        setLocations,
        trackLog,
        isAdmin
    } = contextState;

    /**
     * Resolves a location name, mapping numeric "9" to "Row 9" if applicable.
     * Also checks if the location is new.
     */
    const resolveLocation = async (warehouse, inputLocation) => {
        if (!inputLocation) return { name: '', id: null, isNew: false };

        // 1. Check if exact match exists in locations table
        const exactMatch = locations.find(
            l => l.warehouse === warehouse && l.location.toLowerCase() === inputLocation.toLowerCase()
        );

        if (exactMatch) {
            return { name: exactMatch.location, id: exactMatch.id, isNew: false };
        }

        // 2. Business Rule: Mapping numeric "9" to "Row 9"
        const isNumeric = /^\d+$/.test(inputLocation);
        if (isNumeric) {
            const rowLocation = `Row ${inputLocation}`;
            const rowMatch = locations.find(
                l => l.warehouse === warehouse && l.location.toLowerCase() === rowLocation.toLowerCase()
            );

            if (rowMatch) {
                return { name: rowMatch.location, id: rowMatch.id, isNew: false };
            }

            // If it's numeric but no "Row X" exists
            const existsInDB = locations.some(l => l.warehouse === warehouse && l.location === rowLocation);
            return { name: rowLocation, id: null, isNew: !existsInDB };
        }

        return { name: inputLocation, id: null, isNew: true };
    };

    /**
     * Moves stock from one location to another.
     */
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

        // Resolve target location
        const { name: resolvedTargetLocation, id: existingId, isNew } = await resolveLocation(targetWarehouse, targetLocation);
        let locationId = existingId;

        // Security Check
        if (isNew && !isAdmin) {
            throw new Error(`Unauthorized: Only administrators can create or use new locations ("${resolvedTargetLocation}").`);
        }

        // Auto-create location record for admin if it's new
        if (isNew && isAdmin) {
            try {
                const { data: newLoc, error: locError } = await supabase.from('locations').insert([{
                    warehouse: targetWarehouse,
                    location: resolvedTargetLocation,
                    max_capacity: 550,
                    zone: 'UNASSIGNED',
                    is_active: true
                }]).select().single();

                if (locError) throw locError;
                if (newLoc) {
                    locationId = newLoc.id;
                    setLocations(prev => [...prev, newLoc]);
                }
            } catch (err) {
                console.error('Failed to auto-create location record:', err);
            }
        }

        // 1. Update Source (Optimistic)
        const remainingQty = sourceItem.Quantity - qty;
        setInventoryData(prev => prev.map(i => i.id === sourceItem.id ? { ...i, Quantity: Math.max(0, remainingQty) } : i));
        await supabase.from('inventory').update({ Quantity: Math.max(0, remainingQty) }).eq('id', sourceItem.id);

        // 2. Update Destination
        const existingTarget = inventoryData.find(i =>
            i.SKU === sourceItem.SKU &&
            i.Warehouse === targetWarehouse &&
            i.Location === resolvedTargetLocation
        );

        if (existingTarget) {
            const newQty = (existingTarget.Quantity || 0) + qty;
            setInventoryData(prev => prev.map(i => i.id === existingTarget.id ? { ...i, Quantity: newQty } : i));
            await supabase.from('inventory').update({
                Quantity: newQty,
                location_id: locationId
            }).eq('id', existingTarget.id);
        } else {
            const { error } = await supabase.from('inventory').insert([{
                SKU: sourceItem.SKU,
                Warehouse: targetWarehouse,
                Location: resolvedTargetLocation,
                location_id: locationId,
                Quantity: qty,
                Location_Detail: sourceItem.Location_Detail,
                Status: sourceItem.Status || 'Active'
            }]);

            if (error) throw error;
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

    return {
        resolveLocation,
        moveItem
    };
};
