import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const SYNC_DEBOUNCE_MS = 1000;
const LOCAL_STORAGE_KEY = 'picking_cart_items';

export const usePickingSession = () => {
    const { user } = useAuth();
    const [cartItems, setCartItems] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const pendingSaveRef = useRef(null);

    // 1. Initial Load & Migration
    useEffect(() => {
        if (!user) {
            setCartItems([]);
            return;
        }

        const loadSession = async () => {
            try {
                // Fetch from DB
                const { data, error } = await supabase
                    .from('picking_sessions')
                    .select('items')
                    .eq('user_id', user.id)
                    .single();

                if (error && error.code !== 'PGRST116') { // PGRST116 = Row not found
                    console.error('Error loading picking session:', error);
                }

                if (data?.items) {
                    // DB has data - Use it (Server Truth)
                    setCartItems(data.items);
                } else {
                    // DB empty - Check LocalStorage (Migration)
                    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
                    if (localData) {
                        try {
                            const parsed = JSON.parse(localData);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                console.log('Migrating local cart to cloud...', parsed.length);
                                setCartItems(parsed);
                                // Trigger immediate save to establish DB record
                                saveToDb(parsed, user.id);
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
    const saveToDb = async (items, userId) => {
        if (!userId) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('picking_sessions')
                .upsert({ user_id: userId, items: items, updated_at: new Date() });

            if (error) throw error;
            setLastSaved(new Date());
        } catch (err) {
            console.error('Failed to sync picking session:', err);
        } finally {
            setIsSaving(false);
        }
    };

    // Debounce wrapper
    useEffect(() => {
        if (!isLoaded || !user) return;

        // Clear previous pending save
        if (pendingSaveRef.current) {
            clearTimeout(pendingSaveRef.current);
        }

        // Set new pending save
        pendingSaveRef.current = setTimeout(() => {
            saveToDb(cartItems, user.id);
        }, SYNC_DEBOUNCE_MS);

        return () => clearTimeout(pendingSaveRef.current);
    }, [cartItems, isLoaded, user]);

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

    const removeFromCart = useCallback((item) => {
        setCartItems(prev => prev.filter(i => !isSameItem(i, item)));
    }, []);

    const clearCart = useCallback(() => {
        setCartItems([]);
    }, []);

    return {
        cartItems,
        setCartItems,
        addToCart,
        updateCartQty,
        removeFromCart,
        clearCart,
        isLoaded,
        isSaving,
        lastSaved
    };
};
