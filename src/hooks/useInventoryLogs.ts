import { useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
    type InventoryLog,
    type InventoryLogInput,
    InventoryLogSchema
} from '../schemas/log.schema';
import { validateData } from '../utils/validate';

interface UserInfo {
    performed_by?: string;
    user_id?: string;
}

interface UndoActions {
    addItem: (warehouse: string, item: {
        SKU: string;
        Location: string | null;
        Quantity: number;
        force_id?: string | number | null;
        isReversal?: boolean;
    }) => Promise<any>;
    moveItem: (item: any, toWarehouse: string, toLocation: string, qty: number, isReversal?: boolean) => Promise<any>;
    updateQuantity: (sku: string, delta: number, warehouse: string, location: string, isReversal?: boolean) => Promise<any>;
    updateItem: (originalItem: any, updatedFormData: any) => Promise<any>;
}

/**
 * Hook to manage inventory logs and undo operations.
 * Implements sophisticated log coalescing and atomic undo logic.
 */
export const useInventoryLogs = () => {

    /**
     * Records an activity in the inventory_logs table
     * Implements "Write-Time Coalescing": Updates the last log if specific conditions met.
     */
    const trackLog = async (
        logData: InventoryLogInput,
        userInfo: UserInfo = {},
        candidateLogId: string | null = null
    ): Promise<string | null> => {
        const { performed_by } = userInfo;
        const userName = performed_by || 'Warehouse Team';

        try {
            let targetLog: InventoryLog | null = null;

            // STRATEGY 1: Direct Chained Update (Optimistic)
            if (candidateLogId) {
                const { data: candidate } = await supabase
                    .from('inventory_logs')
                    .select('*')
                    .eq('id', candidateLogId)
                    .single();

                if (candidate) {
                    const typedCandidate = candidate as InventoryLog;
                    // Verify context matches
                    const isSameContext = !typedCandidate.is_reversed &&
                        typedCandidate.sku === logData.sku &&
                        (typedCandidate.from_location || null) === (logData.from_location || null) &&
                        (typedCandidate.to_location || null) === (logData.to_location || null) &&
                        (typedCandidate.order_number || null) === (logData.order_number || null);

                    if (isSameContext) {
                        targetLog = typedCandidate;
                    }
                }
            }

            // STRATEGY 2: Fallback to Time-Based Search
            if (!targetLog) {
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
                const { data: recentLogs } = await supabase
                    .from('inventory_logs')
                    .select('*')
                    .eq('performed_by', userName)
                    .gt('created_at', fiveMinutesAgo)
                    .order('created_at', { ascending: false })
                    .limit(1);

                const lastLog = recentLogs?.[0] as InventoryLog | undefined;

                if (lastLog &&
                    lastLog.sku === logData.sku &&
                    !lastLog.is_reversed &&
                    (lastLog.from_location || null) === (logData.from_location || null) &&
                    (lastLog.to_location || null) === (logData.to_location || null) &&
                    (lastLog.to_warehouse || null) === (logData.to_warehouse || null) &&
                    (lastLog.order_number || null) === (logData.order_number || null)) {
                    targetLog = lastLog;
                }
            }

            // --- EXECUTE MERGE OR INSERT ---
            if (targetLog) {
                const sameType = targetLog.action_type === logData.action_type;
                const isInverse = (targetLog.action_type === 'ADD' && logData.action_type === 'DEDUCT') ||
                    (targetLog.action_type === 'DEDUCT' && logData.action_type === 'ADD');

                if (sameType) {
                    const newTotalQty = targetLog.quantity + logData.quantity;
                    console.log(`[Log] Merging ${logData.action_type}: ${targetLog.quantity} + ${logData.quantity} = ${newTotalQty}`);

                    await supabase.from('inventory_logs')
                        .update({
                            quantity: newTotalQty,
                            new_quantity: logData.new_quantity
                        })
                        .eq('id', targetLog.id);

                    return targetLog.id;

                } else if (isInverse) {
                    const netQty = targetLog.quantity - logData.quantity;

                    if (netQty === 0) {
                        await supabase.from('inventory_logs').delete().eq('id', targetLog.id);
                        return null;
                    } else if (netQty > 0) {
                        await supabase.from('inventory_logs')
                            .update({
                                quantity: netQty,
                                new_quantity: logData.new_quantity
                            })
                            .eq('id', targetLog.id);
                        return targetLog.id;
                    } else {
                        await supabase.from('inventory_logs')
                            .update({
                                quantity: Math.abs(netQty),
                                action_type: logData.action_type,
                                new_quantity: logData.new_quantity
                            })
                            .eq('id', targetLog.id);
                        return targetLog.id;
                    }
                }
            }

            // --- INSERT NEW LOG (Default) ---
            const { data: newLog, error } = await supabase
                .from('inventory_logs')
                .insert([{
                    ...logData,
                    prev_quantity: logData.prev_quantity ?? null,
                    new_quantity: logData.new_quantity ?? null,
                    is_reversed: logData.is_reversed || false,
                    performed_by: userName,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) {
                console.error('Logging error:', error);
                return null;
            }

            return newLog?.id;

        } catch (err) {
            console.error('Log tracking failed:', err);
            return null;
        }
    };

    /**
     * Fetches the last 100 activity logs
     */
    const fetchLogs = async (): Promise<InventoryLog[]> => {
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

            return (data || []).map((log: any) => validateData(InventoryLogSchema, log));
        } catch (err) {
            console.error('Fetch logs failed:', err);
            return [];
        }
    };

    /**
     * Reverses a previously performed action
     */
    const undoAction = async (logId: string, actions: UndoActions): Promise<{ success: boolean; error?: string }> => {
        const { addItem, moveItem, updateQuantity, updateItem } = actions;

        try {
            const { data: logData, error: fetchError } = await supabase
                .from('inventory_logs')
                .select('*')
                .eq('id', logId)
                .single();

            if (fetchError || !logData) throw new Error('Action log not found');

            const log = validateData(InventoryLogSchema, logData);
            if (log.is_reversed) throw new Error('Action already undone');

            // --- Resolve Target Item Identity ---
            let targetSku = log.sku;
            const targetWarehouse = log.from_warehouse || '';

            // ID-Based Identity Recovery (The "Anti-Zombie" Fix)
            if (log.item_id) {
                const { data: currentItemByID } = await supabase
                    .from('inventory')
                    .select('SKU')
                    .eq('id', log.item_id)
                    .maybeSingle();

                if (currentItemByID) {
                    console.log(`[Undo] Identity Shift: Log says ${log.sku}, but Item ${log.item_id} is actually ${currentItemByID.SKU}`);
                    targetSku = currentItemByID.SKU;
                }
            }

            // --- Reversal Logic ---
            if (log.action_type === 'MOVE') {
                // Ghost Location Handling: Ensure destination exists before trying to move back from it
                const { data: destLoc } = await supabase
                    .from('locations')
                    .select('id')
                    .eq('warehouse', log.to_warehouse)
                    .eq('location', log.to_location)
                    .maybeSingle();

                if (!destLoc) {
                    console.warn(`[Undo] Destination location ${log.to_warehouse}-${log.to_location} no longer exists in DB records, but we will proceed with the text-based identity.`);
                }

                const { data: itemToMoveBack, error: findError } = await supabase
                    .from('inventory')
                    .select('*')
                    .eq('SKU', targetSku) // Use resolved SKU
                    .eq('Warehouse', log.to_warehouse)
                    .eq('Location', log.to_location)
                    .maybeSingle();

                if (findError || !itemToMoveBack) {
                    throw new Error(`Cannot undo move: Item ${targetSku} not found at current location ${log.to_warehouse}-${log.to_location}.`);
                }

                await moveItem(
                    itemToMoveBack,
                    targetWarehouse,
                    log.from_location || '',
                    log.quantity,
                    true // isReversal
                );
            } else if (log.action_type === 'DEDUCT') {
                await addItem(targetWarehouse, {
                    SKU: targetSku,
                    Location: log.from_location,
                    Quantity: log.quantity,
                    isReversal: true
                });
            } else if (log.action_type === 'ADD') {
                await updateQuantity(targetSku, -log.quantity, log.to_warehouse || '', log.to_location || '', true);
            } else if (log.action_type === 'DELETE') {
                // UNDO DELETE: Recreate the item with its original ID
                console.log(`[Undo] Restoring deleted item ${targetSku} with ID ${log.item_id}`);
                await addItem(targetWarehouse, {
                    SKU: targetSku,
                    Location: log.from_location,
                    Quantity: log.quantity,
                    force_id: log.item_id, // PHASE 3: ID Persistence
                    isReversal: true
                });
            } else if (log.action_type === 'EDIT') {
                if (log.previous_sku && log.previous_sku !== targetSku) {
                    // UNDO RENAME: Rename back from Current (targetSku) to Old (log.previous_sku)
                    const { data: itemToUpdate, error: itemError } = await supabase
                        .from('inventory')
                        .select('*')
                        .eq('id', log.item_id)
                        .single();
                    
                    if(itemError || !itemToUpdate) {
                        throw new Error(`Cannot undo rename: Item with ID ${log.item_id} not found.`);
                    }

                    await updateItem(itemToUpdate, {
                        SKU: log.previous_sku,
                        Quantity: log.prev_quantity,
                        Warehouse: log.from_warehouse,
                        Location: log.from_location,
                        isReversal: true
                    });
                } else {
                    // STANDARD UNDO (Quantity change only)
                    await updateQuantity(targetSku, (log.prev_quantity || 0) - (log.new_quantity || 0), targetWarehouse, log.from_location || '', true);
                }
            }

            // Mark as reversed
            await supabase
                .from('inventory_logs')
                .update({ is_reversed: true })
                .eq('id', logId);

            return { success: true };
        } catch (err: any) {
            console.error('Undo failed:', err.message);
            return { success: false, error: err.message };
        }
    };

    return useMemo(() => ({
        trackLog,
        fetchLogs,
        undoAction
    }), [trackLog, fetchLogs, undoAction]);
};
