import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { debounce } from '../../utils/debounce';
import toast from 'react-hot-toast';
import type { CartItem } from './usePickingCart';

interface UsePickingSyncProps {
  user: any;
  sessionMode: 'building' | 'picking' | 'double_checking';
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
  ownerId: string | null;
  setOwnerId: (id: string | null) => void;
  setCorrectionNotes: (notes: string | null) => void;
  setSessionMode: (mode: 'building' | 'picking' | 'double_checking') => void;
  loadFromLocalStorage: () => void;
  showError: (title: string, msg: string) => void;
  resetSession: () => void;
}

const SYNC_DEBOUNCE_MS = 1000;

export const usePickingSync = ({
  user,
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
  showError,
  resetSession,
}: UsePickingSyncProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const isInitialSyncRef = useRef(true);
  const isSyncingRef = useRef(false);
  const takeoverSyncRef = useRef<string | null>(null);

  const sessionModeRef = useRef(sessionMode);
  const listStatusRef = useRef(listStatus);
  const correctionNotesRef = useRef(correctionNotes);
  const checkedByRef = useRef(checkedBy);
  const ownerIdRef = useRef(ownerId);

  useEffect(() => {
    sessionModeRef.current = sessionMode;
    listStatusRef.current = listStatus;
    correctionNotesRef.current = correctionNotes;
    checkedByRef.current = checkedBy;
    ownerIdRef.current = ownerId;
  }, [sessionMode, listStatus, correctionNotes, checkedBy, ownerId]);

  // 1. Initial Load Logic
  useEffect(() => {
    if (!user) {
      setCartItems([]);
      setActiveListId(null);
      setIsLoaded(true);
      return;
    }

    const loadSession = async () => {
      try {
        const FIVE_HOURS_MS = 1000 * 60 * 60 * 5;

        // A. Check for double-check session first (Highest priority)
        const { data: doubleCheckData } = await supabase
          .from('picking_lists')
          .select('id, items, order_number, status, checked_by, user_id, correction_notes, updated_at')
          .eq('checked_by', user.id)
          .eq('status', 'double_checking')
          .limit(1)
          .maybeSingle();

        if (doubleCheckData) {
          const updatedAt = doubleCheckData.updated_at
            ? new Date(doubleCheckData.updated_at).getTime()
            : Date.now();
          const isStale = Date.now() - updatedAt > FIVE_HOURS_MS;

          if (isStale) {
            console.log('🧹 Double check session expired (>5h)');
            await supabase
              .from('picking_lists')
              .update({ status: 'ready_to_double_check', checked_by: null })
              .eq('id', doubleCheckData.id);
            resetSession();
          } else {
            setCartItems((doubleCheckData.items as any as CartItem[]) || []);
            setActiveListId(doubleCheckData.id as string);
            setOrderNumber(doubleCheckData.order_number || null);
            setListStatus(doubleCheckData.status as string);
            setCheckedBy(doubleCheckData.checked_by || null);
            setOwnerId(doubleCheckData.user_id || null);
            setCorrectionNotes(doubleCheckData.correction_notes || null);
            setSessionMode('double_checking');
          }
          setIsLoaded(true);
          return;
        }

        // B. Check for active picking sessions owned by this user
        const { data: pickingData, error } = await supabase
          .from('picking_lists')
          .select('id, items, order_number, status, checked_by, user_id, correction_notes, updated_at')
          .eq('user_id', user.id)
          .in('status', ['active', 'needs_correction'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) console.error('Error loading picking session:', error);

        if (pickingData) {
          const updatedAt = pickingData.updated_at
            ? new Date(pickingData.updated_at).getTime()
            : Date.now();
          const isStale = Date.now() - updatedAt > FIVE_HOURS_MS;

          if (isStale) {
            console.log('🧹 Picking session expired (>5h)');
            await supabase.from('picking_lists').delete().eq('id', pickingData.id);
            resetSession();
          } else {
            setCartItems((pickingData.items as any as CartItem[]) || []);
            setActiveListId(pickingData.id as string);
            setOrderNumber(pickingData.order_number || null);
            setListStatus(pickingData.status as string);
            setCheckedBy(pickingData.checked_by || null);
            setOwnerId(pickingData.user_id || null);
            setCorrectionNotes(pickingData.correction_notes || null);
            setSessionMode('picking');
          }
        } else {
          // C. Sanitization Check: If user has an ID in localStorage but no valid session in DB
          const localId = localStorage.getItem('active_picking_list_id');
          if (localId) {
            const { data: remoteCheck } = await supabase
              .from('picking_lists')
              .select('status')
              .eq('id', localId)
              .maybeSingle();

            if (!remoteCheck || remoteCheck.status === 'completed') {
              console.log('🧹 Purging stale local session (completed or non-existent in DB)');
              resetSession();
            } else {
              loadFromLocalStorage();
            }
          } else {
            loadFromLocalStorage();
          }
        }
      } catch (err) {
        console.error('Session load failed:', err);
      } finally {
        setIsLoaded(true);
      }
    };

    loadSession();
  }, [user?.id]);

  // 2. Real-time Monitor
  useEffect(() => {
    if (!activeListId || !user) return;

    const showTakeoverAlert = async (takerId: string) => {
      if (takeoverSyncRef.current === activeListId) return;
      takeoverSyncRef.current = activeListId;

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', takerId)
          .single();

        const takerName = profile?.full_name || 'Another user';

        toast(`${takerName} has taken over this order.\nYour session is being reset.`, {
          icon: 'ℹ️',
          duration: 4000,
          style: { border: '1px solid #3b82f6', padding: '16px', color: '#1e293b' },
        });

        setTimeout(() => {
          resetSession();
          takeoverSyncRef.current = null;
        }, 1500);
      } catch (err) {
        takeoverSyncRef.current = null;
        console.error('Error showing takeover alert:', err);
      }
    };

    const channel = supabase
      .channel(`list_status_sync_${activeListId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'picking_lists', filter: `id=eq.${activeListId}` },
        (payload) => {
          const newData = payload.new;

          if (sessionModeRef.current === 'picking' && newData.user_id && (newData.user_id as string) !== user.id) {
            showTakeoverAlert(newData.user_id as string);
            return;
          }

          if (sessionModeRef.current === 'double_checking' && newData.checked_by && (newData.checked_by as string) !== user.id) {
            showTakeoverAlert(newData.checked_by as string);
            return;
          }

          if (newData.status !== listStatusRef.current) setListStatus(newData.status as string);
          if (newData.correction_notes !== correctionNotesRef.current) setCorrectionNotes(newData.correction_notes as string | null);
          if (newData.checked_by !== checkedByRef.current) setCheckedBy(newData.checked_by as string | null);
          if (newData.user_id !== ownerIdRef.current) setOwnerId(newData.user_id as string | null);

          if (sessionModeRef.current === 'double_checking' && (newData.status === 'active' || newData.status === 'needs_correction')) {
            if (newData.user_id === user.id) setSessionMode('picking');
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeListId, user?.id]);

  // 3. Save Logic
  const saveToDb = async (items: CartItem[], userId: string, listId: string | null, orderNum: string | null) => {
    if (sessionMode === 'building') return;
    if (!userId || isSyncingRef.current || sessionMode !== 'picking') return;

    isSyncingRef.current = true;
    setIsSaving(true);
    try {
      if (listId) {
        const { error } = await supabase.from('picking_lists').update({ items: items as any, order_number: orderNum }).eq('id', listId);
        if (error) throw error;
      } else if (items.length > 0) {
        const { data, error } = await supabase.from('picking_lists').insert({ user_id: userId, items: items as any, status: 'active', order_number: orderNum } as any).select().single();
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

  const debouncedSaveRef = useRef<any>(null);
  useEffect(() => {
    debouncedSaveRef.current = debounce((items: CartItem[], userId: string, listId: string | null, orderNum: string | null) =>
      saveToDb(items, userId, listId, orderNum), SYNC_DEBOUNCE_MS);
  }, [sessionMode]);

  useEffect(() => {
    if (sessionMode === 'building' || !isLoaded || !user || sessionMode !== 'picking') return;
    if (cartItems.length === 0 && !activeListId && isInitialSyncRef.current) {
      isInitialSyncRef.current = false;
      return;
    }
    if (debouncedSaveRef.current) {
      debouncedSaveRef.current(cartItems, user.id, activeListId, orderNumber);
      isInitialSyncRef.current = false;
    }
  }, [cartItems, orderNumber, activeListId, isLoaded, user, sessionMode]);

  // 4. Load External List
  const loadExternalList = useCallback(async (listId: string) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.from('picking_lists').select('id, items, order_number, status, checked_by, user_id, correction_notes').eq('id', listId).single();
      if (error) throw error;
      if (data) {
        setCartItems((data.items as any as CartItem[]) || []);
        setActiveListId(data.id as string);
        setOrderNumber(data.order_number || null);
        setListStatus(data.status as string);
        setCheckedBy(data.checked_by || null);
        setOwnerId(data.user_id || null);
        setCorrectionNotes(data.correction_notes || null);
        setSessionMode('double_checking');
        return data;
      }
    } catch (err: any) {
      console.error('Failed to load external list:', err);
      showError('Load Error', err.message);
    } finally {
      setIsSaving(false);
    }
  }, [user, showError]);

  return { isLoaded, isSaving, lastSaved, loadExternalList };
};
