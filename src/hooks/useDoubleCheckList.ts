import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Define the shape of items in the JSONB column
// We assume it's an array of items with at least some basic properties
export interface PickingItem {
    sku: string;
    qty: number;
    location?: string;
    [key: string]: any;
}

export interface Profile {
    full_name: string | null;
}

export interface PickingList {
    id: number;
    order_number: string;
    status: 'ready_to_double_check' | 'double_checking' | 'needs_correction' | 'completed' | 'cancelled';
    items: PickingItem[];
    updated_at: string;
    user_id: string;
    checked_by: string | null;
    profiles?: Profile | null; // Joined profile
    checker_profile?: Profile | null; // Joined checker profile
    customer?: { name: string } | null;
}

export const useDoubleCheckList = () => {
    const [orders, setOrders] = useState<PickingList[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    const fetchOrders = async () => {
        try {
            const { data, error } = await supabase
                .from('picking_lists')
                .select(
                    `
            id, 
            order_number, 
            status, 
            items, 
            updated_at, 
            user_id,
            checked_by,
            checked_by,
            profiles!user_id (full_name),
            checker_profile:profiles!checked_by (full_name),
            customer:customers(name)
          `
                )
                .in('status', ['ready_to_double_check', 'double_checking', 'needs_correction'])
                .gt('updated_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
                .order('updated_at', { ascending: false });

            if (error) throw error;

            // Cast the result to our expected type. 
            // Supabase returns deeply nested objects which might need mapping if types don't align perfectly 
            // but usually standard select works fine with 'any' intermediate or generic.
            const validOrders = (data as any[] || []).filter(
                (o) => o.items && Array.isArray(o.items) && o.items.length > 0
            ) as PickingList[];

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
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'picking_lists',
                },
                () => {
                    fetchOrders();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const readyCount = orders.filter((o) => o.status === 'ready_to_double_check').length;
    const correctionCount = orders.filter((o) => o.status === 'needs_correction').length;
    const checkingCount = orders.filter((o) => o.status === 'double_checking').length;

    return {
        orders,
        readyCount,
        correctionCount,
        checkingCount,
        loading,
        refresh: fetchOrders,
    };
};
