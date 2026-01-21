import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { debounce } from '../../utils/debounce';
import type { CartItem } from './usePickingCart';

interface UsePickingSyncProps {
    user: any;
    isDemoMode: boolean;
    sessionMode: 'picking' | 'double_checking';
    cartItems: CartItem[];
    orderNumber: string | null;
    activeListId: string | null;
    listStatus: string;
    correctionNotes: string | null;
    checkedBy: string | null;
    setCartItems: (items: CartItem[]) => void;
    setActiveListId: (id: string | null) => void;
    setOrderNumber: (num: string | null) => void;
    setListStatus: (status: string) => void;
    setCheckedBy: (id: string | null) => void;
    setOwnerId: (id: string | null) => void;
    setCorrectionNotes: (notes: string | null) => void;
    setSessionMode: (mode: 'picking' | 'double_checking') => void;
    loadFromLocalStorage: () => void;
    showError: (title: string, msg: string) => void;
}

const SYNC_DEBOUNCE_MS = 1000;

export const usePickingSync = ({
    user,
    isDemoMode,
    sessionMode,
    cartItems,
    orderNumber,
    activeListId,
    listStatus,
    correctionNotes,
    checkedBy,
    setCartItems,
    setActiveListId,
    setOrderNumber,
    setListStatus,
    setCheckedBy,
    setOwnerId,
    setCorrectionNotes,
    setSessionMode,
    loadFromLocalStorage,
    showError
}: UsePickingSyncProps) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const isInitialSyncRef = useRef(true);
    const isSyncingRef = useRef(false);

    // 1. Initial Load Logic
    useEffect(() => {
        if (!user || isDemoMode) {
            if (isDemoMode) {
                loadFromLocalStorage();
                setIsLoaded(true);
            } else {
                setCartItems([]);
                setActiveListId(null);
            }
            return;
        }

        const loadSession = async () => {
            try {
                // Check for double-check session first
                const { data: doubleCheckData } = await supabase
                    .from('picking_lists')
                    .select('id, items, order_number, status, checked_by, user_id, correction_notes')
                    .eq('checked_by', user.id)
                    .eq('status', 'double_checking')
                    .limit(1)
                    .maybeSingle();

                if (doubleCheckData) {
                    setCartItems(doubleCheckData.items || []);
                    setActiveListId(doubleCheckData.id);
                    setOrderNumber(doubleCheckData.order_number);
                    setListStatus(doubleCheckData.status);
                    setCheckedBy(doubleCheckData.checked_by);
                    setOwnerId(doubleCheckData.user_id);
                    setCorrectionNotes(doubleCheckData.correction_notes);
                    setSessionMode('double_checking');
                    setIsLoaded(true);
                    return;
                }

                // Check for active picking session
                const { data, error } = await supabase
                    .from('picking_lists')
                    .select('id, items, order_number, status, checked_by, user_id, correction_notes')
                    .eq('user_id', user.id)
                    .in('status', ['active', 'needs_correction'])
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) console.error('Error loading picking session:', error);

                if (data) {
                    setCartItems(data.items || []);
                    setActiveListId(data.id);
                    setOrderNumber(data.order_number);
                    setListStatus(data.status);
                    setCheckedBy(data.checked_by);
                    setOwnerId(data.user_id);
                    setCorrectionNotes(data.correction_notes);
                    setSessionMode('picking');
                } else {
                    // Fallback to local storage if no DB session
                    loadFromLocalStorage();
                }
            } catch (err) {
                console.error('Session load failed:', err);
            } finally {
                setIsLoaded(true);
            }
        };

        loadSession();
    }, [user, isDemoMode]);

    // 2. Real-time Monitor (One-way sync from Server to Client for status updates)
    useEffect(() => {
        if (!activeListId || isDemoMode || !user) return;

        const channel = supabase
            .channel(`list_status_sync_${activeListId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'picking_lists',
                filter: `id=eq.${activeListId}`
            }, (payload) => {
                const newData = payload.new;

                if (newData.status !== listStatus) setListStatus(newData.status);
                if (newData.correction_notes !== correctionNotes) setCorrectionNotes(newData.correction_notes);
                if (newData.checked_by !== checkedBy) setCheckedBy(newData.checked_by);

                // Auto-switch mode if returned to picker
                if (sessionMode === 'double_checking' && (newData.status === 'active' || newData.status === 'needs_correction')) {
                    if (newData.user_id === user.id) {
                        setSessionMode('picking');
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeListId, listStatus, correctionNotes, checkedBy, sessionMode, user, isDemoMode]);

    // 3. Save Logic (Client to Server) - Encapsulated
    const saveToDb = async (items: CartItem[], userId: string, listId: string | null, orderNum: string | null) => {
        if (!userId || isSyncingRef.current || isDemoMode || sessionMode !== 'picking') return;

        isSyncingRef.current = true;
        setIsSaving(true);
        try {
            if (listId) {
                const { error } = await supabase
                    .from('picking_lists')
                    .update({ items: items, order_number: orderNum })
                    .eq('id', listId);
                if (error) throw error;
            } else if (items.length > 0) {
                // New list
                const { data, error } = await supabase
                    .from('picking_lists')
                    .insert({ user_id: userId, items: items, status: 'active', order_number: orderNum })
                    .select()
                    .single();

                if (error) throw error;
                if (data) {
                    setActiveListId(data.id);
                    setListStatus(data.status);
                    setOwnerId(data.user_id);
                }
            }
            setLastSaved(new Date());
        } catch (err) {
            console.error('Failed to sync picking session:', err);
        } finally {
            setIsSaving(false);
            isSyncingRef.current = false;
        }
    };

    // Debounced save
    const debouncedSaveRef = useRef<any>(null);

    useEffect(() => {
        if (!debouncedSaveRef.current) {
            debouncedSaveRef.current = debounce((...args) => saveToDb(...args), SYNC_DEBOUNCE_MS);
        }
    }, []);

    // Trigger Save on changes
    useEffect(() => {
        if (!isLoaded || !user || sessionMode !== 'picking') return;

        // Skip initial empty check to avoid clearing DB on first render
        if (cartItems.length === 0 && !activeListId && isInitialSyncRef.current) {
            isInitialSyncRef.current = false;
            return;
        }

        if (debouncedSaveRef.current) {
            debouncedSaveRef.current(cartItems, user.id, activeListId, orderNumber);
            isInitialSyncRef.current = false;
        }

    }, [cartItems, orderNumber, activeListId, isLoaded, user, sessionMode]);


    // 4. Load External List (for Double Checking)
    const loadExternalList = useCallback(async (listId: string) => {
        if (!user || isDemoMode) return;
        setIsSaving(true);
        try {
            const { data, error } = await supabase
                .from('picking_lists')
                .select('id, items, order_number, status, checked_by, user_id, correction_notes')
                .eq('id', listId)
                .single();

            if (error) throw error;

            if (data) {
                setCartItems(data.items || []);
                setActiveListId(data.id);
                setOrderNumber(data.order_number);
                setListStatus(data.status);
                setCheckedBy(data.checked_by);
                setOwnerId(data.user_id);
                setCorrectionNotes(data.correction_notes);
                setSessionMode('double_checking');
                return data;
            }
        } catch (err: any) {
            console.error('Failed to load external list:', err);
            showError('Load Error', err.message);
        } finally {
            setIsSaving(false);
        }
    }, [user, isDemoMode, showError]);

    return {
        isLoaded,
        isSaving,
        lastSaved,
        loadExternalList
    };
};
