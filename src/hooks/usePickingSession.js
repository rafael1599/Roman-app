import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const SYNC_DEBOUNCE_MS = 1000;
const LOCAL_STORAGE_KEY = 'picking_cart_items';

export const usePickingSession = () => {
    const { user } = useAuth();
    const [cartItems, setCartItems] = useState([]);
    const [activeListId, setActiveListId] = useState(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const isInitialSyncRef = useRef(true);
    const isSyncingRef = useRef(false);
    const pendingSaveRef = useRef(null);

    // 1. Initial Load
    useEffect(() => {
        if (!user) {
            setCartItems([]);
            setActiveListId(null);
            return;
        }

        const loadSession = async () => {
            try {
                // Fetch active list from DB
                const { data, error } = await supabase
                    .from('picking_lists')
                    .select('id, items')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) {
                    console.error('Error loading picking session:', error);
                }

                if (data) {
                    setCartItems(data.items || []);
                    setActiveListId(data.id);
                } else {
                    // Check LocalStorage for migration or new session
                    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
                    if (localData) {
                        try {
                            const parsed = JSON.parse(localData);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                setCartItems(parsed);
                                // We'll create the DB record on the first sync
                            }
                        } catch (e) {
                            console.warn('Corrupt local storage cart', e);
                        }
                    }
                }
            } catch (err) {
                console.error('Session load failed:', err);
            } finally {
                setIsLoaded(true);
            }
        };

        loadSession();
    }, [user]);

    // 2. Sync Logic (Debounced)
    const saveToDb = async (items, userId, listId) => {
        if (!userId || isSyncingRef.current) return;
        isSyncingRef.current = true;
        setIsSaving(true);
        try {
            if (listId) {
                // Update existing
                const { error } = await supabase
                    .from('picking_lists')
                    .update({ items: items })
                    .eq('id', listId);
                if (error) throw error;
            } else if (items.length > 0) {
                // Create new active list
                const { data, error } = await supabase
                    .from('picking_lists')
                    .insert({ user_id: userId, items: items, status: 'active' })
                    .select()
                    .single();

                if (error) throw error;
                if (data) setActiveListId(data.id);
            }
            setLastSaved(new Date());
        } catch (err) {
            console.error('Failed to sync picking session:', err);
        } finally {
            setIsSaving(false);
            isSyncingRef.current = false;
        }
    };

    // 2. Sync Logic (Hybrid Local + Remote)
    useEffect(() => {
        if (!isLoaded || !user) return;

        // Immediate Local Backup
        if (cartItems.length > 0) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cartItems));
        } else {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        }

        // Skip DB sync if nothing to sync and we haven't synced before
        if (cartItems.length === 0 && !activeListId && isInitialSyncRef.current) {
            isInitialSyncRef.current = false;
            return;
        }

        if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);

        pendingSaveRef.current = setTimeout(() => {
            saveToDb(cartItems, user.id, activeListId);
            isInitialSyncRef.current = false;
        }, SYNC_DEBOUNCE_MS);

        return () => clearTimeout(pendingSaveRef.current);
    }, [cartItems, isLoaded, user, activeListId]);

    // 3. Actions
    // Helper to match items (by ID if available, otherwise SKU+Loc)
    const isSameItem = (a, b) => {
        if (a.id && b.id) return a.id === b.id;
        return a.SKU === b.SKU && a.Location === b.Location && a.Warehouse === b.Warehouse;
    };

    const addToCart = useCallback((item) => {
        setCartItems(prev => {
            const existingIndex = prev.findIndex(i => isSameItem(i, item));

            if (existingIndex >= 0) {
                // Increment quantity
                const newCart = [...prev];
                newCart[existingIndex] = {
                    ...newCart[existingIndex],
                    pickingQty: (newCart[existingIndex].pickingQty || 0) + 1
                };
                return newCart;
            } else {
                // Add new
                return [...prev, { ...item, pickingQty: 1 }];
            }
        });
    }, []);

    const updateCartQty = useCallback((item, change) => {
        setCartItems(prev => prev.map(i => {
            if (isSameItem(i, item)) {
                const currentQty = i.pickingQty || 0;
                const maxStock = parseInt(i.Quantity, 10) || 9999;
                const newQty = Math.max(1, Math.min(currentQty + change, maxStock));
                return { ...i, pickingQty: newQty };
            }
            return i;
        }));
    }, []);

    const setCartQty = useCallback((item, newAbsoluteQty) => {
        setCartItems(prev => prev.map(i => {
            if (isSameItem(i, item)) {
                const maxStock = parseInt(i.Quantity, 10) || 9999;
                // Ensure new quantity is within valid bounds (at least 1, not more than stock)
                const newQty = Math.max(1, Math.min(newAbsoluteQty, maxStock));
                return { ...i, pickingQty: newQty };
            }
            return i;
        }));
    }, []);

    const removeFromCart = useCallback((item) => {
        setCartItems(prev => prev.filter(i => !isSameItem(i, item)));
    }, []);

    const clearCart = useCallback(() => {
        setCartItems([]);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    }, []);

    const completeList = useCallback(async () => {
        if (!activeListId || !user) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('picking_lists')
                .update({ status: 'completed' })
                .eq('id', activeListId);

            if (error) throw error;

            setCartItems([]);
            setActiveListId(null);
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        } catch (err) {
            console.error('Failed to complete list:', err);
        } finally {
            setIsSaving(false);
        }
    }, [activeListId, user]);

    return {
        cartItems,
        setCartItems,
        activeListId,
        addToCart,
        updateCartQty,
        setCartQty,
        removeFromCart,
        clearCart,
        completeList,
        isLoaded,
        isSaving,
        lastSaved
    };
};
