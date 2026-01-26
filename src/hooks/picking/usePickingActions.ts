import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import type { CartItem } from './usePickingCart';

interface UsePickingActionsProps {
  user: any;
  activeListId: string | null;
  cartItems: CartItem[];
  orderNumber: string | null;
  sessionMode: 'building' | 'picking' | 'double_checking';
  setCartItems: (items: any[]) => void;
  setActiveListId: (id: string | null) => void;
  setOrderNumber: (num: string | null) => void;
  setListStatus: (status: string) => void;
  setCheckedBy: (id: string | null) => void;
  setOwnerId: (id: string | null) => void;
  setCorrectionNotes: (notes: string | null) => void;
  setSessionMode: (mode: 'building' | 'picking' | 'double_checking') => void;
  setIsSaving: (val: boolean) => void;
  resetSession: (skipState?: boolean) => void;
}

export const usePickingActions = ({
  user,
  activeListId,
  cartItems,
  orderNumber,
  setCartItems,
  setActiveListId,
  setOrderNumber,
  setListStatus,
  setCheckedBy,
  setOwnerId,
  setCorrectionNotes,
  setSessionMode,
  setIsSaving,
  resetSession,
}: UsePickingActionsProps) => {
  const completeList = useCallback(
    async (listIdOverride?: string) => {
      const targetId = listIdOverride || activeListId;

      if (!targetId || !user) return;
      setIsSaving(true);
      try {
        const { error } = await supabase
          .from('picking_lists')
          .update({ status: 'completed' } as any)
          .eq('id', targetId);

        if (error) throw error;

        if (targetId === activeListId) {
          resetSession();
        }
      } catch (err) {
        console.error('Failed to complete list:', err);
      } finally {
        setIsSaving(false);
      }
    },
    [activeListId, user, resetSession, setIsSaving]
  );

  const markAsReady = useCallback(
    async (items?: CartItem[], orderNum?: string) => {
      if (!activeListId || !user) return null;

      const finalItems = items || cartItems;
      const finalOrderNum = orderNum || orderNumber;

      if (finalItems.length === 0) {
        toast.error('Cannot mark an empty order as ready.');
        return null;
      }

      setIsSaving(true);
      try {
        // Enforcement: Release any other list this user might be checking
        const { error: releaseError } = await supabase
          .from('picking_lists')
          .update({
            status: 'ready_to_double_check',
            checked_by: null,
          } as any)
          .eq('checked_by', user.id)
          .neq('id', activeListId); // Don't release the one we are about to lock

        if (releaseError) console.error('Error releasing previous locks:', releaseError);

        // 1. Validation Logic: Check for concurrency conflicts
        // We must ensure that (Stock - ReservedByOthers) >= MyQty
        const skuList = finalItems.map((i) => i.sku);

        // A. Fetch current stock
        const { data: currentStock, error: stockError } = await supabase
          .from('inventory')
          .select('sku, quantity, warehouse, location')
          .in('sku', skuList);

        if (stockError) throw stockError;

        // B. Fetch ALL active allocations for these SKUs (excluding self)
        const { data: activeLists, error: listsError } = await supabase
          .from('picking_lists')
          .select('id, items')
          .in('status', ['active', 'needs_correction', 'ready_to_double_check', 'double_checking'])
          .neq('id', activeListId);

        if (listsError) throw listsError;

        // C. Calculate availability
        const stockMap = new Map<string, { stock: number; reserved: number }>();

        // Fill stock
        currentStock?.forEach((row: any) => {
          const key = `${row.sku}-${row.warehouse}-${row.location}`;
          stockMap.set(key, { stock: Number(row.quantity || 0), reserved: 0 });
        });

        // Fill reservations
        activeLists?.forEach((list: any) => {
          const listItems = list.items || [];
          if (Array.isArray(listItems)) {
            listItems.forEach((li: any) => {
              const key = `${li.sku}-${li.warehouse}-${li.location}`;
              if (stockMap.has(key)) {
                const entry = stockMap.get(key)!;
                entry.reserved += li.pickingQty || 0;
              }
            });
          }
        });

        // D. Validate my cart
        for (const myItem of finalItems) {
          const key = `${myItem.sku}-${myItem.warehouse}-${myItem.location}`;
          const entry = stockMap.get(key);

          // If item not found in stock (deleted?), fail
          if (!entry) {
            toast.error(`Item ${myItem.sku} no longer exists in inventory.`);
            return null;
          }

          const availableForMe = entry.stock - entry.reserved;
          const myQty = myItem.pickingQty || 0;

          if (myQty > availableForMe) {
            toast.error(
              `Stock conflict! ${myItem.sku}: Only ${availableForMe} available (you need ${myQty}). Another user may have taken it.`,
              { duration: 5000 }
            );
            return null; // Abort
          }
        }
        // --- End Validation ---

        // Transition to double_checking immediately
        const { error } = await supabase
          .from('picking_lists')
          .update({
            status: 'double_checking',
            checked_by: user.id, // Auto-assign to self for verification
            items: finalItems as any,
            order_number: finalOrderNum,
            correction_notes: null,
          } as any)
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
    },
    [activeListId, user, cartItems, orderNumber, setCartItems, setOrderNumber, setCorrectionNotes, setListStatus, setCheckedBy, setSessionMode, setIsSaving]
  );

  const lockForCheck = useCallback(
    async (listId: string) => {
      if (!user) return;
      try {
        const { error: releaseError } = await supabase
          .from('picking_lists')
          .update({
            status: 'ready_to_double_check',
            checked_by: null,
          } as any)
          .eq('checked_by', user.id)
          .neq('id', listId);

        if (releaseError) console.error('Error releasing previous locks:', releaseError);

        const { error } = await supabase
          .from('picking_lists')
          .update({
            status: 'double_checking',
            checked_by: user.id,
          } as any)
          .eq('id', listId);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to lock list:', err);
      }
    },
    [user]
  );

  const releaseCheck = useCallback(
    async (listId: string) => {
      try {
        const { error } = await supabase
          .from('picking_lists')
          .update({
            status: 'ready_to_double_check',
            checked_by: null,
          } as any)
          .eq('id', listId);
        if (error) throw error;

        resetSession();
      } catch (err) {
        console.error('Failed to release list:', err);
      }
    },
    [resetSession]
  );

  const returnToPicker = useCallback(
    async (listId: string, notes: string) => {
      if (!user) {
        console.error('No user found for returnToPicker');
        return;
      }

      try {
        // 1. Update list status and legacy notes field
        const { error: listError } = await supabase
          .from('picking_lists')
          .update({
            status: 'needs_correction',
            checked_by: null,
            correction_notes: notes,
          } as any)
          .eq('id', listId);

        if (listError) throw listError;

        // 2. Add to historical notes timeline
        const { error: noteError } = await supabase.from('picking_list_notes').insert({
          list_id: listId,
          user_id: user.id,
          message: notes,
        } as any);

        if (noteError) {
          console.error('Failed to log historical note:', noteError);
        }

        // Clear local state
        resetSession();
        toast.success('Sent back to picker.');
      } catch (err) {
        console.error('Failed to return to picker:', err);
        toast.error('Failed to update order status');
      }
    },
    [user, resetSession]
  );

  const revertToPicking = useCallback(async () => {
    if (!activeListId || !user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('picking_lists')
        .update({
          status: 'active',
          checked_by: null,
        } as any)
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
  }, [activeListId, user, setListStatus, setCheckedBy, setSessionMode, setIsSaving]);

  const deleteList = useCallback(
    async (listId: string | null, keepLocalState = false) => {
      if (!listId) {
        if (!keepLocalState) resetSession();
        toast.success('Local session reset');
        return;
      }

      try {
        const { data: currentList } = await supabase
          .from('picking_lists')
          .select('status')
          .eq('id', listId)
          .maybeSingle();

        if (currentList?.status === 'completed') {
          console.log('🛡️ Blocked deletion of a completed order to protect inventory history.');
          if (listId === activeListId && !keepLocalState) {
            resetSession();
          }
          return;
        }

        const { error: logsError } = await supabase
          .from('inventory_logs')
          .delete()
          .eq('list_id', listId);

        if (logsError) {
          console.error('Failed to delete related inventory logs:', logsError);
          throw logsError;
        }

        const { error } = await supabase.from('picking_lists').delete().eq('id', listId);

        if (error) throw error;

        if (listId === activeListId && !keepLocalState) {
          resetSession();
        }
        if (!keepLocalState) {
          toast.success('Order deleted successfully');
        }
      } catch (err) {
        console.error('Failed to delete list:', err);
        toast.error('Failed to delete order');
        throw err;
      }
    },
    [activeListId, resetSession]
  );

  const generatePickingPath = useCallback(async () => {
    if (!user || cartItems.length === 0) {
      toast.error('Add items to your cart first.');
      return;
    }

    setIsSaving(true);
    try {
      const skuList = cartItems.map((i) => i.sku);

      const { data: currentStock, error: stockError } = await supabase
        .from('inventory')
        .select('sku, quantity, warehouse, location')
        .in('sku', skuList);

      if (stockError) throw stockError;

      const { data: activeLists, error: listsError } = await supabase
        .from('picking_lists')
        .select('id, items')
        .in('status', ['active', 'needs_correction', 'ready_to_double_check', 'double_checking']);

      if (listsError) throw listsError;

      const stockMap = new Map<string, { stock: number; reserved: number }>();

      currentStock?.forEach((row: any) => {
        const key = `${row.sku}-${row.warehouse}-${row.location}`;
        stockMap.set(key, { stock: Number(row.quantity || 0), reserved: 0 });
      });

      activeLists?.forEach((list: any) => {
        const listItems = list.items || [];
        if (Array.isArray(listItems)) {
          listItems.forEach((li: any) => {
            const key = `${li.sku}-${li.warehouse}-${li.location}`;
            if (stockMap.has(key)) {
              const entry = stockMap.get(key)!;
              entry.reserved += li.pickingQty || 0;
            }
          });
        }
      });

      for (const myItem of cartItems) {
        const key = `${myItem.sku}-${myItem.warehouse}-${myItem.location}`;
        const entry = stockMap.get(key);

        if (!entry) {
          toast.error(`Item ${myItem.sku} no longer exists in inventory.`);
          return;
        }

        const availableAcrossSystem = entry.stock - entry.reserved;
        const myQty = myItem.pickingQty || 0;

        if (myQty > availableAcrossSystem) {
          toast.error(
            `Constraint Error: ${myItem.sku} - Only ${availableAcrossSystem} available.`,
            { duration: 5000 }
          );
          return;
        }
      }

      const { data, error } = await supabase
        .from('picking_lists')
        .insert({
          user_id: user.id || user.user_id,
          items: cartItems as any,
          status: 'active',
          order_number: orderNumber,
        } as any)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setActiveListId(data.id);
        const ownerId = (data as any).user_id;
        setListStatus('active');
        setOwnerId(ownerId);
        setSessionMode('picking');

        localStorage.setItem('picking_session_mode', 'picking');
        localStorage.setItem('active_picking_list_id', data.id);

        toast.success('Path generated! Stock reserved.');
      }
    } catch (err) {
      console.error('Failed to generate picking path:', err);
      toast.error('Failed to start picking session.');
    } finally {
      setIsSaving(false);
    }
  }, [user, cartItems, orderNumber, setActiveListId, setListStatus, setOwnerId, setSessionMode, setIsSaving]);

  return {
    completeList,
    markAsReady,
    lockForCheck,
    releaseCheck,
    returnToPicker,
    revertToPicking,
    deleteList,
    generatePickingPath,
  };
};
