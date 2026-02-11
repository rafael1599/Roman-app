import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Package from 'lucide-react/dist/esm/icons/package';
import Printer from 'lucide-react/dist/esm/icons/printer';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Hash from 'lucide-react/dist/esm/icons/hash';
import Truck from 'lucide-react/dist/esm/icons/truck';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Home from 'lucide-react/dist/esm/icons/home';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { SearchInput } from '../components/ui/SearchInput';
import { LivePrintPreview } from '../components/orders/LivePrintPreview';
import { CustomerAutocomplete } from '../features/picking/components/CustomerAutocomplete';
import { usePickingSession } from '../context/PickingContext';
import { useViewMode } from '../context/ViewModeContext';
import HandMetal from 'lucide-react/dist/esm/icons/hand-metal';

export const OrdersScreen = () => {
    const { user } = useAuth();
    const { takeOverOrder } = usePickingSession();
    const { externalOrderId, setExternalOrderId } = useViewMode();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [timeFilter, setTimeFilter] = useState('ALL');
    const navigate = useNavigate();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Ref to track selectedOrder without triggering re-renders in callbacks
    const selectedOrderRef = useRef(selectedOrder);
    useEffect(() => {
        selectedOrderRef.current = selectedOrder;
    }, [selectedOrder]);

    // Auto-scroll to top when searching to ensure results are visible
    useEffect(() => {
        if (searchQuery && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [searchQuery]);
    const [isPrinting, setIsPrinting] = useState(false);

    // Form state for live editing
    const [formData, setFormData] = useState({
        customerName: '',
        street: '',
        city: '',
        state: '',
        zip: '',
        pallets: '1' as string | number,
        units: '0' as string | number,
        loadNumber: ''
    });

    // Track the selected customer ID to link/unlink
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    // Track original params to detect changes (Name vs Address)
    const [originalCustomerParams, setOriginalCustomerParams] = useState<any>(null);

    const fetchOrders = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            let query = supabase
                .from('picking_lists')
                .select(`
                    *, 
                    customer:customers(id, name, street, city, state, zip_code),
                    user:profiles!user_id(full_name),
                    presence:user_presence!user_id(last_seen_at)
                `)
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
                customer_details: order.customer || {}
            }));

            setOrders(mappedData);

            // Auto-select first order if none selected AND no external jump pending
            if (mappedData.length > 0 && !selectedOrderRef.current && !externalOrderId) {
                setSelectedOrder(mappedData[0]);
            }
        } catch (err: any) {
            console.error('Error fetching orders:', err);
            toast.error('Failed to load orders');
        } finally {
            setLoading(false);
        }
    }, [user, timeFilter, externalOrderId]); // Include externalOrderId here to ensure consistency

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // Handle external selections (e.g. from DoubleCheckHeader)
    useEffect(() => {
        if (externalOrderId && orders.length > 0) {
            const order = orders.find(o => o.id === externalOrderId);
            if (order) {
                console.log('🎯 [OrdersScreen] Setting selected order from external ID:', externalOrderId);
                setSelectedOrder(order);
                // Clear the external ID so we don't keep resetting on every render
                setExternalOrderId(null);
            }
        }
    }, [externalOrderId, orders, setExternalOrderId]);

    // Sync form data when selectedOrder changes
    useEffect(() => {
        if (selectedOrder) {
            setFormData({
                customerName: selectedOrder.customer?.name || '',
                street: selectedOrder.customer?.street || '',
                city: selectedOrder.customer?.city || '',
                state: selectedOrder.customer?.state || '',
                zip: selectedOrder.customer?.zip_code || '',
                pallets: String(selectedOrder.pallets_qty || 1),
                units: String(selectedOrder.total_units || 0),
                loadNumber: selectedOrder.load_number || ''
            });
            setSelectedCustomerId(selectedOrder.customer_id || null);
            setOriginalCustomerParams(selectedOrder.customer || null);
        }
    }, [selectedOrder]);

    const filteredOrders = useMemo(() => orders.filter(order => {
        const query = searchQuery.toLowerCase();
        const orderNum = String(order.order_number || '').toLowerCase();
        const customer = String(order.customer?.name || '').toLowerCase();

        return (
            !searchQuery ||
            orderNum.includes(query) ||
            customer.includes(query)
        );
    }), [orders, searchQuery]);

    const handleCustomerSelect = (customer: any | null) => {
        if (customer && customer.id) {
            // Existing Customer Selected
            setFormData(prev => ({
                ...prev,
                customerName: customer.name,
                street: customer.street || '',
                city: customer.city || '',
                state: customer.state || '',
                zip: customer.zip_code || ''
            }));
            setSelectedCustomerId(customer.id);
            setOriginalCustomerParams(customer);
        } else if (customer && customer.name) {
            // Manual typing (New Customer)
            setFormData(prev => ({
                ...prev,
                customerName: customer.name
            }));
            setSelectedCustomerId(null);
            setOriginalCustomerParams(null);
        } else {
            // Cleared
            setFormData(prev => ({
                ...prev,
                customerName: '',
                street: '',
                city: '',
                state: '',
                zip: ''
            }));
            setSelectedCustomerId(null);
            setOriginalCustomerParams(null);
        }
    };

    const handlePrint = async () => {
        if (!selectedOrder) return;

        // Build warnings for missing data
        const palletsNum = parseInt(String(formData.pallets)) || 0;
        const unitsNum = parseInt(String(formData.units)) || 0;

        if (palletsNum < 1) {
            toast.error('Must have at least 1 Pallet');
            return;
        }

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
            let finalCustomerId = selectedCustomerId;

            // Logic to determine if we Update Existing, Create New, or Unlink
            if (finalCustomerId && originalCustomerParams) {
                const nameChanged = formData.customerName.trim() !== originalCustomerParams.name.trim();
                const addressChanged =
                    formData.street.trim() !== (originalCustomerParams.street || '').trim() ||
                    formData.city.trim() !== (originalCustomerParams.city || '').trim() ||
                    formData.state.trim() !== (originalCustomerParams.state || '').trim() ||
                    formData.zip.trim() !== (originalCustomerParams.zip_code || '').trim();

                if (nameChanged && addressChanged) {
                    // Both changed -> Treat as NEW Customer
                    finalCustomerId = null; // Will trigger create below
                } else if (nameChanged || addressChanged) {
                    // Only one changed -> Update Existing Customer
                    // Standard update logic will handle this below
                }
            }

            // Create New Customer if needed
            if (!finalCustomerId && formData.customerName.trim()) {
                const { data: newCust, error: createError } = await supabase
                    .from('customers')
                    .insert({
                        name: formData.customerName,
                        street: formData.street,
                        city: formData.city,
                        state: formData.state,
                        zip_code: formData.zip
                    })
                    .select()
                    .single();

                if (createError) throw createError;
                finalCustomerId = newCust.id;
            } else if (finalCustomerId) {
                // Update existing customer record (Reflecting "Moved" or "Renamed")
                const { error: updateError } = await supabase
                    .from('customers')
                    .update({
                        name: formData.customerName,
                        street: formData.street,
                        city: formData.city,
                        state: formData.state,
                        zip_code: formData.zip
                    })
                    .eq('id', finalCustomerId);

                if (updateError) console.error('Failed to update customer record:', updateError);
            }

            // Update Picking List
            const { error: orderError } = await supabase
                .from('picking_lists')
                .update({
                    pallets_qty: palletsNum,
                    total_units: unitsNum,
                    load_number: formData.loadNumber || null,
                    customer_id: finalCustomerId // Link to the customer (new or existing)
                })
                .eq('id', selectedOrder.id);

            if (orderError) {
                // Handle Unique Constraint Violation for Load Number
                if (orderError.code === '23505' && orderError.message.includes('load_number')) {
                    toast.error(`Load Number "${formData.loadNumber}" matches another order! Must be unique.`, { duration: 5000 });
                    setIsPrinting(false);
                    return; // Stop execution
                }
                throw orderError;
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
            const customerNameName = (formData.customerName || 'GENERIC CUSTOMER').toUpperCase();
            const street = formData.street.toUpperCase();
            const cityStateZip = `${formData.city.toUpperCase()}, ${formData.state.toUpperCase()} ${formData.zip}`;
            const pallets = palletsNum;

            for (let i = 0; i < pallets; i++) {
                // --- PAGE A: COMPANY INFO (matches LivePrintPreview layout) ---
                if (i > 0) doc.addPage('a4', 'landscape');

                const margin = 5;
                const maxWidth = pageWidth - margin * 2;
                const maxHeight = pageHeight - margin * 2;

                // Build content lines
                const contentLines: string[] = [];
                contentLines.push(customerNameName);
                if (street) contentLines.push(street);
                if (formData.city) contentLines.push(cityStateZip);
                contentLines.push(''); // spacer
                contentLines.push(`PALLETS: ${pallets}`);
                contentLines.push(`UNITS: ${unitsNum}`);
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
                // Only show pagination "X of Y" if there is more than one pallet
                if (pallets > 1) {
                    doc.addPage('a4', 'landscape');
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(200);
                    const textNum = `${i + 1} of ${pallets}`;
                    const textWidth = doc.getTextWidth(textNum);
                    const xCenter = (pageWidth - textWidth) / 2;
                    const yCenter = (pageHeight / 2) + 30; // Adjust for font baseline
                    doc.text(textNum, xCenter, yCenter);
                }
            }

            const blob = doc.output('bloburl');
            window.open(blob, '_blank');
        } catch (error: any) {
            console.error('Error generating PDF:', error);
            if (error.code === '23505') {
                toast.error(`Load Number "${formData.loadNumber}" already exists!`, { duration: 5000 });
            } else {
                toast.error('Failed to update/print order');
            }
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
        <div className="flex h-[100vh] w-full overflow-hidden relative bg-main">
            {/* Global Home Button (Top Right) */}
            <div className="absolute top-4 right-4 z-[60] md:top-6 md:right-6">
                <button
                    onClick={() => navigate('/')}
                    className="w-10 h-10 md:w-12 md:h-12 bg-white dark:bg-zinc-800 border border-subtle rounded-full shadow-lg flex items-center justify-center text-muted hover:text-accent hover:border-accent transition-all active:scale-90"
                    title="Go Home"
                >
                    <Home size={20} />
                </button>
            </div>

            {/* LEFT PANE: Order List + Form */}
            <aside className={`
                w-full md:w-[28%] md:min-w-[320px] md:max-w-[400px] border-r border-subtle bg-main flex flex-col overflow-hidden transition-all duration-300
                ${selectedOrder ? 'hidden md:flex' : 'flex'}
            `}>
                {/* Header */}
                <header className="p-5 border-b border-subtle shrink-0">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-accent/10 rounded-xl border border-accent/20">
                            <Truck className="text-accent" size={20} />
                        </div>
                        <h1 className="font-black text-sm uppercase tracking-tight text-content">PickD Logistics</h1>
                    </div>
                    {/* Search */}
                    <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search orders..."
                    />
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
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                    {filteredOrders.length === 0 ? (
                        <div className="p-10 border-2 border-dashed border-subtle rounded-2xl text-center m-3">
                            <Package className="w-10 h-10 text-muted mx-auto mb-3 opacity-20" />
                            <p className="text-xs text-muted mb-4 uppercase font-black tracking-widest opacity-40">No orders found</p>
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="px-4 py-2 bg-subtle text-accent font-black uppercase tracking-widest rounded-lg text-[9px] active:scale-95 transition-all shadow-sm"
                                >
                                    Clear Search
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredOrders.map((order) => {
                            const userOnline = order.presence?.last_seen_at
                                ? new Date(order.presence.last_seen_at) > new Date(Date.now() - 2 * 60 * 1000)
                                : false;

                            const inactiveMinutes = order.last_activity_at
                                ? (Date.now() - new Date(order.last_activity_at).getTime()) / 60000
                                : 0;

                            const isNonBlocking = ['building', 'needs_correction'].includes(order.status);
                            const isCompleted = order.status === 'completed';

                            let statusColor = 'border-subtle';
                            if (!isCompleted) {
                                if (userOnline) {
                                    statusColor = 'border-green-500/40';
                                } else {
                                    if (isNonBlocking && inactiveMinutes > 10) {
                                        statusColor = 'border-red-500/40';
                                    } else {
                                        statusColor = 'border-yellow-500/40';
                                    }
                                }
                            }

                            return (
                                <div
                                    key={order.id}
                                    onClick={() => setSelectedOrder(order)}
                                    className={`p-3 rounded-xl flex items-center justify-between cursor-pointer transition-all border-2 ${selectedOrder?.id === order.id
                                        ? 'bg-accent/10 border-accent/50 shadow-sm'
                                        : `bg-card ${statusColor} hover:border-accent/20`
                                        }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="relative">
                                            <div className={`p-2 rounded-lg ${selectedOrder?.id === order.id ? 'bg-accent/20 text-accent' : 'bg-surface text-muted'}`}>
                                                <Package size={16} />
                                            </div>
                                            {!isCompleted && (
                                                <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-main ${userOnline ? 'bg-green-500' : 'bg-zinc-400'
                                                    }`} title={userOnline ? 'User Online' : 'User Offline'} />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-content uppercase tracking-tight truncate flex items-center gap-1.5">
                                                {order.order_number || 'No Order #'}
                                                {!isCompleted && !userOnline && (
                                                    <span className="text-[8px] font-bold text-muted/60 lowercase italic">
                                                        ({Math.round(inactiveMinutes)}m ago)
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[9px] text-muted font-black truncate uppercase tracking-tighter opacity-70">
                                                {order.customer?.name || 'Generic'} {order.user?.full_name ? `• ${order.user.full_name}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md border ${isCompleted ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                            order.status === 'cancelled' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                                                'bg-accent/5 text-accent border-accent/10'
                                            }`}>
                                            {order.status}
                                        </span>
                                        <ChevronRight size={12} className="text-muted/30 shrink-0" />
                                    </div>
                                </div>
                            );
                        })
                    )
                    }
                </div>

                {/* Active Order Form - Only visible on desktop here, moved inside main for mobile */}
                {selectedOrder && (
                    <div className="hidden md:block">
                        <form
                            onSubmit={(e) => e.preventDefault()}
                            className="p-4 border-t border-subtle bg-card shrink-0 space-y-3"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isPrinting) {
                                    e.preventDefault();
                                    handlePrint();
                                }
                            }}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[9px] text-muted font-black uppercase tracking-widest">Active Order</p>
                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                                    {selectedOrder.status || 'pending'}
                                </span>
                            </div>

                            {selectedOrder.user_id !== user?.id && ['active', 'ready_to_double_check', 'double_checking'].includes(selectedOrder.status) && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                                    <div className="flex items-center gap-2 text-amber-600">
                                        <HandMetal size={14} />
                                        <p className="text-[10px] font-black uppercase tracking-tight">Owned by {selectedOrder.user?.full_name || 'Another User'}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await takeOverOrder(selectedOrder.id);
                                            fetchOrders(); // Refresh list to see new owner
                                        }}
                                        className="w-full py-2 bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm active:scale-95 transition-all"
                                    >
                                        Take Over Order
                                    </button>
                                </div>
                            )}

                            {/* Customer Name Autocomplete */}
                            <div>
                                <label className="text-[9px] text-muted font-black uppercase tracking-widest mb-1 block">Customer</label>
                                <CustomerAutocomplete
                                    value={{ name: formData.customerName } as any}
                                    onChange={handleCustomerSelect}
                                    placeholder="Search Customer..."
                                    className="text-xs"
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
                                    onFocus={(e) => e.target.select()}
                                    className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors"
                                />
                                <div className="grid grid-cols-3 gap-2">
                                    <input
                                        type="text"
                                        placeholder="City"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        onFocus={(e) => e.target.select()}
                                        className="col-span-1 bg-surface border border-subtle rounded-lg px-2 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors"
                                    />
                                    <input
                                        type="text"
                                        placeholder="ST"
                                        maxLength={2}
                                        value={formData.state}
                                        onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                                        onFocus={(e) => e.target.select()}
                                        className="bg-surface border border-subtle rounded-lg px-2 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors text-center"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Zip"
                                        value={formData.zip}
                                        onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                                        onFocus={(e) => e.target.select()}
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
                                        onKeyDown={(e) => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                                        value={formData.pallets}
                                        onChange={(e) => setFormData({ ...formData, pallets: e.target.value })}
                                        onFocus={(e) => e.target.select()}
                                        className="w-full bg-surface border border-subtle rounded-lg px-3 py-2 text-xs text-content focus:outline-none focus:border-accent transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] text-muted font-black uppercase tracking-widest mb-1 block">Units</label>
                                    <input
                                        type="number"
                                        min="0"
                                        onKeyDown={(e) => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                                        value={formData.units}
                                        onChange={(e) => setFormData({ ...formData, units: e.target.value })}
                                        onFocus={(e) => e.target.select()}
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
                                    onFocus={(e) => e.target.select()}
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
                    </div>
                )}
            </aside>

            {/* RIGHT PANE: Live Print Preview */}
            <main className={`
                flex-1 bg-surface overflow-hidden transition-all duration-300
                ${selectedOrder ? 'flex flex-col' : 'hidden md:flex md:flex-col'}
            `}>
                {selectedOrder ? (
                    <>
                        {/* Mobile Header with Back Button */}
                        <header className="md:hidden p-4 border-b border-subtle bg-card flex items-center gap-4">
                            <button
                                onClick={() => setSelectedOrder(null)}
                                className="p-2 -ml-2 rounded-full hover:bg-surface active:scale-90 transition-all text-muted"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div className="min-w-0">
                                <h2 className="text-xs font-black text-content uppercase tracking-tight truncate">
                                    {selectedOrder.order_number || 'No Order #'}
                                </h2>
                                <p className="text-[9px] text-muted font-medium uppercase truncate">
                                    {selectedOrder.customer?.name || 'Generic'}
                                </p>
                            </div>
                        </header>
                        <div className="flex-1 overflow-y-auto bg-surface">
                            {/* Mobile-only form stack */}
                            <div className="md:hidden">
                                <form
                                    onSubmit={(e) => e.preventDefault()}
                                    className="p-4 border-b border-subtle bg-card space-y-4"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isPrinting) {
                                            e.preventDefault();
                                            handlePrint();
                                        }
                                    }}
                                >
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] text-muted font-black uppercase tracking-widest">Edit Order Details</p>
                                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                                            {selectedOrder.status || 'pending'}
                                        </span>
                                    </div>

                                    {selectedOrder.user_id !== user?.id && ['active', 'ready_to_double_check', 'double_checking'].includes(selectedOrder.status) && (
                                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-3">
                                            <div className="flex items-center gap-2 text-amber-600">
                                                <HandMetal size={16} />
                                                <p className="text-xs font-black uppercase tracking-tight">Owned by {selectedOrder.user?.full_name || 'Another User'}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    await takeOverOrder(selectedOrder.id);
                                                    fetchOrders();
                                                }}
                                                className="w-full py-3 bg-amber-500 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all"
                                            >
                                                Take Over Order
                                            </button>
                                        </div>
                                    )}

                                    {/* Customer Name Autocomplete - Mobile */}
                                    <div>
                                        <label className="text-[10px] text-muted font-black uppercase tracking-widest mb-1.5 block">Customer</label>
                                        <CustomerAutocomplete
                                            value={{ name: formData.customerName } as any}
                                            onChange={handleCustomerSelect}
                                            placeholder="Search Customer..."
                                            className="text-sm"
                                        />
                                    </div>

                                    {/* Address Fields */}
                                    <div className="space-y-3">
                                        <label className="text-[10px] text-muted font-black uppercase tracking-widest flex items-center gap-1">
                                            <MapPin size={12} /> Destination Address
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Street Address"
                                            value={formData.street}
                                            onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                                            onFocus={(e) => e.target.select()}
                                            className="w-full bg-surface border border-subtle rounded-xl px-4 py-3 text-sm text-content focus:outline-none focus:border-accent transition-colors"
                                        />
                                        <div className="grid grid-cols-3 gap-2">
                                            <input
                                                type="text"
                                                placeholder="City"
                                                value={formData.city}
                                                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                                onFocus={(e) => e.target.select()}
                                                className="col-span-1 bg-surface border border-subtle rounded-xl px-3 py-3 text-sm text-content focus:outline-none focus:border-accent transition-colors"
                                            />
                                            <input
                                                type="text"
                                                placeholder="ST"
                                                maxLength={2}
                                                value={formData.state}
                                                onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                                                onFocus={(e) => e.target.select()}
                                                className="bg-surface border border-subtle rounded-xl px-3 py-3 text-sm text-content focus:outline-none focus:border-accent transition-colors text-center"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Zip"
                                                value={formData.zip}
                                                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                                                onFocus={(e) => e.target.select()}
                                                className="bg-surface border border-subtle rounded-xl px-3 py-3 text-sm text-content focus:outline-none focus:border-accent transition-colors"
                                            />
                                        </div>
                                    </div>

                                    {/* Pallets & Units */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] text-muted font-black uppercase tracking-widest mb-1.5 block">Pallets</label>
                                            <input
                                                type="number"
                                                min="1"
                                                onKeyDown={(e) => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                                                value={formData.pallets}
                                                onChange={(e) => setFormData({ ...formData, pallets: e.target.value })}
                                                onFocus={(e) => e.target.select()}
                                                className="w-full bg-surface border border-subtle rounded-xl px-4 py-3 text-sm text-content focus:outline-none focus:border-accent transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-muted font-black uppercase tracking-widest mb-1.5 block">Units</label>
                                            <input
                                                type="number"
                                                min="0"
                                                onKeyDown={(e) => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                                                value={formData.units}
                                                onChange={(e) => setFormData({ ...formData, units: e.target.value })}
                                                onFocus={(e) => e.target.select()}
                                                className="w-full bg-surface border border-subtle rounded-xl px-4 py-3 text-sm text-content focus:outline-none focus:border-accent transition-colors"
                                            />
                                        </div>
                                    </div>

                                    {/* Load Number */}
                                    <div>
                                        <label className="text-[10px] text-muted font-black uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                            <Hash size={12} /> Load Number
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.loadNumber}
                                            onChange={(e) => setFormData({ ...formData, loadNumber: e.target.value.toUpperCase() })}
                                            onFocus={(e) => e.target.select()}
                                            placeholder="E.G. 127035968"
                                            className="w-full bg-surface border border-subtle rounded-xl px-4 py-3 text-sm text-content focus:outline-none focus:border-accent transition-colors font-mono"
                                        />
                                    </div>

                                    {/* Action Button - Print Labels (also saves) */}
                                    <div className="pt-4 pb-20 md:pb-0">
                                        <button
                                            type="button"
                                            onClick={handlePrint}
                                            disabled={isPrinting}
                                            className="w-full h-14 bg-accent text-white rounded-xl flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            {isPrinting ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                                            {isPrinting ? 'Saving & Generating...' : 'Print Labels'}
                                        </button>
                                        <p className="text-[10px] text-muted text-center mt-3">Data is saved automatically</p>
                                    </div>
                                </form>
                            </div>

                            <div className="p-4 md:p-8 h-full flex flex-col">
                                <LivePrintPreview {...formData} />
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted opacity-30 p-10">
                        <Printer size={64} className="mb-4" />
                        <p className="text-sm font-black uppercase tracking-widest">Select an order to print</p>
                    </div>
                )}
            </main>
        </div>
    );
};
