import { useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';

export type GroupType = 'fedex' | 'general';

export const useOrderGroups = () => {
  const createGroup = useCallback(async (type: GroupType, orderIds: string[]) => {
    if (orderIds.length < 2) return null;

    const { data: group, error: groupError } = await supabase
      .from('order_groups')
      .insert({ group_type: type })
      .select('id')
      .single();

    if (groupError || !group) {
      console.error('Failed to create group:', groupError);
      toast.error('Failed to create group');
      return null;
    }

    const { error: updateError } = await supabase
      .from('picking_lists')
      .update({ group_id: group.id })
      .in('id', orderIds);

    if (updateError) {
      console.error('Failed to assign orders to group:', updateError);
      toast.error('Failed to assign orders to group');
      await supabase.from('order_groups').delete().eq('id', group.id);
      return null;
    }

    toast.success(type === 'fedex' ? 'FedEx group created' : 'Group created');
    return group.id;
  }, []);

  const addToGroup = useCallback(async (groupId: string, orderId: string) => {
    const { error } = await supabase
      .from('picking_lists')
      .update({ group_id: groupId })
      .eq('id', orderId);

    if (error) {
      console.error('Failed to add order to group:', error);
      toast.error('Failed to add order to group');
      return false;
    }

    toast.success('Order added to group');
    return true;
  }, []);

  const removeFromGroup = useCallback(async (orderId: string, groupId: string) => {
    const { error } = await supabase
      .from('picking_lists')
      .update({ group_id: null })
      .eq('id', orderId);

    if (error) {
      console.error('Failed to remove order from group:', error);
      toast.error('Failed to remove from group');
      return false;
    }

    // Check if group is now empty and clean up
    const { data: remaining } = await supabase
      .from('picking_lists')
      .select('id')
      .eq('group_id', groupId)
      .limit(2);

    if (remaining && remaining.length <= 1) {
      // If 0 or 1 orders left, dissolve the group
      if (remaining.length === 1) {
        await supabase.from('picking_lists').update({ group_id: null }).eq('id', remaining[0].id);
      }
      await supabase.from('order_groups').delete().eq('id', groupId);
    }

    return true;
  }, []);

  return { createGroup, addToGroup, removeFromGroup };
};
