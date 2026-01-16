import { supabase } from '../lib/supabaseClient';

/**
 * Hook to manage inventory logs and undo operations.
 * Separated from the main inventory hook for better maintainability.
 */
export const useInventoryLogs = () => {

    /**
     * Records an activity in the inventory_logs table
     */
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

    /**
     * Fetches the last 100 activity logs
     */
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

    /**
     * Reverses a previously performed action
     * @param {string} logId - ID of the log entry to undo
     * @param {Object} actions - Object containing CRUD methods { addItem, moveItem, updateQuantity }
     */
    const undoAction = async (logId, { addItem, moveItem, updateQuantity }) => {
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
                    throw new Error(`Cannot undo move: Item ${log.sku} not found at destination ${log.to_warehouse}-${log.to_location}.`);
                }

                await moveItem(
                    itemToMoveBack,
                    log.from_warehouse,
                    log.from_location,
                    log.quantity,
                    true // isReversal
                );
            } else if (log.action_type === 'DEDUCT') {
                await addItem(log.from_warehouse, {
                    SKU: log.sku,
                    Location: log.from_location,
                    Quantity: log.quantity,
                    isReversal: true
                });
            } else if (log.action_type === 'ADD') {
                await updateQuantity(log.sku, -log.quantity, log.to_warehouse, log.to_location, true);
            } else if (log.action_type === 'EDIT') {
                await updateQuantity(log.sku, log.prev_quantity - log.new_quantity, log.from_warehouse, log.from_location, true);
            }

            // Mark as reversed
            await supabase
                .from('inventory_logs')
                .update({ is_reversed: true })
                .eq('id', logId);

            return { success: true };
        } catch (err) {
            console.error('Undo failed:', err.message);
            return { success: false, error: err.message };
        }
    };

    return {
        trackLog,
        fetchLogs,
        undoAction
    };
};
