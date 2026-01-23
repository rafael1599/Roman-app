import React, { createContext, useContext, useState, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { useInventory } from '../hooks/useInventoryData';
import { useError } from './ErrorContext';
import { usePickingCart, CartItem } from '../hooks/picking/usePickingCart';
import { usePickingSync } from '../hooks/picking/usePickingSync';
import { usePickingActions } from '../hooks/picking/usePickingActions';
import { usePickingNotes, PickingNote } from '../hooks/picking/usePickingNotes';

interface PickingContextType {
    cartItems: CartItem[];
    setCartItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
    activeListId: string | null;
    setActiveListId: (id: string | null) => void;
    orderNumber: string | null;
    setOrderNumber: (num: string | null) => void;
    listStatus: string;
    checkedBy: string | null;
    ownerId: string | null;
    correctionNotes: string | null;
    notes: PickingNote[];
    isNotesLoading: boolean;
    addNote: (message: string) => Promise<void>;
    sessionMode: 'building' | 'picking' | 'double_checking';
    setSessionMode: (mode: 'building' | 'picking' | 'double_checking') => void;

    addToCart: (item: any) => void;
    updateCartQty: (item: any, change: number) => void;
    setCartQty: (item: any, qty: number) => void;
    removeFromCart: (item: any) => void;
    clearCart: () => void;
    getAvailableStock: (item: any) => { available: number; reservedByOthers: number; totalStock: number; inMyCart: number };

    completeList: (id?: string) => void;
    markAsReady: (items?: any[], orderNum?: string) => Promise<string | null>;
    lockForCheck: (id: string) => Promise<void>;
    releaseCheck: (id: string) => Promise<void>;
    returnToPicker: (id: string, notes: string) => Promise<void>;
    revertToPicking: () => Promise<void>;
    deleteList: (id: string | null, keepLocalState?: boolean) => Promise<void>;

    loadExternalList: (id: string) => Promise<any>;

    generatePickingPath: () => Promise<void>;

    returnToBuilding: () => Promise<void>;

    isLoaded: boolean;
    isSaving: boolean;
    lastSaved: Date | null;
    resetSession: () => void;

    isInitializing: boolean;
    setIsInitializing: (val: boolean) => void;
    startNewSession: (strategy: 'auto' | 'manual' | 'resume', manualOrderNumber?: string, resumeId?: string) => Promise<void>;
    pendingItem: any;
    cancelInitialization: () => void;
}

const PickingContext = createContext<PickingContextType | undefined>(undefined);

export const PickingProvider = ({ children }: { children: ReactNode }) => {
    // 1. External dependencies
    const { user, isDemoMode } = useAuth();
    const { reservedQuantities } = useInventory();
    const { showError } = useError();

    // 2. Shared/Lifted State
    const [activeListId, setActiveListId] = useState<string | null>(null);
    const [listStatus, setListStatus] = useState<string>('active');
    const [checkedBy, setCheckedBy] = useState<string | null>(null);
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [correctionNotes, setCorrectionNotes] = useState<string | null>(null);
    const [sessionMode, setSessionMode] = useState<'building' | 'picking' | 'double_checking'>('building');

    // New Session Initialization State
    const [isInitializing, setIsInitializing] = useState(false);
    const [pendingItem, setPendingItem] = useState<any>(null);

    // 3. Hook Integration
    const {
        cartItems,
        setCartItems,
        orderNumber,
        setOrderNumber,
        addToCart: addToCartInternal,
        updateCartQty,
        setCartQty,
        removeFromCart,
        clearCart,
        loadFromLocalStorage,
        getAvailableStock
    } = usePickingCart({
        sessionMode,
        reservedQuantities
    });

    const { isLoaded, isSaving, lastSaved, loadExternalList } = usePickingSync({
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
        ownerId,
        setOwnerId,
        setCorrectionNotes,
        setSessionMode,
        loadFromLocalStorage,
        showError
    });

    // Moved resetSession UP so it can be passed to usePickingActions
    const resetSession = (skipState = false) => {
        // Atomic Reset
        if (!skipState) {
            clearCart();
            setActiveListId(null);
            setListStatus('active');
            setCheckedBy(null);
            setOwnerId(null);
            setCorrectionNotes(null);
            setSessionMode('building');
            setOrderNumber(null);
        }

        // Comprehensive localStorage cleanup
        const keysToRemove = [
            'picking_cart_items',
            'picking_order_number',
            'active_picking_list_id',
            'picking_session_mode'
        ];

        keysToRemove.forEach(k => localStorage.removeItem(k));

        // Also clean up double check progress if any
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('double_check_progress_')) {
                localStorage.removeItem(key);
            }
        });
    };

    const {
        completeList,
        markAsReady,
        lockForCheck,
        releaseCheck,
        returnToPicker,
        revertToPicking,
        deleteList,
        generatePickingPath
    } = usePickingActions({
        user,
        isDemoMode,
        activeListId,
        cartItems,
        orderNumber,
        sessionMode,
        setCartItems,
        setActiveListId,
        setOrderNumber,
        setListStatus,
        setCheckedBy,
        setOwnerId,
        setCorrectionNotes,
        setSessionMode,
        setIsSaving: () => { },
        resetSession
    });

    const { notes, isLoading: isNotesLoading, addNote: addNoteRaw } = usePickingNotes(activeListId);

    const addNote = async (message: string) => {
        if (!user) return;
        await addNoteRaw(user.id, message);
    };

    // Return to Building: Revert from Picking mode back to Building mode
    const returnToBuilding = async () => {
        if (!activeListId) {
            toast.error('No active picking session to return from.');
            return;
        }

        try {
            // Delete the picking list from database (releases reservations)
            await deleteList(activeListId, true);

            // Change back to building mode
            setSessionMode('building');
            setActiveListId(null);

            // Keep cartItems intact (user doesn't lose work)
            // Update localStorage
            localStorage.setItem('picking_session_mode', 'building');
            localStorage.removeItem('active_picking_list_id');

            toast('Returned to building mode. Stock reservations released.', {
                icon: '↩️',
                duration: 3000
            });
        } catch (err) {
            console.error('Failed to return to building:', err);
            toast.error('Failed to return to building mode');
        }
    };

    // Intercept Add to Cart to ensure session is initialized
    const addToCart = async (item: any) => {
        // Block adding items in picking mode
        if (sessionMode === 'picking') {
            toast.error('Cannot add items in picking mode. Use "Return to Building" to make changes.', { icon: '🔒' });
            return;
        }

        // Allow adding if we have an active list OR if we're building and have an order number
        if (activeListId || orderNumber) {
            addToCartInternal(item);
            return;
        }

        // Otherwise, need to initialize session first
        setPendingItem(item);
        setIsInitializing(true);
    };

    const startNewSession = async (strategy: 'auto' | 'manual' | 'resume', manualOrderNumber?: string, resumeId?: string) => {
        setIsInitializing(false);
        const itemToAdd = pendingItem;
        setPendingItem(null);

        if (strategy === 'resume' && resumeId) {
            await loadExternalList(resumeId);
            if (itemToAdd) {
                addToCartInternal(itemToAdd);
            }
            return;
        }

        // Clean slate for new session
        resetSession(true);

        let newOrderNumber = manualOrderNumber;

        if (strategy === 'auto') {
            const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
            const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            newOrderNumber = `ORD-${dateStr}-${random}`;
        }

        if (newOrderNumber) {
            setOrderNumber(newOrderNumber);
            localStorage.setItem('picking_order_number', newOrderNumber);
        }

        // Start in Building Mode
        setSessionMode('building');
        localStorage.setItem('picking_session_mode', 'building');

        if (itemToAdd) {
            addToCartInternal(itemToAdd);
        }
    };

    const value: PickingContextType = {
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
        notes,
        isNotesLoading,
        addNote,
        sessionMode,
        setSessionMode,
        addToCart,
        updateCartQty,
        setCartQty,
        removeFromCart,
        clearCart,
        getAvailableStock,
        completeList,
        markAsReady,
        lockForCheck,
        releaseCheck,
        returnToPicker,
        revertToPicking,
        deleteList,
        loadExternalList,
        generatePickingPath,
        returnToBuilding,
        isLoaded,
        isSaving,
        lastSaved,
        resetSession,

        isInitializing,
        setIsInitializing,
        startNewSession,
        pendingItem,
        cancelInitialization: () => {
            setIsInitializing(false);
            setPendingItem(null);
        }
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
