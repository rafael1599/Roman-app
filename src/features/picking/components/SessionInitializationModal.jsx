import React, { useState, useEffect } from 'react';
import { Play, Hash, RotateCcw, X, FileText, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { usePickingSession } from '../../../hooks/usePickingSession';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabaseClient';
import toast from 'react-hot-toast';

export const SessionInitializationModal = () => {
  const { isInitializing, startNewSession, cancelInitialization, pendingItem } =
    usePickingSession();
  const { user } = useAuth();

  const [mode, setMode] = useState('select'); // 'select' | 'input'
  const [manualOrder, setManualOrder] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [resumableSession, setResumableSession] = useState(null);

  // Check for resumable sessions (optional enhancement: could check DB too)
  useEffect(() => {
    if (!isInitializing) return;

    const checkResumable = async () => {
      // Check local storage primarily
      const localOrder = localStorage.getItem('picking_order_number');
      const localItems = localStorage.getItem('picking_cart_items');

      if (localOrder && localItems && JSON.parse(localItems).length > 0) {
        setResumableSession({
          type: 'local',
          orderNumber: localOrder,
          itemCount: JSON.parse(localItems).length,
        });
        return;
      }
    };

    checkResumable();
    // Reset local state when modal opens
    setMode('select');
    setManualOrder('');
    setResumableSession(null);
  }, [isInitializing]);

  if (!isInitializing) return null;

  const handleAutoStart = () => {
    startNewSession('auto');
  };

  const handleManualSubmit = async () => {
    if (!manualOrder.trim()) return;
    setIsChecking(true);

    // Check if this order number is already active by SOMEONE ELSE
    try {
      const { data, error } = await supabase
        .from('picking_lists')
        .select('id, user_id, profiles!user_id(full_name)')
        .eq('order_number', manualOrder.trim())
        .in('status', ['active', 'needs_correction'])
        .maybeSingle();

      if (data) {
        // If it exists, warn user
        const owner = data.profiles?.full_name || 'Another User';
        const confirmed = window.confirm(
          `Order #${manualOrder} is currently active by ${owner}. Do you want to take it over?`
        );
        if (confirmed) {
          await supabase.from('picking_lists').update({ user_id: user.id }).eq('id', data.id);

          startNewSession('manual', manualOrder.trim());
          toast.success('You took over the order!');
        }
      } else {
        // Brand new order
        startNewSession('manual', manualOrder.trim());
      }
    } catch (err) {
      console.error('Check failed', err);
      // Fallback: just allow it
      startNewSession('manual', manualOrder.trim());
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-subtle rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-subtle bg-main/50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-content uppercase tracking-tight">
              Start New Picking Order
            </h3>
            {pendingItem && (
              <p className="text-xs text-muted font-medium mt-1">
                Starting with: <span className="text-accent">{pendingItem.SKU}</span>
              </p>
            )}
          </div>
          <button
            onClick={cancelInitialization}
            className="p-2 hover:bg-subtle rounded-full text-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {mode === 'select' ? (
            <>
              {/* Auto Option */}
              <button
                onClick={handleAutoStart}
                className="w-full group relative flex items-center gap-4 p-4 bg-surface border-2 border-dashed border-subtle hover:border-accent hover:bg-accent/5 rounded-2xl transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center shadow-lg shadow-accent/20 group-hover:scale-110 transition-transform">
                  <Play size={20} fill="currentColor" />
                </div>
                <div className="flex-1">
                  <div className="font-black text-content uppercase tracking-tight">
                    Auto-Generate ID
                  </div>
                  <div className="text-xs text-muted font-medium">
                    Create a new unique order number
                  </div>
                </div>
              </button>

              {/* Manual Option */}
              <button
                onClick={() => setMode('input')}
                className="w-full group relative flex items-center gap-4 p-4 bg-surface border-2 border-dashed border-subtle hover:border-main hover:bg-main/50 rounded-2xl transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-main border border-subtle text-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Hash size={20} />
                </div>
                <div className="flex-1">
                  <div className="font-black text-content uppercase tracking-tight">
                    Enter Order #
                  </div>
                  <div className="text-xs text-muted font-medium">Type a specific order number</div>
                </div>
              </button>

              {/* Resume Option (Conditional) */}
              {resumableSession && (
                <button
                  onClick={() => startNewSession('resume', undefined, undefined)} // Logic to resume local?
                  // Actually PickingContext currently implies resume = DB.
                  // For local resume, we might just want to 'cancel' and let them continue?
                  // But the modal currently popped up meaning activeListId was null.
                  // If we Cancel, they are still in limbo.
                  // We should probably have a 'Resume Local' logic.
                  // For now, I'll omit this complex path and stick to Clean Start vs Manual.
                  // If they want to resume, they usually already have the session active.
                  // The issue is if they refreshed and it didn't auto-load?
                  // usePickingSync handles auto-load on mount. So if we are here, there is NO active session.
                  // So the local data is likely stale or abandoned.
                  className="hidden" // Hiding for now to avoid confusion
                />
              )}

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3">
                <AlertCircle size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-400 leading-relaxed font-medium">
                  Starting a new order will clear any previous unsaved picking data to ensure
                  accuracy.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-black text-lg">
                  #
                </span>
                <input
                  autoFocus
                  type="text"
                  value={manualOrder}
                  onChange={(e) => setManualOrder(e.target.value.toUpperCase())}
                  placeholder="Order Number"
                  className="w-full bg-main border-2 border-subtle focus:border-accent text-content rounded-xl pl-10 pr-4 py-4 font-mono text-xl font-bold uppercase tracking-widest outline-none transition-all placeholder:text-muted/50"
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('select')}
                  className="py-3 px-4 rounded-xl text-muted font-bold hover:bg-subtle transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualSubmit}
                  disabled={!manualOrder.trim() || isChecking}
                  className="py-3 px-4 bg-accent text-white rounded-xl font-black uppercase tracking-widest hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
                >
                  {isChecking ? 'Checking...' : 'Start'}
                  {!isChecking && <ArrowRightLeft size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
