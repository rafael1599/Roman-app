import { useState, useRef, useEffect } from 'react';
import { useDoubleCheckList, PickingList } from '../../../hooks/useDoubleCheckList';
import { useViewMode } from '../../../context/ViewModeContext';
import ClipboardCheck from 'lucide-react/dist/esm/icons/clipboard-check';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Clock from 'lucide-react/dist/esm/icons/clock';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import { usePickingSession } from '../../../context/PickingContext';
import { useConfirmation } from '../../../context/ConfirmationContext';
import toast from 'react-hot-toast';

export const DoubleCheckHeader = () => {
    const { orders, readyCount, correctionCount, refresh } = useDoubleCheckList();
    const { setExternalDoubleCheckId, setViewMode } = useViewMode();
    const { cartItems, sessionMode, deleteList } = usePickingSession();
    const { showConfirmation } = useConfirmation();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const totalActions = readyCount + correctionCount;

    const handleOrderSelect = (order: PickingList) => {
        if (cartItems.length > 0 && sessionMode === 'picking') {
            toast.error('Please finish or clear your active picking session first.', {
                icon: '🛒',
                duration: 4000,
            });
            return;
        }
        setExternalDoubleCheckId(order.id.toString());
        setViewMode('picking'); // Ensure we are in picking mode to see the drawer
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => {
                    const nextState = !isOpen;
                    setIsOpen(nextState);
                    if (nextState) refresh();
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all active:scale-95 relative ${totalActions > 0
                    ? 'bg-accent/10 text-accent border border-accent/30 shadow-lg shadow-accent/5'
                    : 'bg-surface border border-subtle text-muted opacity-60'
                    }`}
            >
                <div className="relative">
                    <ClipboardCheck size={18} className={totalActions > 0 ? 'text-accent' : ''} />
                    {totalActions > 0 && (
                        <span className="absolute -top-2.5 -right-2.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-card animate-bounce">
                            {totalActions}
                        </span>
                    )}
                </div>
                <span className="text-xs font-black uppercase tracking-widest">Verification</span>
                <ChevronDown
                    size={14}
                    className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-72 bg-card border border-subtle rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-4 border-b border-subtle bg-surface/50">
                        <h3 className="text-xs font-black text-content uppercase tracking-widest">
                            Verification Queue
                        </h3>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {/* Needs Correction Section */}
                        {correctionCount > 0 && (
                            <div className="p-2">
                                <p className="px-2 py-1 text-[9px] font-black text-amber-500/70 uppercase tracking-widest">
                                    Clarification
                                </p>
                                {orders
                                    .filter((o) => o.status === 'needs_correction')
                                    .map((order) => (
                                        <div
                                            key={order.id}
                                            className="flex items-center gap-1 pr-2 rounded-xl hover:bg-amber-500/5 transition-colors group"
                                        >
                                            <button
                                                onClick={() => handleOrderSelect(order)}
                                                className="flex-1 flex items-center justify-between p-3 text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                                                        <AlertCircle size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-content uppercase">
                                                            #{order.order_number || order.id.toString().slice(-6).toUpperCase()}
                                                        </div>
                                                        <div className="text-[9px] text-muted font-bold uppercase">
                                                            {order.profiles?.full_name}
                                                        </div>
                                                    </div>
                                                </div>
                                                <ChevronDown
                                                    size={14}
                                                    className="-rotate-90 text-subtle group-hover:text-amber-500 transition-colors"
                                                />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    showConfirmation(
                                                        'Delete Order',
                                                        'Are you sure you want to delete this order permanently? This action cannot be undone.',
                                                        () => deleteList(order.id.toString()),
                                                        () => { },
                                                        'Delete',
                                                        'Cancel'
                                                    );
                                                }}
                                                className="p-2 text-muted hover:text-red-500 transition-colors"
                                                title="Delete Order"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                            </div>
                        )}

                        {/* Ready for Double Check Section */}
                        <div className="p-2 border-t border-subtle">
                            <p className="px-2 py-1 text-[9px] font-black text-accent uppercase tracking-widest">
                                Ready to Verify
                            </p>
                            {orders
                                .filter(
                                    (o) => o.status === 'ready_to_double_check' || o.status === 'double_checking'
                                )
                                .map((order) => (
                                    <div
                                        key={order.id}
                                        className="flex items-center gap-1 pr-2 rounded-xl hover:bg-accent/5 transition-colors group"
                                    >
                                        <button
                                            onClick={() => handleOrderSelect(order)}
                                            className={`flex-1 flex items-center justify-between p-3 text-left ${order.status === 'double_checking' ? 'opacity-60' : ''}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${order.status === 'double_checking'
                                                        ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                                                        : 'bg-accent/10 text-accent border-accent/20'
                                                        }`}
                                                >
                                                    {order.status === 'double_checking' ? (
                                                        <Clock size={16} />
                                                    ) : (
                                                        <CheckCircle2 size={16} />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black text-content uppercase">
                                                        #{order.order_number || order.id.toString().slice(-6).toUpperCase()}
                                                    </div>
                                                    <div className="text-[9px] text-muted font-bold uppercase">
                                                        {order.status === 'double_checking'
                                                            ? `Being checked by ${order.checker_profile?.full_name?.split(' ')[0]}`
                                                            : order.profiles?.full_name}
                                                    </div>
                                                </div>
                                            </div>
                                            <ChevronDown
                                                size={14}
                                                className="-rotate-90 text-subtle group-hover:text-accent transition-colors"
                                            />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                showConfirmation(
                                                    'Delete Order',
                                                    'Are you sure you want to delete this order permanently? This action cannot be undone.',
                                                    () => deleteList(order.id.toString()),
                                                    () => { },
                                                    'Delete',
                                                    'Cancel'
                                                );
                                            }}
                                            className="p-2 text-muted hover:text-red-500 transition-colors"
                                            title="Delete Order"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            {readyCount === 0 &&
                                orders.filter((o) => o.status === 'double_checking').length === 0 && (
                                    <div className="p-4 text-center text-[10px] text-muted font-bold uppercase italic">
                                        No orders waiting
                                    </div>
                                )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
