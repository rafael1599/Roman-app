import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

export interface SnapshotItem {
    warehouse: string;
    location: string;
    sku: string;
    quantity: number;
}

export const useInventorySnapshot = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<SnapshotItem[]>([]);

    const fetchSnapshot = async (date: Date) => {
        setLoading(true);
        try {
            // Rule: Set time to 18:00:00 (6:00 PM) local time
            const targetDate = new Date(date);
            targetDate.setHours(18, 0, 0, 0);

            const targetTimestamp = targetDate.toISOString();

            // @ts-ignore - RPC manually added to database
            const { data: snapshotData, error } = await supabase.rpc('get_stock_at_timestamp', {
                target_timestamp: targetTimestamp,
            });

            if (error) throw error;

            console.log('Snapshot Data:', snapshotData);

            setData(snapshotData || []);
        } catch (err: any) {
            console.error('Snapshot fetch error:', err);
            toast.error(`Error fetching snapshot: ${err.message}`);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        data,
        fetchSnapshot,
    };
};
