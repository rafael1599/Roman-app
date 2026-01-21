import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import type { CartItem } from './usePickingCart';

interface UsePickingActionsProps {
    user: any;
    isDemoMode: boolean;
    activeListId: string | null;
    cartItems: CartItem[];
    orderNumber: string | null;
    sessionMode: 'picking' | 'double_checking';
    setCartItems: (items: CartItem[]) => void;
    setActiveListId: (id: string | null) => void;
    setOrderNumber: (num: string | null) => void;
    setListStatus: (status: string) => void;
    setCheckedBy: (id: string | null) => void;
    setCorrectionNotes: (notes: string | null) => void;
    setSessionMode: (mode: 'picking' | 'double_checking') => void;
    setIsSaving: (saving: boolean) => void;
}

export const usePickingActions = ({
    user,
    isDemoMode,
    activeListId,
    cartItems,
    orderNumber,
    setCartItems,
    setActiveListId,
    setOrderNumber,
    setListStatus,
    setCheckedBy,
    setCorrectionNotes,
    setSessionMode,
    setIsSaving
}: UsePickingActionsProps) => {

    const completeList = useCallback(async (listIdOverride?: string) => {
        const targetId = listIdOverride || activeListId;
        if (isDemoMode) {
            setCartItems([]);
            setActiveListId(null);
            localStorage.removeItem('picking_cart_items');
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
                localStorage.removeItem('picking_cart_items');
                setSessionMode('picking');
            }
        } catch (err) {
            console.error('Failed to complete list:', err);
        } finally {
            setIsSaving(false);
        }
    }, [activeListId, user, isDemoMode]);

    const markAsReady = useCallback(async (items?: CartItem[], orderNum?: string) => {
        if (!activeListId || isDemoMode || !user) return null;

        const finalItems = items || cartItems;
        const finalOrderNum = orderNum || orderNumber;

        if (finalItems.length === 0) {
            toast.error("Cannot mark an empty order as ready.");
            return null;
        }

        setIsSaving(true);
        try {
            // Enforcement: Release any other list this user might be checking
            const { error: releaseError } = await supabase
                .from('picking_lists')
                .update({
                    status: 'ready_to_double_check',
                    checked_by: null
                })
                .eq('checked_by', user.id)
                .neq('id', activeListId); // Don't release the one we are about to lock

            if (releaseError) console.error('Error releasing previous locks:', releaseError);

            // Transition to double_checking immediately
            const { error } = await supabase
                .from('picking_lists')
                .update({
                    status: 'double_checking',
                    checked_by: user.id, // Auto-assign to self for verification
                    items: finalItems,
                    order_number: finalOrderNum,
                    correction_notes: null
                })
                .eq('id', activeListId);

            if (error) throw error;

            const listId = activeListId;
            setCartItems(finalItems);
            setOrderNumber(finalOrderNum); // Ensure local state matches
            setCorrectionNotes(null);
            setListStatus('double_checking');
            setCheckedBy(user.id);
            setSessionMode('double_checking');
            toast.success('Order ready! You can now verify it.');
            return listId;
        } catch (err: any) {
            console.error('Failed to mark as ready:', err);
            toast.error('Failed to mark order ready');
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [activeListId, user, isDemoMode, cartItems, orderNumber]);

    const lockForCheck = useCallback(async (listId: string) => {
        if (isDemoMode || !user) return;
        try {
            const { error: releaseError } = await supabase
                .from('picking_lists')
                .update({
                    status: 'ready_to_double_check',
                    checked_by: null
                })
                .eq('checked_by', user.id)
                .neq('id', listId);

            if (releaseError) console.error('Error releasing previous locks:', releaseError);

            const { error } = await supabase
                .from('picking_lists')
                .update({
                    status: 'double_checking',
                    checked_by: user.id
                })
                .eq('id', listId);
            if (error) throw error;

            if (releaseError === null) {
                // We only show toast if we successfully locked and there was potential cleanup
                // (Though we don't know for sure if it updated rows without checking count)
            }
        } catch (err) {
            console.error('Failed to lock list:', err);
        }
    }, [user, isDemoMode]);

    const releaseCheck = useCallback(async (listId: string) => {
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

    const returnToPicker = useCallback(async (listId: string, notes: string) => {
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

    const deleteList = useCallback(async (listId: string) => {
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
                localStorage.removeItem('picking_cart_items');
            }
            toast.success('Order deleted successfully');
        } catch (err) {
            console.error('Failed to delete list:', err);
            toast.error('Failed to delete order');
        }
    }, [activeListId, isDemoMode]);

    return {
        completeList,
        markAsReady,
        lockForCheck,
        releaseCheck,
        returnToPicker,
        revertToPicking,
        deleteList
    };
};
