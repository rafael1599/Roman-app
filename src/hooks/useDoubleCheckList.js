import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useDoubleCheckList = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        try {
            const { data, error } = await supabase
                .from('picking_lists')
                .select(`
                    id, 
                    order_number, 
                    status, 
                    items, 
                    updated_at, 
                    user_id,
                    checked_by,
                    profiles!user_id (full_name),
                    checker_profile:profiles!checked_by (full_name)
                `)
                .in('status', ['ready_to_double_check', 'double_checking', 'needs_correction'])
                .order('updated_at', { ascending: false });

            if (error) throw error;
            const validOrders = (data || []).filter(o => o.items && Array.isArray(o.items) && o.items.length > 0);
            setOrders(validOrders);
        } catch (err) {
            console.error('Error fetching double check orders:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();

        // Subscribe to changes
        const channel = supabase
            .channel('picking_lists_queue')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'picking_lists'
            }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const readyCount = orders.filter(o => o.status === 'ready_to_double_check').length;
    const correctionCount = orders.filter(o => o.status === 'needs_correction').length;
    const checkingCount = orders.filter(o => o.status === 'double_checking').length;

    return {
        orders,
        readyCount,
        correctionCount,
        checkingCount,
        loading,
        refresh: fetchOrders
    };
};
