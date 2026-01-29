import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Loader2, Package, Printer, ChevronRight, X, Save, Scale, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { PalletLabelsPrinter } from '../components/orders/PalletLabelsPrinter';

export const OrdersScreen = () => {
    const { user } = useAuth();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [timeFilter, setTimeFilter] = useState('ALL');
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    useEffect(() => {
        fetchOrders();
    }, [user, timeFilter]);

    const fetchOrders = async () => {
        if (!user) return;
        setLoading(true);
        try {
            let query = supabase
                .from('picking_lists')
                .select('*, customer:customers(name)')
                .order('created_at', { ascending: false });

            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            if (timeFilter === 'TODAY') {
                query = query.gte('created_at', startOfToday.toISOString());
            } else if (timeFilter === 'YESTERDAY') {
                const startOfYesterday = new Date(startOfToday);
                startOfYesterday.setDate(startOfYesterday.getDate() - 1);
                const endOfYesterday = new Date(startOfToday);
                endOfYesterday.setMilliseconds(-1);
                query = query.gte('created_at', startOfYesterday.toISOString())
                    .lte('created_at', endOfYesterday.toISOString());
            } else if (timeFilter === 'WEEK') {
                const lastWeek = new Date(startOfToday);
                lastWeek.setDate(lastWeek.getDate() - 7);
                query = query.gte('created_at', lastWeek.toISOString());
            }

            const { data, error } = await query;

            if (error) throw error;

            // Map the joined customer name to customer_name for UI compatibility
            const mappedData = (data || []).map((order: any) => ({
                ...order,
                customer_name: order.customer?.name || order.customer_name
            }));

            setOrders(mappedData);
        } catch (err: any) {
            console.error('Error fetching orders:', err);
            toast.error('Failed to load orders');
        } finally {
            setLoading(false);
        }
    };

    const filteredOrders = orders.filter(order => {
        const query = searchQuery.toLowerCase();
        const orderNum = String(order.order_number || '').toLowerCase();
        const customer = String(order.customer_name || '').toLowerCase();

        return (
            !searchQuery ||
            orderNum.includes(query) ||
            customer.includes(query)
        );
    });

    const handleUpdateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrder) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('picking_lists')
                .update({
                    customer_name: selectedOrder.customer_name,
                    pallets_qty: parseInt(selectedOrder.pallets_qty) || 1,
                    total_units: parseInt(selectedOrder.total_units) || 0
                })
                .eq('id', selectedOrder.id);

            if (error) throw error;
            toast.success('Order updated');
            fetchOrders();
        } catch (err) {
            toast.error('Failed to update order');
        } finally {
            setIsSaving(false);
        }
    };

    const handlePrint = () => {
        if (!selectedOrder) return;
        setShowPrintPreview(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6 max-w-lg mx-auto pb-24">
            <header>
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-black uppercase tracking-tight text-content italic">
                        My <span className="text-accent not-italic">Orders</span>
                    </h1>
                </div>
                <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-1">
                    Manage and print pallet labels
                </p>
            </header>

            {/* Search and Filters */}
            <div className="space-y-4">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" size={18} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by Order # or Customer..."
                        className="w-full bg-surface border border-subtle rounded-2xl py-3 pl-12 pr-4 text-sm text-content focus:outline-none focus:border-accent transition-all placeholder:text-muted/50"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                    {[
                        { id: 'TODAY', label: 'Today' },
                        { id: 'YESTERDAY', label: 'Yesterday' },
                        { id: 'WEEK', label: 'Week' },
                        { id: 'ALL', label: 'All' }
                    ].map((btn) => (
                        <button
                            key={btn.id}
                            onClick={() => setTimeFilter(btn.id)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${timeFilter === btn.id
                                ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20'
                                : 'bg-surface border-subtle text-muted hover:border-accent/40'
                                }`}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                {filteredOrders.length === 0 ? (
                    <div className="p-8 text-center bg-surface rounded-3xl border border-dashed border-subtle">
                        <Package className="w-12 h-12 text-muted mx-auto mb-3 opacity-20" />
                        <p className="text-sm text-muted font-medium">No orders found</p>
                    </div>
                ) : (
                    filteredOrders.map((order) => (
                        <div
                            key={order.id}
                            onClick={() => setSelectedOrder(order)}
                            className="p-4 bg-card border border-subtle rounded-2xl flex items-center justify-between group hover:border-accent/30 transition-all cursor-pointer active:scale-95"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-surface rounded-xl text-accent/60 group-hover:text-accent transition-colors">
                                    <Package size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-black text-content uppercase tracking-tight">
                                            {order.order_number || 'No Order #'}
                                        </p>
                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase ${order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                            {order.status}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest leading-tight">
                                        {new Date(order.created_at).toLocaleDateString()} • {order.customer_name || 'Generic Customer'}
                                    </p>
                                    <p className="text-[9px] text-accent font-black uppercase tracking-tighter mt-0.5">
                                        {order.pallets_qty || 1} Pallets • {order.total_units || 0} Units
                                    </p>
                                </div>
                            </div>
                            <ChevronRight size={18} className="text-muted/30 group-hover:text-accent transition-colors" />
                        </div>
                    ))
                )}
            </div>

            {/* Selection Modal */}
            {selectedOrder && (
                <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
                    <div className="relative w-full max-w-md bg-card border-t sm:border border-subtle rounded-t-[2.5rem] sm:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <div className="p-6">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-xl font-black uppercase tracking-tight text-content italic">
                                        Order <span className="text-accent not-italic">Detail</span>
                                    </h2>
                                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-1">
                                        Ref: {selectedOrder.order_number || selectedOrder.id.slice(0, 8)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setSelectedOrder(null)}
                                    className="p-2 hover:bg-surface rounded-full text-muted transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleUpdateOrder} className="space-y-4">
                                <div>
                                    <label className="text-[10px] text-muted font-black uppercase tracking-widest mb-2 block">
                                        Company / Customer Name
                                    </label>
                                    <input
                                        type="text"
                                        value={selectedOrder.customer_name || ''}
                                        onChange={(e) => setSelectedOrder({ ...selectedOrder, customer_name: e.target.value })}
                                        className="w-full bg-surface border border-subtle rounded-xl px-4 py-3 text-sm text-content focus:outline-none focus:border-accent transition-colors"
                                        placeholder="Ex: VELO BIKE CORP"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] text-muted font-black uppercase tracking-widest mb-2 block">
                                        Quantity of Pallets
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="1"
                                            value={selectedOrder.pallets_qty || ''}
                                            onChange={(e) => setSelectedOrder({ ...selectedOrder, pallets_qty: e.target.value })}
                                            className="w-full bg-surface border border-subtle rounded-xl px-4 py-3 pl-10 text-sm text-content focus:outline-none focus:border-accent transition-colors"
                                            placeholder="Ex: 2"
                                        />
                                        <Scale className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                                    </div>
                                    <p className="text-[9px] text-muted mt-2 px-1">
                                        Change pallet quantity to generate corresponding labels.
                                    </p>
                                </div>

                                <div>
                                    <label className="text-[10px] text-muted font-black uppercase tracking-widest mb-2 block">
                                        Total Units
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={selectedOrder.total_units || ''}
                                        onChange={(e) => setSelectedOrder({ ...selectedOrder, total_units: e.target.value })}
                                        className="w-full bg-surface border border-subtle rounded-xl px-4 py-3 text-sm text-content focus:outline-none focus:border-accent transition-colors"
                                        placeholder="Ex: 150"
                                    />
                                </div>


                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="flex-1 h-14 bg-surface border border-subtle hover:border-accent/40 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-content transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        Save Changes
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handlePrint}
                                        className="flex-[1.5] h-14 bg-accent text-white rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all"
                                    >
                                        <Printer size={18} />
                                        Print Labels
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Print Preview Wrapper */}
            {showPrintPreview && selectedOrder && (
                <PalletLabelsPrinter
                    order={selectedOrder}
                    onClose={() => setShowPrintPreview(false)}
                />
            )}
        </div>
    );
};
