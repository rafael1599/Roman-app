import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * usePickingListsSubscription
 * 
 * Subscribes to Realtime changes on the picking_lists table to keep
 * reservedQuantities calculation fresh across all active picking sessions.
 * 
 * Listens to: INSERT, UPDATE, DELETE
 * Invalidates: 'picking_lists' React Query cache to force refetch
 */
export const usePickingListsSubscription = () => {
    const queryClient = useQueryClient();
    const channelRef = useRef<RealtimeChannel | null>(null);
    const retryCountRef = useRef(0);
    const MAX_RETRIES = 3;

    useEffect(() => {
        console.log('[FORENSIC][REALTIME][PICKING_LISTS_INIT]', new Date().toISOString(), '- Setting up channel');

        const channel = supabase
            .channel('picking-lists-reservations')
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'picking_lists',
                },
                (payload) => {
                    const newRecord = payload.new as { id?: string; status?: string } | null;
                    const oldRecord = payload.old as { id?: string; status?: string } | null;

                    console.log('[FORENSIC][REALTIME][PICKING_LISTS_CHANGE]', {
                        timestamp: new Date().toISOString(),
                        event: payload.eventType,
                        listId: newRecord?.id || oldRecord?.id,
                        status: newRecord?.status || oldRecord?.status,
                    });

                    // Invalidate picking_lists query to trigger recalculation of reservedQuantities
                    queryClient.invalidateQueries({ queryKey: ['picking_lists'] });
                }
            )
            .subscribe((status) => {
                console.log('[FORENSIC][REALTIME][PICKING_LISTS_STATUS]', new Date().toISOString(), '- Status:', status);

                if (status === 'SUBSCRIBED') {
                    retryCountRef.current = 0;
                    console.log('[FORENSIC][REALTIME][PICKING_LISTS_SUBSCRIBED] ✅ Successfully subscribed');
                }

                if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    if (retryCountRef.current < MAX_RETRIES) {
                        retryCountRef.current++;
                        console.warn(
                            `[FORENSIC][REALTIME][PICKING_LISTS_RETRY] Status: ${status}. Retry ${retryCountRef.current}/${MAX_RETRIES} in 5s...`
                        );

                        setTimeout(() => {
                            if (channelRef.current?.state !== 'joined') {
                                channel.subscribe();
                            }
                        }, 5000);
                    } else {
                        console.error('[FORENSIC][REALTIME][PICKING_LISTS_FAILED] Max retries reached. Subscription failed.');
                    }
                }
            });

        channelRef.current = channel;

        // Cleanup on unmount
        return () => {
            console.log('[FORENSIC][REALTIME][PICKING_LISTS_CLEANUP]', new Date().toISOString());

            if (channelRef.current) {
                const currentChannel = channelRef.current;
                const channelState = currentChannel.state;

                // Only remove if the channel is not already being removed
                if (channelState !== 'closed' && channelState !== 'errored') {
                    supabase.removeChannel(currentChannel);
                }
            }
        };
    }, [queryClient]);

    return null; // This hook manages side effects only
};
