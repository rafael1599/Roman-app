import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Package from 'lucide-react/dist/esm/icons/package';
import Printer from 'lucide-react/dist/esm/icons/printer';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import Search from 'lucide-react/dist/esm/icons/search';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Hash from 'lucide-react/dist/esm/icons/hash';
import Truck from 'lucide-react/dist/esm/icons/truck';
import toast from 'react-hot-toast';
import { LivePrintPreview } from '../components/orders/LivePrintPreview';

export const OrdersScreen = () => {
    const { user } = useAuth();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [timeFilter, setTimeFilter] = useState('ALL');
    const [isPrinting, setIsPrinting] = useState(false);

    // Form state for live editing
    const [formData, setFormData] = useState({
        customerName: '',
        street: '',
        city: '',
        state: '',
        zip: '',
        pallets: 1,
        units: 0,
        loadNumber: ''
    });

    useEffect(() => {
        fetchOrders();
    }, [user, timeFilter]);

    // Sync form data when selectedOrder changes
    useEffect(() => {
        if (selectedOrder) {
            setFormData({
                customerName: selectedOrder.customer?.name || '',
                street: selectedOrder.customer?.street || '',
                city: selectedOrder.customer?.city || '',
                state: selectedOrder.customer?.state || '',
                zip: selectedOrder.customer?.zip_code || '',
                pallets: selectedOrder.pallets_qty || 1,
                units: selectedOrder.total_units || 0,
                loadNumber: selectedOrder.load_number || ''
            });
        }
    }, [selectedOrder]);

    const fetchOrders = async () => {
        if (!user) return;
        setLoading(true);
        try {
            let query = supabase
                .from('picking_lists')
                .select('*, customer:customers(name, street, city, state, zip_code)')
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

            const mappedData = (data || []).map((order: any) => ({
                ...order,
                customer_name: order.customer?.name || order.customer_name,
                customer_details: order.customer || {}
            }));

            setOrders(mappedData);

            // Auto-select first order if none selected
            if (mappedData.length > 0 && !selectedOrder) {
                setSelectedOrder(mappedData[0]);
            }
        } catch (err: any) {
            console.error('Error fetching orders:', err);
            toast.error('Failed to load orders');
        } finally {
            setLoading(false);
        }
    };

    const filteredOrders = useMemo(() => orders.filter(order => {
        const query = searchQuery.toLowerCase();
        const orderNum = String(order.order_number || '').toLowerCase();
        const customer = String(order.customer_name || '').toLowerCase();

        return (
            !searchQuery ||
            orderNum.includes(query) ||
            customer.includes(query)
        );
    }), [orders, searchQuery]);

    const handlePrint = async () => {
        if (!selectedOrder) return;

        // Build warnings for missing data
        const warnings: string[] = [];
        if (!formData.loadNumber.trim()) warnings.push('Load Number');
        if (!formData.street.trim()) warnings.push('Street Address');
        if (!formData.city.trim()) warnings.push('City');

        if (warnings.length > 0) {
            toast(`Missing: ${warnings.join(', ')}`, {
                icon: '⚠️',
                style: {
                    background: '#fef3c7',
                    color: '#92400e',
                    border: '1px solid #f59e0b',
                    fontWeight: 600,
                },
                duration: 4000,
            });
        }

        setIsPrinting(true);
        try {
            // Auto-save order data before printing
            const { error: orderError } = await supabase
                .from('picking_lists')
                .update({
                    pallets_qty: formData.pallets,
                    total_units: formData.units,
                    load_number: formData.loadNumber
                })
                .eq('id', selectedOrder.id);

            if (orderError) throw orderError;

            // Also update customer address if linked
            if (selectedOrder.customer_id) {
                const { error: custError } = await supabase
                    .from('customers')
                    .update({
                        name: formData.customerName,
                        street: formData.street,
                        city: formData.city,
                        state: formData.state,
                        zip_code: formData.zip
                    })
                    .eq('id', selectedOrder.customer_id);

                if (custError) console.error('Failed to update customer record:', custError);
            }

            // Refresh orders list silently
            fetchOrders();
            const { default: jsPDF } = await import('jspdf');

            // Use A4 landscape format (same as preview: 297mm x 210mm)
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = 297;
            const pageHeight = 210;
            const PT_TO_MM = 0.3528; // Conversion factor from points to millimeters
            const LINE_HEIGHT = 1.1; // Tighter line height factor
            const customerName = (formData.customerName || 'GENERIC CUSTOMER').toUpperCase();
            const street = formData.street.toUpperCase();
            const cityStateZip = `${formData.city.toUpperCase()}, ${formData.state.toUpperCase()} ${formData.zip}`;
            const pallets = formData.pallets || 1;

            for (let i = 0; i < pallets; i++) {
                // --- PAGE A: COMPANY INFO (matches LivePrintPreview layout) ---
                if (i > 0) doc.addPage('a4', 'landscape');

                const margin = 5;
                const maxWidth = pageWidth - margin * 2;
                const maxHeight = pageHeight - margin * 2;

                // Build content lines
                const contentLines: string[] = [];
                contentLines.push(customerName);
                if (street) contentLines.push(street);
                if (formData.city) contentLines.push(cityStateZip);
                contentLines.push(''); // spacer
                contentLines.push(`PALLETS: ${pallets}`);
                contentLines.push(`UNITS: ${formData.units}`);
                contentLines.push(`LOAD: ${formData.loadNumber || 'N/A'}`);
                contentLines.push(''); // spacer
                const thankYouMsg = 'Please count your shipment carefully that there are no damages due to shipping. Jamis Bicycles thanks you for your order.';

                // Dynamic font sizing: find the largest font that fits all content
                let fontSize = 100; // Start with a larger font to maximize space
                const minFontSize = 12;
                let fits = false;

                doc.setFont('helvetica', 'bold');

                while (fontSize >= minFontSize && !fits) {
                    doc.setFontSize(fontSize);
                    doc.setLineHeightFactor(LINE_HEIGHT);

                    let totalHeight = margin;

                    // Calculate height for all main content lines
                    for (const line of contentLines) {
                        if (line === '') {
                            totalHeight += (fontSize * PT_TO_MM) * 0.3; // spacer
                        } else {
                            const wrapped = doc.splitTextToSize(line, maxWidth);
                            totalHeight += wrapped.length * (fontSize * PT_TO_MM * LINE_HEIGHT);
                        }
                    }

                    // Add thank you message (slightly smaller)
                    const msgFontSize = fontSize * 0.7;
                    doc.setFontSize(msgFontSize);
                    const msgWrapped = doc.splitTextToSize(thankYouMsg.toUpperCase(), maxWidth);
                    totalHeight += msgWrapped.length * (msgFontSize * PT_TO_MM * LINE_HEIGHT);

                    // Check if it fits
                    if (totalHeight <= maxHeight) {
                        fits = true;
                    } else {
                        fontSize -= 1; // Finer precision
                    }
                }

                // Render with the calculated font size
                let yPos = margin + (fontSize * PT_TO_MM); // Start exactly at margin + CapHeight
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(fontSize);
                doc.setLineHeightFactor(LINE_HEIGHT);

                for (const line of contentLines) {
                    if (line === '') {
                        yPos += (fontSize * PT_TO_MM) * 0.3; // spacer
                    } else {
                        const wrapped = doc.splitTextToSize(line, maxWidth);
                        doc.text(wrapped, margin, yPos);
                        yPos += wrapped.length * (fontSize * PT_TO_MM * LINE_HEIGHT);
                    }
                }

                // Thank you message
                const msgFontSize = fontSize * 0.7;
                doc.setFontSize(msgFontSize);
                const msgWrapped = doc.splitTextToSize(thankYouMsg.toUpperCase(), maxWidth);
                doc.text(msgWrapped, margin, yPos);

                // --- PAGE B: PALLET NUMBER ONLY (clean, centered) ---
                doc.addPage('a4', 'landscape');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(200);
                const textNum = `${i + 1} of ${pallets}`;
                const textWidth = doc.getTextWidth(textNum);
                const xCenter = (pageWidth - textWidth) / 2;
                const yCenter = (pageHeight / 2) + 30; // Adjust for font baseline
                doc.text(textNum, xCenter, yCenter);
            }

            const blob = doc.output('bloburl');
            window.open(blob, '_blank');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Failed to generate PDF');
        } finally {
            setIsPrinting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
            {/* LEFT PANE: Order List + Form */}
            <aside className="w-[28%] min-w-[320px] max-w-[400px] border-r border-subtle bg-main flex flex-col overflow-hidden">
                {/* Header */}
                <header className="p-5 border-b border-subtle shrink-0">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-accent/10 rounded-xl border border-accent/20">
                            <Truck className="text-accent" size={20} />
                        </div>
                        <h1 className="font-black text-sm uppercase tracking-tight text-content">PickD Logistics</h1>
                    </div>
                    {/* Search */}
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" size={16} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search orders..."
                            className="w-full bg-surface border border-subtle rounded-xl py-2.5 pl-10 pr-4 text-xs text-content focus:outline-none focus:border-accent transition-all placeholder:text-muted/50"
                        />
                    </div>
                    {/* Time Filters */}
                    <div className="flex gap-1.5 mt-3 overflow-x-auto scrollbar-none">
                        {['TODAY', 'YESTERDAY', 'WEEK', 'ALL'].map((btn) => (
                            <button
                                key={btn}
                                onClick={() => setTimeFilter(btn)}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap border ${timeFilter === btn
                                    ? 'bg-accent border-accent text-white'
                                    : 'bg-surface border-subtle text-muted hover:border-accent/40'
                                    }`}
                            >
                                {btn}
                            </button>
                        ))}
                    </div>
                </header>

                {/* Order List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {filteredOrders.length === 0 ? (
                        <div className="p-6 text-center">
                            <Package className="w-10 h-10 text-muted mx-auto mb-2 opacity-20" />
                            <p className="text-xs text-muted">No orders found</p>
                        </div>
                    ) : (
                        filteredOrders.map((order) => (
                            <div
                                key={order.id}
                                onClick={() => setSelectedOrder(order)}
                                className={`p-3 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${selectedOrder?.id === order.id
                                    ? 'bg-accent/10 border-accent/30'
                                    : 'bg-card border-subtle hover:border-accent/20'
                                    }`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`p-2 rounded-lg ${selectedOrder?.id === order.id ? 'bg-accent/20 text-accent' : 'bg-surface text-muted'}`}>
                                        <Package size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-content uppercase tracking-tight truncate">
                                            {order.order_number || 'No Order #'}
                                        </p>
                                        <p className="text-[9px] text-muted font-medium truncate">
                                            {order.customer_name || 'Generic'}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight size={14} className="text-muted/30 shrink-0" />
                            </div>
                        ))
                    )}
                </div>

                {/* Active Order Form */}
                {selectedOrder && (
                    <form onSubmit={(e) => e.preventDefault()} className="p-4 border-t border-subtle bg-card shrink-0 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] text-muted font-black uppercase tracking-widest">Active Order</p>
                            <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                                {selectedOrder.status || 'pending'}
                            </span>
                        </div>

                        {/* Customer Name */}
                        <div>
                            <label className="text-[9px] text-muted font-black uppercase tracking-widest mb-1 block">Customer</label>
                            <input
                                type="text"
                                value={formData.customerName}
                                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                                className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors"
                            />
                        </div>

                        {/* Address Fields */}
                        <div className="space-y-2">
                            <label className="text-[9px] text-muted font-black uppercase tracking-widest flex items-center gap-1">
                                <MapPin size={10} /> Destination
                            </label>
                            <input
                                type="text"
                                placeholder="Street Address"
                                value={formData.street}
                                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                                className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors"
                            />
                            <div className="grid grid-cols-3 gap-2">
                                <input
                                    type="text"
                                    placeholder="City"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    className="col-span-1 bg-surface border border-subtle rounded-lg px-2 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors"
                                />
                                <input
                                    type="text"
                                    placeholder="ST"
                                    maxLength={2}
                                    value={formData.state}
                                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                                    className="bg-surface border border-subtle rounded-lg px-2 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors text-center"
                                />
                                <input
                                    type="text"
                                    placeholder="Zip"
                                    value={formData.zip}
                                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                                    className="bg-surface border border-subtle rounded-lg px-2 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors"
                                />
                            </div>
                        </div>

                        {/* Pallets & Units */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[9px] text-muted font-black uppercase tracking-widest mb-1 block">Pallets</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.pallets}
                                    onChange={(e) => setFormData({ ...formData, pallets: parseInt(e.target.value) || 1 })}
                                    className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] text-muted font-black uppercase tracking-widest mb-1 block">Units</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.units}
                                    onChange={(e) => setFormData({ ...formData, units: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors"
                                />
                            </div>
                        </div>

                        {/* Load Number */}
                        <div>
                            <label className="text-[9px] text-muted font-black uppercase tracking-widest mb-1 flex items-center gap-1">
                                <Hash size={10} /> Load Number
                            </label>
                            <input
                                type="text"
                                value={formData.loadNumber}
                                onChange={(e) => setFormData({ ...formData, loadNumber: e.target.value.toUpperCase() })}
                                placeholder="E.G. 127035968"
                                className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors font-mono"
                            />
                        </div>

                        {/* Action Button - Print Labels (also saves) */}
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={handlePrint}
                                disabled={isPrinting}
                                className="w-full h-12 bg-accent text-white rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                                {isPrinting ? 'Saving & Generating...' : 'Print Labels'}
                            </button>
                            <p className="text-[9px] text-muted text-center mt-2">Data is saved automatically</p>
                        </div>
                    </form>
                )}
            </aside>

            {/* RIGHT PANE: Live Print Preview */}
            <main className="flex-1 bg-surface overflow-hidden">
                {selectedOrder ? (
                    <LivePrintPreview data={formData} />
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <Package className="w-16 h-16 text-muted mx-auto mb-4 opacity-20" />
                            <p className="text-sm text-muted">Select an order to see the preview</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
