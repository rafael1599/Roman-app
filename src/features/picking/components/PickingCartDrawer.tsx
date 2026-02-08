import React, { useState, useEffect } from 'react';
import ChevronUp from 'lucide-react/dist/esm/icons/chevron-up';
import { PickingSessionView } from './PickingSessionView';
import { DoubleCheckView, PickingItem } from './DoubleCheckView';
import { useAuth } from '../../../context/AuthContext';
import { useConfirmation } from '../../../context/ConfirmationContext';

interface Note {
    id: string | number;
    user_display_name?: string;
    created_at: string;
    message: string;
}

// Define the full set of props expected by PickingCartDrawer
interface PickingCartDrawerProps {
    cartItems: PickingItem[];
    activeListId?: string | null;
    customer?: import('../../../types/schema').Customer | null;
    sessionMode?: string; // e.g. 'picking', 'building', 'double_checking'
    checkedBy?: string | null;
    correctionNotes?: string | null;
    externalDoubleCheckId?: string | number | null;
    onClearExternalTrigger: () => void;
    onLoadExternalList: (listId: string) => Promise<any>; // list object
    onLockForCheck: (listId: string) => Promise<void>;
    onReleaseCheck: (listId: string) => void;
    onReturnToPicker: (listId: string, notes: string) => void;
    onRevertToPicking?: () => void;
    onMarkAsReady: (items: PickingItem[], orderNo?: string) => Promise<string | null>;
    ownerId?: string | null;
    onUpdateOrderNumber: (newOrder: string | null) => void;
    onUpdateCustomer?: (details: Partial<import('../../../types/schema').Customer>) => void;
    onUpdateQty: (item: PickingItem, delta: number) => void;
    onRemoveItem: (item: PickingItem) => void;
    onSetQty?: (item: PickingItem, qty: number) => void;
    onDeduct: (items: PickingItem[], verified: boolean) => Promise<boolean>;
    notes?: Note[];
    isNotesLoading?: boolean;
    onAddNote: (note: string) => Promise<void> | void;
    onResetSession?: () => void;
    onReturnToBuilding: (listId?: string | null) => Promise<void>;
    onDelete?: (id: string | null, keepLocalState?: boolean) => void;
    [key: string]: any;
}

