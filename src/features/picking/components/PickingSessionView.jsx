import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  Package,
  Warehouse,
  MapPin,
  Printer,
  Minus,
  Plus,
  Trash2,
  ChevronDown,
  Check,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { getOptimizedPickingPath, calculatePallets } from '../../../utils/pickingLogic';
import { generatePickingPdf } from '../../../utils/pickingPdf';
import { useLocationManagement } from '../../../hooks/useLocationManagement';
import { SlideToConfirm } from '../../../components/ui/SlideToConfirm';
import { useError } from '../../../context/ErrorContext';
import { useConfirmation } from '../../../context/ConfirmationContext';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { CorrectionNotesTimeline } from './CorrectionNotesTimeline';
import { OrderBuilderMode } from './OrderBuilderMode';
import { usePickingSession } from '../../../context/PickingContext';
import toast from 'react-hot-toast';

export const PickingSessionView = ({
  cartItems,
  activeListId,
  orderNumber,
  correctionNotes,
  notes = [],
  isNotesLoading = false,
  onUpdateOrderNumber,
  onGoToDoubleCheck,
  onUpdateQty,
  onRemoveItem,
  onClose,
  onDelete,
}) => {
  const { locations } = useLocationManagement();
  const { showError } = useError();
  const { showConfirmation } = useConfirmation();
  const { user } = useAuth();

  // NEW: Get Picking Session Control
  const { sessionMode, generatePickingPath, returnToBuilding } = usePickingSession();

  // ALL HOOKS MUST BE AT THE TOP - before any conditional returns
  const [isDeducting, setIsDeducting] = useState(false);
  const [editingItemKey, setEditingItemKey] = useState(null);
  const [editingQuantity, setEditingQuantity] = useState('');
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [isValidatingOrder, setIsValidatingOrder] = useState(false);
  const [tempOrder, setTempOrder] = useState(orderNumber || '');
  const inputRef = useRef(null);
  const orderInputRef = useRef(null);

  const optimizedItems = useMemo(() => {
    return getOptimizedPickingPath(cartItems, locations);
  }, [cartItems, locations]);

  // 2. Calculate Pallets
  const pallets = useMemo(() => {
    return calculatePallets(optimizedItems);
  }, [optimizedItems]);

  const totalUnits = cartItems.reduce((acc, item) => acc + (item.pickingQty || 0), 0);

  // Effect to focus input when editing starts
  useEffect(() => {
    if (editingItemKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingItemKey]);

  useEffect(() => {
    if (isEditingOrder && orderInputRef.current) {
      orderInputRef.current.focus();
      orderInputRef.current.select();
    }
  }, [isEditingOrder]);

  // Sync tempOrder when orderNumber prop changes (e.g. from database sync)
  useEffect(() => {
    if (!isEditingOrder) {
      setTempOrder(orderNumber || '');
    }
  }, [orderNumber, isEditingOrder]);

  const getItemKey = (palletId, item) => `${palletId}-${item.SKU}-${item.Location}`;

  const handleQuantityClick = (palletId, item) => {
    const key = getItemKey(palletId, item);
    setEditingItemKey(key);
    setEditingQuantity(item.pickingQty?.toString() || '0');
  };

  const handleQuantitySubmit = (item) => {
    const newQty = parseInt(editingQuantity, 10);
    const maxStock = parseInt(item.Quantity, 10) || 0;

    if (isNaN(newQty) || newQty < 0) {
      showError('Invalid Quantity', 'Please enter a non-negative number.');
      setEditingQuantity(item.pickingQty?.toString() || '0');
    } else if (newQty > maxStock) {
      showError('Quantity Exceeded', `Cannot exceed stock of ${maxStock}.`);
      onUpdateQty(item, maxStock - (item.pickingQty || 0));
    } else if (newQty === 0) {
      onRemoveItem(item);
    } else {
      const delta = newQty - (item.pickingQty || 0);
      onUpdateQty(item, delta);
    }
    setEditingItemKey(null);
  };

  const handleQuantityKeyDown = (e, item) => {
    if (e.key === 'Enter') {
      handleQuantitySubmit(item);
    } else if (e.key === 'Escape') {
      setEditingItemKey(null);
      setEditingQuantity(item.pickingQty?.toString() || '0');
    }
  };

  const handleOrderClick = () => {
    setTempOrder(orderNumber || activeListId?.slice(-6).toUpperCase() || '');
    setIsEditingOrder(true);
  };

  // Check if order number is already in use by another user
  const checkOrderAvailability = useCallback(
    async (orderNum) => {
      if (!orderNum || orderNum.trim() === '' || !user) return true;

      setIsValidatingOrder(true);
      try {
        const { data, error } = await supabase
          .from('picking_lists')
          .select('id, user_id, profiles!user_id(full_name)')
          .eq('order_number', orderNum.trim())
          .in('status', ['active', 'needs_correction', 'ready_to_double_check', 'double_checking'])
          .neq('user_id', user.id) // Excluir nuestras propias sesiones
          .maybeSingle();

        if (error) throw error;

        if (data) {
          // Another session is active with this order number
          const ownerName = data.profiles?.full_name || 'Another user';

          const confirmed = await new Promise((resolve) => {
            showConfirmation(
              'Order In Use',
              `${ownerName} is currently working on order #${orderNum}. Do you want to take over ? This will reset their session.`,
              () => resolve(true),
              () => resolve(false),
              'Take Over',
              'Cancel'
            );
          });

          if (confirmed) {
            // Transfer session: update user_id to current user
            await supabase.from('picking_lists').update({ user_id: user.id }).eq('id', data.id);

            toast.success('You took control of the order');
            return true;
          }

          return false; // User cancelled
        }

        return true; // No hay conflicto
      } catch (err) {
        console.error('Error checking order:', err);
        showError('Error', 'Could not verify order availability');
        return false;
      } finally {
        setIsValidatingOrder(false);
      }
    },
    [user, showConfirmation, showError]
  );

  const handleOrderSubmit = async () => {
    if (!tempOrder.trim()) {
      setIsEditingOrder(false);
      return;
    }

    // Prevent double submission
    if (isValidatingOrder) return;

    // Validate availability before updating
    const isAvailable = await checkOrderAvailability(tempOrder.trim());
    if (!isAvailable) {
      // User cancelled or error occurred
      setTempOrder(orderNumber || ''); // Restore previous value
      setIsEditingOrder(false);
      return;
    }

    // Proceed with update
    onUpdateOrderNumber(tempOrder.trim());
    setIsEditingOrder(false);
  };

  const handleOrderKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleOrderSubmit();
    } else if (e.key === 'Escape') {
      setIsEditingOrder(false);
    }
  };

  const finalSequence = useMemo(() => {
    const sequence = [];
    cartItems.forEach((cartItem) => {
      // Find all instances of this item across all pallets (in case it was split)
      pallets.forEach((p) => {
        const palletItem = p.items.find(
          (pi) => pi.SKU === cartItem.SKU && pi.Location === cartItem.Location
        );
        if (palletItem) {
          const key = getItemKey(p.id, palletItem);
          sequence.push({
            ...palletItem,
            key,
            palletId: p.id,
            isPicked: false, // Redundant in Review Picking list
          });
        }
      });
    });
    return sequence;
  }, [cartItems, pallets]);

  const handleConfirm = () => {
    // Use the very latest tempOrder value as the source of truth
    onGoToDoubleCheck(tempOrder.trim());
  };

  // Early return for Building Mode - AFTER all hooks are declared
  if (sessionMode === 'building') {
    return (
      <React.Fragment>
        {/* Header for Order Builder */}
        <div
          data-drag-handle="true"
          className="bg-surface px-4 py-3 border-b border-subtle flex items-center justify-between sticky top-0 z-50 touch-none"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
              <span className="text-white font-black text-lg">#</span>
            </div>
            <div>
              <h2 className="text-lg font-black text-content leading-none">
                {orderNumber || 'NEW ORDER'}
              </h2>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">
                BUILDING ORDER
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-card hover:bg-accent/10 text-muted hover:text-accent transition-all border border-subtle"
              title="Minimize"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
            <button
              onClick={() => onDelete(activeListId)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-card hover:bg-red-500/10 text-muted hover:text-red-500 transition-all border border-subtle ml-1"
              title="Delete Draft"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <OrderBuilderMode cartItems={cartItems} onGeneratePath={generatePickingPath} />
        </div>
      </React.Fragment>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div
        data-drag-handle="true"
        className="px-4 py-2 border-b border-subtle flex items-center justify-between shrink-0 bg-surface/50 backdrop-blur-sm sticky top-0 z-10 touch-none"
      >
        <button
          onClick={() => returnToBuilding(activeListId)}
          className="p-2 hover:bg-surface rounded-lg text-muted transition-colors shrink-0 mr-1"
          title="Return to Building"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 mx-2">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-base font-black text-content uppercase tracking-tight">
              Review Picking
            </h2>
            {isEditingOrder ? (
              <div className="relative">
                <input
                  ref={orderInputRef}
                  type="text"
                  value={tempOrder}
                  onChange={(e) => setTempOrder(e.target.value)}
                  onBlur={handleOrderSubmit}
                  onKeyDown={handleOrderKeyDown}
                  className="text-[9px] font-mono bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20 w-20 focus:outline-none focus:border-accent"
                  placeholder="#"
                  disabled={isValidatingOrder}
                />
                {isValidatingOrder && (
                  <div className="absolute right-0 top-0 w-3 h-3">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-accent"></div>
                  </div>
                )}
              </div>
            ) : (
              <span
                onClick={handleOrderClick}
                className="text-[9px] font-mono bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20 cursor-pointer hover:bg-accent/20 transition-colors"
              >
                {orderNumber
                  ? `#${orderNumber} `
                  : activeListId
                    ? `#${activeListId.slice(-6).toUpperCase()} `
                    : 'SET ORDER #'}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted font-bold uppercase tracking-widest text-center">
            {pallets.length} Pallets • {totalUnits} Units
          </p>
        </div>
        <button
          onClick={() => {
            showConfirmation(
              'Cancel Order',
              'Are you sure you want to cancel this order? This action cannot be undone.',
              () => {
                if (onDelete) onDelete(activeListId);
                onClose();
              },
              null,
              'Yes, Cancel',
              'Keep Order'
            );
          }}
          className="p-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl hover:bg-red-500/20 transition-all shrink-0 mr-2"
          title="Cancel Order"
        >
          <Trash2 size={20} />
        </button>
        <button
          onClick={() => generatePickingPdf(finalSequence, orderNumber, pallets.length)}
          className="p-2 bg-surface border border-subtle text-content rounded-xl hover:border-accent transition-all shrink-0"
          title="Download PDF"
        >
          <Printer size={20} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Correction Notes Banner */}
        {(correctionNotes || notes.length > 0) && (
          <div className="mb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
            {/* Summary of last note if exists as legacy flag */}
            {correctionNotes && (
              <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                  <AlertCircle size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-amber-500/70 uppercase tracking-widest mb-1">
                    Latest Instruction
                  </p>
                  <p className="text-sm font-medium text-content italic leading-relaxed">
                    "{correctionNotes}"
                  </p>
                </div>
              </div>
            )}

            {/* Detailed Timeline */}
            {notes.length > 0 && (
              <div className="px-1 pt-2">
                <CorrectionNotesTimeline notes={notes} isLoading={isNotesLoading} />
              </div>
            )}
          </div>
        )}

        {pallets.map((pallet, pIdx) => (
          <section key={pallet.id} className="mb-4">
            <div className="flex items-center justify-between mb-3 sticky top-0 bg-card z-10 py-2">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-accent text-main flex items-center justify-center font-black text-sm shadow-lg shadow-accent/20">
                  {pallet.id}
                </span>
                <h3 className="text-sm font-black text-content uppercase tracking-wider">
                  Pallet {pallet.id}
                </h3>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-surface rounded-full overflow-hidden border border-subtle">
                    <div
                      className="h-full bg-accent transition-all duration-500"
                      style={{ width: `${(pallet.totalUnits / 12) * 100}% ` }}
                    />
                  </div>
                  <span className="font-mono font-bold text-xs text-accent">
                    {pallet.totalUnits}/12
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-1.5">
              {pallet.items.map((item) => {
                const maxStock = parseInt(item.Quantity, 10) || 0;
                const isAtMax = (item.pickingQty || 0) >= maxStock;

                return (
                  <div
                    key={`${pallet.id} -${item.SKU} -${item.Location} `}
                    className="bg-surface/50 border border-subtle rounded-xl p-2 hover:border-accent/30 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] text-muted font-bold uppercase tracking-widest">
                        {item.Warehouse}
                      </span>
                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-accent/10 border border-accent/20 rounded">
                        <MapPin size={10} className="text-accent" />
                        <span className="text-[10px] text-accent font-black uppercase">
                          {item.Location}
                        </span>
                      </div>
                    </div>

                    {/* SKU, Stock Info and Controls */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 bg-main rounded-lg flex items-center justify-center border border-subtle shrink-0">
                          <Package className="w-4 h-4 text-muted" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-content text-sm truncate">{item.SKU}</div>
                          <div className="text-[9px] text-muted font-bold uppercase tracking-tighter">
                            Stock: {maxStock}
                          </div>
                        </div>
                      </div>

                      {/* PICKING MODE: READ ONLY QUANTITY (Option B) */}
                      {sessionMode === 'picking' ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="px-3 py-1 bg-surface border border-subtle rounded-lg">
                            <span className="font-mono font-black text-accent text-lg">
                              {item.pickingQty}
                            </span>
                            <span className="text-[10px] text-muted font-bold uppercase ml-1">
                              UNITS
                            </span>
                          </div>
                          {/* No delete button allowed in picking mode */}
                        </div>
                      ) : (
                        /* BUILDING MODE: FULL CONTROLS */
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center bg-main rounded-lg p-0.5 gap-0.5 border border-subtle">
                            <button
                              onClick={() => onUpdateQty(item, -1)}
                              className="w-7 h-7 flex items-center justify-center text-muted hover:text-content rounded active:bg-surface transition-colors"
                            >
                              <Minus size={14} />
                            </button>
                            {editingItemKey === getItemKey(pallet.id, item) ? (
                              <input
                                ref={inputRef}
                                type="number"
                                value={editingQuantity}
                                onChange={(e) => setEditingQuantity(e.target.value)}
                                onBlur={() => handleQuantitySubmit(item)}
                                onKeyDown={(e) => handleQuantityKeyDown(e, item)}
                                className="w-10 text-center font-mono font-black text-accent text-base bg-transparent border-none focus:outline-none"
                                min="0"
                                max={maxStock.toString()}
                              />
                            ) : (
                              <div
                                onClick={() => handleQuantityClick(pallet.id, item)}
                                className="w-10 text-center font-mono font-black text-accent text-base cursor-pointer hover:bg-surface/50 rounded transition-colors"
                              >
                                {item.pickingQty}
                              </div>
                            )}
                            <button
                              onClick={() => onUpdateQty(item, 1)}
                              disabled={isAtMax}
                              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${isAtMax
                                  ? 'text-subtle cursor-not-allowed'
                                  : 'text-muted hover:text-content active:bg-surface'
                                } `}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <button
                            onClick={() => onRemoveItem(item)}
                            className="p-2 text-muted hover:text-red-500 transition-colors"
                            title="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {pIdx < pallets.length - 1 && (
              <div className="flex justify-center py-4 opacity-20">
                <div className="w-px h-8 bg-gradient-to-b from-accent to-transparent" />
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Footer */}
      <div className="px-12 py-2 pb-20 border-t border-subtle bg-surface/30 backdrop-blur-xl shrink-0">
        <SlideToConfirm
          onConfirm={handleConfirm}
          isLoading={isDeducting}
          text="READY TO DOUBLE CHECK"
          confirmedText="PREPARING..."
        />
      </div>
    </div>
  );
};
