import React, { useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import { PickingSessionView } from './PickingSessionView';
import { DoubleCheckView } from './DoubleCheckView';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabaseClient';
import toast from 'react-hot-toast';

export const PickingCartDrawer = ({
    cartItems,
    activeListId,
    orderNumber,
    sessionMode,
    checkedBy,
    correctionNotes,
    externalDoubleCheckId,
    onClearExternalTrigger,
    onLoadExternalList,
    onLockForCheck,
    onReleaseCheck,
    onReturnToPicker,
    onRevertToPicking,
    onMarkAsReady,
    ownerId,
    onUpdateOrderNumber,
    onUpdateQty,
    onRemoveItem,
    onSetQty,
    onDeduct
}) => {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [currentView, setCurrentView] = useState('picking');
    const [checkedItems, setCheckedItems] = useState(new Set());
    const isOwner = user?.id === ownerId;

    const totalItems = cartItems.length;
    const totalQty = cartItems.reduce((acc, item) => acc + (item.pickingQty || 0), 0);

    // 0. Restore state on load if already in double-check session
    useEffect(() => {
        if (sessionMode === 'double_checking' && activeListId) {
            setCurrentView('double-check');
            const savedProgress = localStorage.getItem(`double_check_progress_${activeListId}`);
            if (savedProgress) {
                try {
                    setCheckedItems(new Set(JSON.parse(savedProgress)));
                } catch (e) { }
            }
        }
    }, [sessionMode, activeListId]);

    // 1. Handle External Trigger (from Header)
    useEffect(() => {
        if (externalDoubleCheckId) {
            const startDoubleCheck = async () => {
                const list = await onLoadExternalList(externalDoubleCheckId);
                if (list) {
                    // Check for takeover
                    if (list.checked_by && list.checked_by !== user.id) {
                        const confirm = window.confirm(`This order is currently being checked by another user. Do you want to take over?`);
                        if (!confirm) {
                            onClearExternalTrigger();
                            return;
                        }
                    }

                    // Lock it for us
                    await onLockForCheck(externalDoubleCheckId);

                    // Load local progress for this specific list
                    const savedProgress = localStorage.getItem(`double_check_progress_${externalDoubleCheckId}`);
                    if (savedProgress) {
                        try {
                            setCheckedItems(new Set(JSON.parse(savedProgress)));
                        } catch (e) {
                            setCheckedItems(new Set());
                        }
                    } else {
                        setCheckedItems(new Set());
                    }

                    setCurrentView('double-check');
                    setIsOpen(true);
                    onClearExternalTrigger();
                }
            };
            startDoubleCheck();
        }
    }, [externalDoubleCheckId, user.id, onLoadExternalList, onLockForCheck, onClearExternalTrigger]);

    // 2. Real-time Takeover Protection (Kick-out)
    useEffect(() => {
        if (!activeListId || sessionMode !== 'double_checking') return;

        const channel = supabase
            .channel(`list_monitor_${activeListId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'picking_lists',
                filter: `id=eq.${activeListId}`
            }, (payload) => {
                const newCheckedBy = payload.new.checked_by;
                if (newCheckedBy && newCheckedBy !== user.id) {
                    toast.error('This order has been taken over by another user.', {
                        icon: '⚠️',
                        duration: 5000
                    });
                    setIsOpen(false);
                    setCurrentView('picking');
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeListId, user.id, sessionMode]);

    // 3. Persist local progress for double check
    useEffect(() => {
        if (sessionMode === 'double_checking' && activeListId && checkedItems.size >= 0) {
            localStorage.setItem(`double_check_progress_${activeListId}`, JSON.stringify(Array.from(checkedItems)));
        }
    }, [checkedItems, activeListId, sessionMode]);

    // Reset when cart becomes empty (for picker)
    useEffect(() => {
        if (totalItems === 0 && sessionMode === 'picking') {
            setIsOpen(false);
            setCurrentView('picking');
            setCheckedItems(new Set());
        }
    }, [totalItems, sessionMode]);

    const handleMarkAsReady = async (finalOrderNumber) => {
        const listId = await onMarkAsReady(cartItems, finalOrderNumber);
        if (listId) {
            setCheckedItems(new Set()); // Reset progress for new verification
            setCurrentView('double-check');
        }
    };

    const toggleCheck = (item, palletId) => {
        const key = `${palletId}-${item.SKU}-${item.Location}`;
        setCheckedItems(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    if (totalItems === 0 && sessionMode === 'picking') return null;

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
                    onClick={() => setIsOpen(false)}
                />
            )}
            <div className={`fixed left-0 right-0 z-[60] transition-all duration-300 ease-in-out ${isOpen ? 'bottom-0' : 'bottom-20'
                }`}>
                {/* Collapsed State - Mini Bar */}
                {!isOpen && (
                    <div
                        onClick={() => setIsOpen(true)}
                        className={`mx-4 p-3 rounded-t-2xl shadow-2xl flex items-center justify-center gap-2 cursor-pointer active:opacity-90 transition-colors ${sessionMode === 'double_checking' ? 'bg-orange-500 text-white' : 'bg-accent text-main'
                            }`}
                    >
                        <ChevronUp size={20} />
                        <div className="font-bold uppercase tracking-tight text-sm">
                            {sessionMode === 'double_checking' ? `Verifying Order #${orderNumber || activeListId?.slice(-6).toUpperCase()}` : `${totalQty} Units to Pick`}
                        </div>
                    </div>
                )}

                {/* Expanded Content */}
                {isOpen && (
                    <div className="bg-card border-t border-subtle h-[90vh] flex flex-col shadow-2xl rounded-t-2xl overflow-hidden">
                        {currentView === 'picking' ? (
                            <PickingSessionView
                                activeListId={activeListId}
                                orderNumber={orderNumber}
                                onUpdateOrderNumber={onUpdateOrderNumber}
                                cartItems={cartItems}
                                correctionNotes={correctionNotes}
                                onGoToDoubleCheck={handleMarkAsReady}
                                onUpdateQty={onUpdateQty}
                                onRemoveItem={onRemoveItem}
                                onClose={() => setIsOpen(false)}
                            />
                        ) : (
                            <DoubleCheckView
                                cartItems={cartItems}
                                orderNumber={orderNumber}
                                activeListId={activeListId}
                                checkedItems={checkedItems}
                                onToggleCheck={toggleCheck}
                                onDeduct={async (items) => {
                                    const success = await onDeduct(items);
                                    if (success) {
                                        localStorage.removeItem(`double_check_progress_${activeListId}`);
                                        setIsOpen(false);
                                    }
                                    return success;
                                }}
                                onReturnToPicker={(notes) => onReturnToPicker(activeListId, notes)}
                                isOwner={isOwner}
                                onBack={async () => {
                                    if (isOwner) {
                                        await onRevertToPicking();
                                        setCurrentView('picking');
                                    }
                                }}
                                onRelease={() => {
                                    onReleaseCheck(activeListId);
                                    setIsOpen(false);
                                }}
                                onClose={() => {
                                    if (sessionMode === 'double_checking') onReleaseCheck(activeListId);
                                    setIsOpen(false);
                                }}
                            />
                        )}
                    </div>
                )}
            </div>
        </>
    );
};