export const PickingCartDrawer: React.FC<PickingCartDrawerProps> = ({
    cartItems,
    activeListId,
    orderNumber,
    customer,
    sessionMode,
    correctionNotes,
    externalDoubleCheckId,
    onClearExternalTrigger,
    onLoadExternalList,
    onLockForCheck,
    onReleaseCheck,
    onReturnToPicker,
    onMarkAsReady,
    ownerId,
    onUpdateOrderNumber,
    onUpdateCustomer,
    onUpdateQty,
    onRemoveItem,
    onDeduct,
    notes,
    isNotesLoading,
    onAddNote,
    onReturnToBuilding,
    onDelete,
    ...restProps
}) => {
    const { user } = useAuth();
    const { showConfirmation } = useConfirmation();
    const [isOpen, setIsOpen] = useState(false);
    const [currentView, setCurrentView] = useState('double-check');
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
    const isOwner = user?.id === ownerId;
    const isConfirmingRef = React.useRef(false);

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
        } else if (sessionMode === 'building') {
            setCurrentView('double-check'); // Was 'picking'
            // However, OrderBuilder is handled inside PickingSessionView structure if currentView was 'picking'. 
            // BUT wait, PickingSessionView handled 'building' internally. 
            // If we bypass PickingSessionView, we lose the OrderBuilder view!

            // Correction: We must KEEP PickingSessionView active IF sessionMode is 'building'.
            // ONLY if sessionMode is 'picking', we want to show DoubleCheckView.
            setCurrentView('picking'); // Keep as picking to allow OrderBuilder to render if needed, OR adjust logic below.
            setCheckedItems(new Set());
        } else if (sessionMode === 'picking') {
            // THIS IS THE KEY CHANGE: 
            // If we are in 'picking' mode (which is active picking), show DoubleCheckView instead of PickingSessionView.
            setCurrentView('double-check');
        }
    }, [sessionMode, activeListId]);

    // 1. Handle External Trigger (from Header)
    useEffect(() => {
        if (externalDoubleCheckId) {
            const startDoubleCheck = async () => {
                const list = await onLoadExternalList(String(externalDoubleCheckId));
                if (list && user) {
                    // Check for takeover
                    if (list.checked_by && list.checked_by !== user.id) {
                        // Prevent double confirmation
                        if (isConfirmingRef.current) return;
                        isConfirmingRef.current = true;

                        showConfirmation(
                            'Takeover Order',
                            `This order is currently being checked by another user. Do you want to take over?`,
                            async () => {
                                // Lock it for us
                                await onLockForCheck(String(externalDoubleCheckId));

                                // Load local progress for this specific list
                                const savedProgress = localStorage.getItem(
                                    `double_check_progress_${externalDoubleCheckId}`
                                );
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
                                isConfirmingRef.current = false;
                            },
                            () => {
                                onClearExternalTrigger();
                                isConfirmingRef.current = false;
                            },
                            'Takeover',
                            'Cancel'
                        );
                        return; // Wait for confirmation
                    }

                    // Lock it for us
                    await onLockForCheck(String(externalDoubleCheckId));

                    // Load local progress for this specific list
                    const savedProgress = localStorage.getItem(
                        `double_check_progress_${externalDoubleCheckId}`
                    );
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
    }, [externalDoubleCheckId, user, onLoadExternalList, onLockForCheck, onClearExternalTrigger, showConfirmation]);

    // 3. Persist local progress for double check
    useEffect(() => {
        if (sessionMode === 'double_checking' && activeListId && checkedItems.size >= 0) {
            localStorage.setItem(
                `double_check_progress_${activeListId}`,
                JSON.stringify(Array.from(checkedItems))
            );
        }
    }, [checkedItems, activeListId, sessionMode]);

    // Reset when cart becomes empty (for picker)
    useEffect(() => {
        if (totalItems === 0 && sessionMode === 'building') {
            setIsOpen(false);
            setCurrentView('picking'); // Go to PickingSessionView which handles Building Mode
            setCheckedItems(new Set());
        } else if (totalItems === 0 && sessionMode === 'picking') {
            setIsOpen(false);
            setCurrentView('double-check');
            setCheckedItems(new Set());
        }
    }, [totalItems, sessionMode]);

    const handleMarkAsReady = async (finalOrderNumber: string) => {
        const listId = await onMarkAsReady(cartItems, finalOrderNumber);
        if (listId) {
            setCheckedItems(new Set()); // Reset progress for new verification
            setCurrentView('double-check');
        }
    };

    const toggleCheck = (item: PickingItem, palletId: number | string) => {
        const key = `${palletId}-${item.sku}-${item.location}`;
        setCheckedItems((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    // Drag Logic
    const [dragY, setDragY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startYRef = React.useRef(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        // Only allow dragging from header handle
        const target = e.target as HTMLElement;
        if (!target.closest('[data-drag-handle="true"]')) return;

        startYRef.current = e.touches[0].clientY;
        // currentYRef.current = e.touches[0].clientY;
        setIsDragging(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        const y = e.touches[0].clientY;
        const delta = y - startYRef.current;

        // Only allow dragging down
        if (delta > 0) {
            setDragY(delta);
            // Prevent scrolling background if needed
            if (e.cancelable) e.preventDefault();
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging) return;
        setIsDragging(false);

        if (dragY > 150) {
            // Threshold to close
            setIsOpen(false);
        }
        setDragY(0);
    };

    // If we have items OR we have an active session (even if empty), showing the bar is important
    // so the user knows they are 'in' an order.
    // However, if there are 0 items and NO active session, hide it.
    if (
        totalItems === 0 &&
        !activeListId &&
        (sessionMode === 'picking' || sessionMode === 'building')
    )
        return null;

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
                    onClick={() => setIsOpen(false)}
                    style={{ opacity: 1 - dragY / 600 }} // Fade out backdrop on drag
                />
            )}
            <div
                className={`fixed left-0 right-0 z-[60] transition-all duration-300 ease-in-out ${isOpen ? 'bottom-0' : 'bottom-20'}`}
                style={
                    isOpen
                        ? {
                            transform: `translateY(${dragY}px)`,
                            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                        }
                        : undefined
                }
            >
                {/* Collapsed State - Mini Bar */}
                {!isOpen && (
                    <div
                        onClick={() => setIsOpen(true)}
                        className={`mx-4 p-3 rounded-t-2xl shadow-2xl flex items-center justify-center gap-2 cursor-pointer active:opacity-90 transition-colors ${sessionMode === 'double_checking'
                            ? 'bg-orange-500 text-white'
                            : sessionMode === 'building'
                                ? 'bg-slate-800 text-white'
                                : 'bg-accent text-main'
                            }`}
                    >
                        <ChevronUp size={20} />
                        <div className="font-bold uppercase tracking-tight text-sm">
                            {sessionMode === 'double_checking'
                                ? `Verifying Order #${orderNumber || activeListId?.slice(-6).toUpperCase()}`
                                : sessionMode === 'building'
                                    ? `Review Order • ${totalItems} SKUs • ${totalQty} Units`
                                    : `${totalQty} Units to Pick`}
                        </div>
                    </div>
                )}

                {/* Expanded Content */}
                {isOpen && (
                    <div
                        className="bg-card border-t border-subtle h-[90vh] flex flex-col shadow-2xl rounded-t-2xl overflow-hidden"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        {currentView === 'picking' ? (
                            <PickingSessionView
                                activeListId={activeListId ?? null}
                                orderNumber={orderNumber ?? null}
                                customer={customer ?? null}
                                onUpdateOrderNumber={onUpdateOrderNumber}
                                onUpdateCustomer={onUpdateCustomer}
                                cartItems={cartItems as any}
                                correctionNotes={correctionNotes}
                                notes={notes as any}
                                isNotesLoading={isNotesLoading}
                                onGoToDoubleCheck={handleMarkAsReady as any}
                                onUpdateQty={onUpdateQty}
                                onRemoveItem={onRemoveItem}
                                onClose={() => setIsOpen(false)}
                                onDelete={onDelete || restProps.onDelete}
                            />
                        ) : (
                            <DoubleCheckView
                                customer={customer ?? null}
                                cartItems={cartItems as any}
                                orderNumber={orderNumber ?? null}
                                activeListId={activeListId ?? null}
                                checkedItems={checkedItems}
                                onToggleCheck={toggleCheck}
                                onDeduct={async (items, isVerified) => {
                                    const success = await onDeduct(items, isVerified);
                                    if (success && activeListId) {
                                        localStorage.removeItem(`double_check_progress_${activeListId}`);
                                        setIsOpen(false);
                                    }
                                    return success;
                                }}
                                onReturnToPicker={(notes) => activeListId && onReturnToPicker(activeListId, notes)}
                                isOwner={isOwner}
                                notes={notes}
                                isNotesLoading={isNotesLoading}
                                onAddNote={onAddNote}
                                onBack={async () => {
                                    await onReturnToBuilding(activeListId ?? null);
                                }}
                                onRelease={() => {
                                    if (activeListId) {
                                        onReleaseCheck(activeListId);
                                        setIsOpen(false);
                                    }
                                }}
                                onClose={() => {
                                    if (sessionMode === 'double_checking' && activeListId) onReleaseCheck(activeListId);
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
