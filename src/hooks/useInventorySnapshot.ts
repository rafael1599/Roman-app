import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

export interface SnapshotItem {
    warehouse: string;
    location: string;
    sku: string;
    quantity: number;
    sku_note?: string | null;
    location_id?: string | null;
}

export const useInventorySnapshot = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<SnapshotItem[]>([]);

    const fetchSnapshot = useCallback(async (date: Date | string) => {
        setLoading(true);
        try {
            // Manejar tanto objetos Date como strings YYYY-MM-DD
            const targetDate = typeof date === 'string'
                ? date
                : date.toISOString().split('T')[0];

            console.log('Fetching snapshot for date:', targetDate);

            // Call new RPC: get_snapshot
            const { data: snapshotData, error } = await supabase.rpc('get_snapshot', {
                p_target_date: targetDate,
            });

            if (error) {
                console.error('Snapshot RPC error:', error);
                throw error;
            }

            if (!snapshotData || snapshotData.length === 0) {
                setData([]);
                return;
            }

            setData(snapshotData || []);
        } catch (err: any) {
            console.error('Snapshot fetch error:', err);
            toast.error(`Error fetching snapshot: ${err.message}`);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        data,
        fetchSnapshot,
    };
};
