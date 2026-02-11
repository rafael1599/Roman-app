import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export const usePresence = () => {
    const { user } = useAuth();

    useEffect(() => {
        if (!user) return;

        const sendHeartbeat = async () => {
            try {
                // Determine if the tab is visible before sending heartbeat
                if (document.visibilityState === 'visible') {
                    const { error } = await supabase.rpc('update_user_presence', {
                        p_user_id: user.id
                    });

                    if (error) {
                        // Silent error to avoid console clutter in dev, 
                        // but log for debugging if needed
                        console.debug('[Presence] Heartbeat error:', error.message);
                    }
                }
            } catch (err) {
                console.debug('[Presence] Failed to send heartbeat:', err);
            }
        };

        // Send initial heartbeat immediately
        sendHeartbeat();

        // Set up interval for recurring heartbeats
        const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        // Add event listener for visibility changes (re-send heartbeat when user returns to tab)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                sendHeartbeat();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user]);
};
