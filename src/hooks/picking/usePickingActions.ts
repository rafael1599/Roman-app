import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import type { CartItem } from './usePickingCart';

interface UsePickingActionsProps {
  user: any;
  isDemoMode: boolean;
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
  isDemoMode,
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
          resetSession();
        }
      } catch (err) {
        console.error('Failed to complete list:', err);
      } finally {
        setIsSaving(false);
      }
    },
    [activeListId, user, isDemoMode]
  );

  const markAsReady = useCallback(
    async (items?: CartItem[], orderNum?: string) => {
      if (!activeListId || isDemoMode || !user) return null;

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
          })
          .eq('checked_by', user.id)
          .neq('id', activeListId); // Don't release the one we are about to lock

        if (releaseError) console.error('Error releasing previous locks:', releaseError);

        // 1. Validation Logic: Check for concurrency conflicts
        // We must ensure that (Stock - ReservedByOthers) >= MyQty
        const skuList = finalItems.map((i) => i.SKU);

        // A. Fetch current stock
        const { data: currentStock, error: stockError } = await supabase
          .from('inventory')
          .select('SKU, Quantity, Warehouse, Location')
          .in('SKU', skuList);

        if (stockError) throw stockError;

        // B. Fetch ALL active allocations for these SKUs (excluding self)
        // Note: This relies on the fact that picking_lists stores items as JSONB.
        // We can't easily sum JSONB in standard PostgREST without a function.
        // fallback: The most critical failure is if stock is 1 and 2 people pick it.
        // We can rely on `inventory` if we had a `reserved_qty` column, but we don't.

        // ALTERNATIVE: Use the existing Hook logic but force a refresh?
        // No, the hook is passive.

        // PROFESSIONAL APPROACH (Lite):
        // We will fetch all `picking_lists` that are NOT completed/archived.
        const { data: activeLists, error: listsError } = await supabase
          .from('picking_lists')
          .select('id, items')
          .in('status', ['active', 'needs_correction', 'ready_to_double_check', 'double_checking'])
          .neq('id', activeListId);

        if (listsError) throw listsError;

        // C. Calculate availability
        // Map: Key -> { stock: number, reservedByOthers: number }
        const stockMap = new Map<string, { stock: number; reserved: number }>();

        // Fill stock
        currentStock?.forEach((row) => {
          const key = `${row.SKU}-${row.Warehouse}-${row.Location}`; // SKU-Wh-Loc
          stockMap.set(key, { stock: row.Quantity, reserved: 0 });
        });

        // Fill reservations
        activeLists?.forEach((list: any) => {
          const listItems = list.items || [];
          if (Array.isArray(listItems)) {
            listItems.forEach((li: any) => {
              const key = `${li.SKU}-${li.Warehouse}-${li.Location}`;
              if (stockMap.has(key)) {
                const entry = stockMap.get(key)!;
                entry.reserved += li.pickingQty || 0;
              }
            });
          }
        });

        // D. Validate my cart
        for (const myItem of finalItems) {
          const key = `${myItem.SKU}-${myItem.Warehouse}-${myItem.Location}`;
          const entry = stockMap.get(key);

          // If item not found in stock (deleted?), fail
          if (!entry) {
            toast.error(`Item ${myItem.SKU} no longer exists in inventory.`);
            return null;
          }

          const availableForMe = entry.stock - entry.reserved;
          const myQty = myItem.pickingQty || 0;

          if (myQty > availableForMe) {
            toast.error(
              `Stock conflict! ${myItem.SKU}: Only ${availableForMe} available (you need ${myQty}). Another user may have taken it.`,
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
            items: finalItems,
            order_number: finalOrderNum,
            correction_notes: null,
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
    },
    [activeListId, user, isDemoMode, cartItems, orderNumber]
  );

  const lockForCheck = useCallback(
    async (listId: string) => {
      if (isDemoMode || !user) return;
      try {
        const { error: releaseError } = await supabase
          .from('picking_lists')
          .update({
            status: 'ready_to_double_check',
            checked_by: null,
          })
          .eq('checked_by', user.id)
          .neq('id', listId);

        if (releaseError) console.error('Error releasing previous locks:', releaseError);

        const { error } = await supabase
          .from('picking_lists')
          .update({
            status: 'double_checking',
            checked_by: user.id,
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
    },
    [user, isDemoMode]
  );

  const releaseCheck = useCallback(
    async (listId: string) => {
      if (isDemoMode) return;
      try {
        const { error } = await supabase
          .from('picking_lists')
          .update({
            status: 'ready_to_double_check',
            checked_by: null,
          })
          .eq('id', listId);
        if (error) throw error;

        // Clear local state
        // Clear local state
        resetSession();
      } catch (err) {
        console.error('Failed to release list:', err);
      }
    },
    [isDemoMode]
  );

  const returnToPicker = useCallback(
    async (listId: string, notes: string) => {
      if (isDemoMode) return;
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
          })
          .eq('id', listId);

        if (listError) throw listError;

        // 2. Add to historical notes timeline
        const { error: noteError } = await supabase.from('picking_list_notes').insert({
          list_id: listId,
          user_id: user.id,
          message: notes,
        });

        if (noteError) {
          // Non-blocking error, just log it
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
    [isDemoMode, user, resetSession]
  );

  const revertToPicking = useCallback(async () => {
    if (!activeListId || isDemoMode || !user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('picking_lists')
        .update({
          status: 'active',
          checked_by: null,
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

  const deleteList = useCallback(
    async (listId: string | null, keepLocalState = false) => {
      // If no listId, we're in building mode - just reset local state (unless keeping it)
      if (!listId) {
        if (!keepLocalState) resetSession();
        toast.success('Local session reset');
        return;
      }

      if (isDemoMode) return;
      try {
        // SAFETY CHECK: Prevent deleting history of completed orders
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

        // First, delete all related inventory_logs entries to prevent foreign key constraint violation
        // (Only if not completed, which we checked above)
        const { error: logsError } = await supabase
          .from('inventory_logs')
          .delete()
          .eq('list_id', listId);

        if (logsError) {
          console.error('Failed to delete related inventory logs:', logsError);
          throw logsError;
        }

        // Now we can safely delete the picking list
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
        throw err; // Re-throw to allow caller to handle aborts
      }
    },
    [activeListId, isDemoMode, resetSession]
  );

  const generatePickingPath = useCallback(async () => {
    if (!user || cartItems.length === 0) {
      toast.error('Add items to your cart first.');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Validation Logic: Check for concurrency conflicts
      const skuList = cartItems.map((i) => i.SKU);

      // A. Fetch current stock
      const { data: currentStock, error: stockError } = await supabase
        .from('inventory')
        .select('SKU, Quantity, Warehouse, Location')
        .in('SKU', skuList);

      if (stockError) throw stockError;

      // B. Fetch ALL active allocations for these SKUs
      const { data: activeLists, error: listsError } = await supabase
        .from('picking_lists')
        .select('id, items')
        .in('status', ['active', 'needs_correction', 'ready_to_double_check', 'double_checking']);

      if (listsError) throw listsError;

      // C. Calculate availability
      const stockMap = new Map<string, { stock: number; reserved: number }>();

      currentStock?.forEach((row) => {
        const key = `${row.SKU}-${row.Warehouse}-${row.Location}`;
        stockMap.set(key, { stock: row.Quantity, reserved: 0 });
      });

      activeLists?.forEach((list: any) => {
        const listItems = list.items || [];
        if (Array.isArray(listItems)) {
          listItems.forEach((li: any) => {
            const key = `${li.SKU}-${li.Warehouse}-${li.Location}`;
            if (stockMap.has(key)) {
              const entry = stockMap.get(key)!;
              entry.reserved += li.pickingQty || 0;
            }
          });
        }
      });

      // D. Validate my cart request
      for (const myItem of cartItems) {
        const key = `${myItem.SKU}-${myItem.Warehouse}-${myItem.Location}`;
        const entry = stockMap.get(key);

        if (!entry) {
          toast.error(`Item ${myItem.SKU} no longer exists in inventory.`);
          return;
        }

        const availableAcrossSystem = entry.stock - entry.reserved;
        const myQty = myItem.pickingQty || 0;

        // Since we haven't reserved yet, we just check against available
        if (myQty > availableAcrossSystem) {
          toast.error(
            `Constraint Error: ${myItem.SKU} - Only ${availableAcrossSystem} available.`,
            { duration: 5000 }
          );
          return; // Abort
        }
      }

      // 2. Commit to Database
      const { data, error } = await supabase
        .from('picking_lists')
        .insert({
          user_id: user.id,
          items: cartItems,
          status: 'active',
          order_number: orderNumber,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setActiveListId(data.id);
        setListStatus('active');
        setOwnerId(data.user_id);
        setSessionMode('picking');

        // Also update local storage to reflect mode change
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
  }, [user, cartItems, orderNumber]);

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
