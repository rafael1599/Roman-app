import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { useInventory } from '../hooks/useInventoryData';
import { useError } from './ErrorContext';
import toast from 'react-hot-toast';

const SYNC_DEBOUNCE_MS = 1000;
const LOCAL_STORAGE_KEY = 'picking_cart_items';

const PickingContext = createContext();

export const PickingProvider = ({ children }) => {
    const { user, isDemoMode } = useAuth();
    const { reservedQuantities } = useInventory();
    const { showError } = useError();
    const [cartItems, setCartItems] = useState([]);
    const [activeListId, setActiveListId] = useState(null);
    const [orderNumber, setOrderNumber] = useState(null);
    const [listStatus, setListStatus] = useState('active');
    const [checkedBy, setCheckedBy] = useState(null);
    const [ownerId, setOwnerId] = useState(null);
    const [correctionNotes, setCorrectionNotes] = useState(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);

    // mode: 'picking' (my own active list) or 'double_checking' (arbitrary list)
    const [sessionMode, setSessionMode] = useState('picking');

    const isInitialSyncRef = useRef(true);
    const isSyncingRef = useRef(false);
    const pendingSaveRef = useRef(null);

    // 1. Initial Load (Personal Active List)
    useEffect(() => {
        if (!user || isDemoMode) {
            if (isDemoMode) {
                const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (localData) {
                    try {
                        const parsed = JSON.parse(localData);
                        setCartItems(parsed || []);
                        const localOrder = localStorage.getItem('picking_order_number');
                        if (localOrder) setOrderNumber(localOrder);
                    } catch (e) { }
                }
                setIsLoaded(true);
            } else {
                setCartItems([]);
                setActiveListId(null);
            }
            return;
        }

        const loadSession = async () => {
            try {
                // First, check if there's an ongoing double-check session for this user
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

                // If not double checking, fetch active or correction list from DB
                const { data, error } = await supabase
                    .from('picking_lists')
                    .select('id, items, order_number, status, checked_by, user_id, correction_notes')
                    .eq('user_id', user.id)
                    .in('status', ['active', 'needs_correction'])
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) {
                    console.error('Error loading picking session:', error);
                }

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
                    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
                    if (localData) {
                        try {
                            const parsed = JSON.parse(localData);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                setCartItems(parsed);
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
    }, [user, isDemoMode]);

    // 1.5 Real-time Monitor for Active List
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

                // Only sync if the change comes from someone else OR is a status change we should care about
                if (newData.status !== listStatus) setListStatus(newData.status);
                if (newData.correction_notes !== correctionNotes) setCorrectionNotes(newData.correction_notes);
                if (newData.checked_by !== checkedBy) setCheckedBy(newData.checked_by);

                // If the status changed to active/needs_correction and we were in double_check mode, switch back
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

    // Function to load an external list for double checking
    const loadExternalList = useCallback(async (listId) => {
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
        } catch (err) {
            console.error('Failed to load external list:', err);
            showError('Load Error', err.message);
        } finally {
            setIsSaving(false);
        }
    }, [user, isDemoMode, showError]);

    // 2. Sync Logic (Debounced) - ONLY for picking mode
    const saveToDb = async (items, userId, listId, orderNum) => {
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

    // Hybrid Local + Remote Sync
    useEffect(() => {
        if (!isLoaded || !user) return;

        if (sessionMode === 'picking') {
            if (cartItems.length > 0) {
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cartItems));
            } else {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
            if (orderNumber) {
                localStorage.setItem('picking_order_number', orderNumber);
            } else {
                localStorage.removeItem('picking_order_number');
            }
        }

        if (sessionMode === 'picking') {
            if (cartItems.length === 0 && !activeListId && isInitialSyncRef.current) {
                isInitialSyncRef.current = false;
                return;
            }

            if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);

            pendingSaveRef.current = setTimeout(() => {
                saveToDb(cartItems, user.id, activeListId, orderNumber);
                isInitialSyncRef.current = false;
            }, SYNC_DEBOUNCE_MS);

            return () => clearTimeout(pendingSaveRef.current);
        }
    }, [cartItems, isLoaded, user, activeListId, orderNumber, sessionMode]);

    // 3. Actions
    const isSameItem = useCallback((a, b) => {
        if (a.id && b.id) return a.id === b.id;
        return a.SKU === b.SKU && a.Location === b.Location && a.Warehouse === b.Warehouse;
    }, []);

    const addToCart = useCallback((item) => {
        if (sessionMode !== 'picking') return;

        const key = `${item.SKU}|${item.Warehouse}|${item.Location}`;
        const totalReserved = reservedQuantities[key] || 0;
        const currentInMyCart = cartItems.find(i => isSameItem(i, item))?.pickingQty || 0;
        const reservedByOthers = totalReserved - currentInMyCart;
        const stock = parseInt(item.Quantity, 10) || 0;
        const available = stock - reservedByOthers;

        if (currentInMyCart + 1 > available) {
            toast.error(`Only ${available} units available. ${reservedByOthers} units are reserved in other orders.`, {
                icon: '🚨',
                duration: 4000
            });
            return;
        }

        setCartItems(prev => {
            const existingIndex = prev.findIndex(i => isSameItem(i, item));
            if (existingIndex >= 0) {
                const newCart = [...prev];
                newCart[existingIndex] = {
                    ...newCart[existingIndex],
                    pickingQty: (newCart[existingIndex].pickingQty || 0) + 1
                };
                return newCart;
            } else {
                return [...prev, { ...item, pickingQty: 1 }];
            }
        });
    }, [cartItems, reservedQuantities, isSameItem, sessionMode]);

    const updateCartQty = useCallback((item, change) => {
        if (sessionMode !== 'picking') return;

        const key = `${item.SKU}|${item.Warehouse}|${item.Location}`;
        const totalReserved = reservedQuantities[key] || 0;
        const currentInMyCart = cartItems.find(i => isSameItem(i, item))?.pickingQty || 0;
        const reservedByOthers = totalReserved - currentInMyCart;
        const stock = parseInt(item.Quantity, 10) || 0;
        const available = stock - reservedByOthers;

        setCartItems(prev => prev.map(i => {
            if (isSameItem(i, item)) {
                const currentQty = i.pickingQty || 0;
                const newQty = Math.max(1, Math.min(currentQty + change, available));
                if (currentQty + change > available) {
                    toast.error(`Cannot exceed ${available} available units.`);
                }
                return { ...i, pickingQty: newQty };
            }
            return i;
        }));
    }, [cartItems, reservedQuantities, isSameItem, sessionMode]);

    const setCartQty = useCallback((item, newAbsoluteQty) => {
        if (sessionMode !== 'picking') return;

        const key = `${item.SKU}|${item.Warehouse}|${item.Location}`;
        const totalReserved = reservedQuantities[key] || 0;
        const currentInMyCart = cartItems.find(i => isSameItem(i, item))?.pickingQty || 0;
        const reservedByOthers = totalReserved - currentInMyCart;
        const stock = parseInt(item.Quantity, 10) || 0;
        const available = stock - reservedByOthers;

        setCartItems(prev => prev.map(i => {
            if (isSameItem(i, item)) {
                const newQty = Math.max(1, Math.min(newAbsoluteQty, available));
                if (newAbsoluteQty > available) {
                    toast.error(`Cannot exceed ${available} available units.`);
                }
                return { ...i, pickingQty: newQty };
            }
            return i;
        }));
    }, [cartItems, reservedQuantities, isSameItem, sessionMode]);

    const removeFromCart = useCallback((item) => {
        if (sessionMode !== 'picking') return;
        setCartItems(prev => prev.filter(i => !isSameItem(i, item)));
    }, [isSameItem, sessionMode]);

    const clearCart = useCallback(() => {
        setCartItems([]);
        setActiveListId(null);
        setOrderNumber(null);
        setSessionMode('picking');
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    }, []);

    const completeList = useCallback(async (listIdOverride) => {
        const targetId = listIdOverride || activeListId;
        if (isDemoMode) {
            setCartItems([]);
            setActiveListId(null);
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            return;
        }
        if (!targetId || !user) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('picking_lists')
                .update({ status: 'completed' })
                .eq('id', targetId);

            if (error) throw error;

            if (targetId === activeListId) {
                setCartItems([]);
                setActiveListId(null);
                setOrderNumber(null);
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                setSessionMode('picking');
            }
        } catch (err) {
            console.error('Failed to complete list:', err);
        } finally {
            setIsSaving(false);
        }
    }, [activeListId, user, isDemoMode]);

    const markAsReady = useCallback(async (items, orderNum) => {
        if (!activeListId || isDemoMode || !user) return null;

        const finalItems = items || cartItems;
        const finalOrderNum = orderNum || orderNumber;

        if (finalItems.length === 0) {
            toast.error("Cannot mark an empty order as ready.");
            return null;
        }

        setIsSaving(true);
        try {
            // Transition to double_checking immediately so the picker can verify it
            // We also save items and order_number here to ensure anything pending is captured
            const { error } = await supabase
                .from('picking_lists')
                .update({
                    status: 'double_checking',
                    checked_by: user.id,
                    items: finalItems,
                    order_number: finalOrderNum,
                    correction_notes: null
                })
                .eq('id', activeListId);

            if (error) throw error;

            const listId = activeListId;
            setCartItems(finalItems);
            setOrderNumber(finalOrderNum);
            setCorrectionNotes(null);
            setListStatus('double_checking');
            setCheckedBy(user.id);
            setSessionMode('double_checking');
            toast.success('Order ready! You can now verify it.');
            return listId;
        } catch (err) {
            console.error('Failed to mark as ready:', err);
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [activeListId, user, isDemoMode, cartItems, orderNumber]);

    const lockForCheck = useCallback(async (listId) => {
        if (isDemoMode || !user) return;
        try {
            const { error } = await supabase
                .from('picking_lists')
                .update({
                    status: 'double_checking',
                    checked_by: user.id
                })
                .eq('id', listId);
            if (error) throw error;
        } catch (err) {
            console.error('Failed to lock list:', err);
        }
    }, [user, isDemoMode]);

    const releaseCheck = useCallback(async (listId) => {
        if (isDemoMode) return;
        try {
            const { error } = await supabase
                .from('picking_lists')
                .update({
                    status: 'ready_to_double_check',
                    checked_by: null
                })
                .eq('id', listId);
            if (error) throw error;

            // Clear local state
            setCartItems([]);
            setActiveListId(null);
            setOrderNumber(null);
            setSessionMode('picking');
        } catch (err) {
            console.error('Failed to release list:', err);
        }
    }, [isDemoMode]);

    const returnToPicker = useCallback(async (listId, notes) => {
        if (isDemoMode) return;
        try {
            const { error } = await supabase
                .from('picking_lists')
                .update({
                    status: 'needs_correction',
                    checked_by: null,
                    correction_notes: notes
                })
                .eq('id', listId);
            if (error) throw error;

            // Clear local state
            setCartItems([]);
            setActiveListId(null);
            setOrderNumber(null);
            setSessionMode('picking');
            toast.success('Sent back to picker.');
        } catch (err) {
            console.error('Failed to return to picker:', err);
        }
    }, [isDemoMode]);

    const revertToPicking = useCallback(async () => {
        if (!activeListId || isDemoMode || !user) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('picking_lists')
                .update({
                    status: 'active',
                    checked_by: null
                })
                .eq('id', activeListId);

            if (error) throw error;

            setListStatus('active');
            setCheckedBy(null);
            setSessionMode('picking');
            toast.success('Returned to picking mode.');
        } catch (err) {
            console.error('Failed to revert to picking:', err);
        } finally {
            setIsSaving(false);
        }
    }, [activeListId, user, isDemoMode]);

    const deleteList = useCallback(async (listId) => {
        if (isDemoMode) return;
        try {
            const { error } = await supabase
                .from('picking_lists')
                .delete()
                .eq('id', listId);

            if (error) throw error;

            if (listId === activeListId) {
                setCartItems([]);
                setActiveListId(null);
                setOrderNumber(null);
                setSessionMode('picking');
                localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
            toast.success('Order deleted successfully');
        } catch (err) {
            console.error('Failed to delete list:', err);
            toast.error('Failed to delete order');
        }
    }, [activeListId, isDemoMode]);

    const value = {
        cartItems,
        setCartItems,
        activeListId,
        setActiveListId,
        orderNumber,
        setOrderNumber,
        listStatus,
        checkedBy,
        ownerId,
        correctionNotes,
        sessionMode,
        setSessionMode,
        addToCart,
        updateCartQty,
        setCartQty,
        removeFromCart,
        clearCart,
        completeList,
        markAsReady,
        lockForCheck,
        releaseCheck,
        returnToPicker,
        revertToPicking,
        deleteList,
        loadExternalList,
        isLoaded,
        isSaving,
        lastSaved
    };

    return (
        <PickingContext.Provider value={value}>
            {children}
        </PickingContext.Provider>
    );
};

export const usePickingSession = () => {
    const context = useContext(PickingContext);
    if (!context) {
        throw new Error('usePickingSession must be used within a PickingProvider');
    }
    return context;
};
