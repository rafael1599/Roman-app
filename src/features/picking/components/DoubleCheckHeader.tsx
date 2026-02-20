import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useDoubleCheckList, PickingList } from '../../../hooks/useDoubleCheckList';
import { useViewMode } from '../../../context/ViewModeContext';
import ClipboardCheck from 'lucide-react/dist/esm/icons/clipboard-check';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import X from 'lucide-react/dist/esm/icons/x';
import Clock from 'lucide-react/dist/esm/icons/clock';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import { usePickingSession } from '../../../context/PickingContext';
import { useConfirmation } from '../../../context/ConfirmationContext';
import toast from 'react-hot-toast';

export const DoubleCheckHeader = () => {
    const { orders, completedOrders, readyCount, correctionCount, refresh } = useDoubleCheckList();
    const navigate = useNavigate();
    const { setExternalDoubleCheckId, setExternalOrderId, setViewMode } = useViewMode();
    const { cartItems, sessionMode, deleteList } = usePickingSession();
    const { showConfirmation } = useConfirmation();
    const [isOpen, setIsOpen] = useState(false);

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
        <div className="relative">
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
                <span className="text-xs font-black uppercase tracking-widest hidden sm:block">Verification</span>
                <ChevronDown
                    size={14}
                    className={`transition-transform duration-300 hidden sm:block ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && createPortal(
                <div
                    className="fixed inset-0 z-[100010] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => setIsOpen(false)}
                >
                    <div
                        className="bg-surface border border-subtle rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-4 border-b border-subtle bg-main/50 flex items-center justify-between">
                            <h3 className="text-xl font-black text-content uppercase tracking-tight">
                                Verification Queue
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="p-2 -mr-2 text-muted hover:text-content transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 pb-6">
                            {/* Needs Correction Section */}
                            {correctionCount > 0 && (
                                <div className="p-4">
                                    <p className="px-2 py-1 text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">
                                        Action Required
                                    </p>
                                    <div className="space-y-1">
                                        {orders
                                            .filter((o) => o.status === 'needs_correction')
                                            .map((order) => (
                                                <div
                                                    key={order.id}
                                                    className="flex items-center gap-1 pr-2 rounded-2xl hover:bg-amber-500/5 transition-colors group border border-amber-500/10"
                                                >
                                                    <button
                                                        onClick={() => handleOrderSelect(order)}
                                                        className="flex-1 flex items-center justify-between p-4 text-left"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                                                                <AlertCircle size={20} />
                                                            </div>
                                                            <div>
                                                                <div className={`text-sm font-black uppercase tracking-tight ${order.order_number?.startsWith('-') ? 'text-red-500' : 'text-content'}`}>
                                                                    {order.source === 'pdf_import' && <span title="PDF Import" className="mr-1">📥</span>}
                                                                    #{order.order_number || order.id.toString().slice(-6).toUpperCase()}
                                                                    {order.is_addon && <span className="ml-2 text-[8px] bg-amber-500 text-white px-1 rounded">ADD-ON</span>}
                                                                </div>
                                                                <div className="text-[10px] text-muted font-bold uppercase tracking-wider">
                                                                    {order.profiles?.full_name}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <ChevronDown
                                                            size={18}
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
                                                        className="p-3 text-muted hover:text-red-500 transition-colors"
                                                        title="Delete Order"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* Ready for Double Check Section */}
                            <div className="p-4">
                                <p className="px-2 py-1 text-[10px] font-black text-accent uppercase tracking-widest mb-2">
                                    Ready to Verify
                                </p>
                                <div className="space-y-1">
                                    {orders
                                        .filter(
                                            (o) => o.status === 'ready_to_double_check' || o.status === 'double_checking'
                                        )
                                        .map((order) => (
                                            <div
                                                key={order.id}
                                                className={`flex items-center gap-1 pr-2 rounded-2xl hover:bg-accent/5 transition-colors group border ${order.status === 'double_checking' ? 'border-orange-500/10' : 'border-accent/10'}`}
                                            >
                                                <button
                                                    onClick={() => handleOrderSelect(order)}
                                                    className={`flex-1 flex items-center justify-between p-4 text-left ${order.status === 'double_checking' ? 'opacity-60' : ''}`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div
                                                            className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${order.status === 'double_checking'
                                                                ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                                                                : 'bg-accent/10 text-accent border-accent/20'
                                                                }`}
                                                        >
                                                            {order.status === 'double_checking' ? (
                                                                <Clock size={20} />
                                                            ) : (
                                                                <CheckCircle2 size={20} />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className={`text-sm font-black uppercase tracking-tight ${order.order_number?.startsWith('-') ? 'text-red-500' : 'text-content'}`}>
                                                                {order.source === 'pdf_import' && <span title="PDF Import" className="mr-1">📥</span>}
                                                                #{order.order_number || order.id.toString().slice(-6).toUpperCase()}
                                                                {order.is_addon && (
                                                                    <span className="ml-2 text-[8px] bg-amber-500 text-white px-1.5 py-0.5 rounded-md border border-amber-600/20 shadow-sm animate-pulse">
                                                                        ADD-ON
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-muted font-bold uppercase tracking-wider">
                                                                {order.status === 'double_checking'
                                                                    ? `Being checked by ${order.checker_profile?.full_name?.split(' ')[0]}`
                                                                    : order.profiles?.full_name}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <ChevronDown
                                                        size={18}
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
                                                    className="p-3 text-muted hover:text-red-500 transition-colors"
                                                    title="Delete Order"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        ))}
                                    {readyCount === 0 &&
                                        orders.filter((o) => o.status === 'double_checking').length === 0 && (
                                            <div className="p-12 text-center">
                                                <CheckCircle2 size={40} className="mx-auto mb-4 text-muted opacity-20" />
                                                <p className="text-xs text-muted font-bold uppercase tracking-widest italic">
                                                    No orders waiting
                                                </p>
                                            </div>
                                        )}
                                </div>
                            </div>

                            {/* Recently Completed Section */}
                            {completedOrders.length > 0 && (
                                <div className="p-4 border-t border-subtle/50 bg-subtle/5">
                                    <p className="px-2 py-1 text-[10px] font-black text-muted uppercase tracking-widest mb-2">
                                        Recently Completed
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {completedOrders.map((order) => (
                                            <button
                                                key={order.id}
                                                onClick={() => {
                                                    setExternalOrderId(order.id);
                                                    navigate('/orders');
                                                    setIsOpen(false);
                                                }}
                                                className="flex items-center gap-2 p-2 rounded-xl bg-card border border-subtle hover:border-accent/20 transition-all text-left"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-main flex items-center justify-center text-muted shrink-0">
                                                    <CheckCircle2 size={14} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[10px] font-black text-content uppercase tracking-tight truncate">
                                                        #{order.order_number || order.id.toString().slice(-6).toUpperCase()}
                                                    </div>
                                                    <div className="text-[8px] text-muted font-bold uppercase tracking-tighter truncate">
                                                        {order.customer?.name || 'Customer'}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
