import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Home from 'lucide-react/dist/esm/icons/home';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { LivePrintPreview } from '../components/orders/LivePrintPreview';
import { usePickingSession } from '../context/PickingContext';
import { useViewMode } from '../context/ViewModeContext';
import Search from 'lucide-react/dist/esm/icons/search';
import Filter from 'lucide-react/dist/esm/icons/filter';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import { OrderChip } from '../components/orders/OrderChip';
import { OrderSidebar } from '../components/orders/OrderSidebar';
import { FloatingActionButtons } from '../components/orders/FloatingActionButtons';
import { PickingSummaryModal } from '../components/orders/PickingSummaryModal';

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
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isMobileOrderListOpen, setIsMobileOrderListOpen] = useState(false);
    const filterRef = useRef(null);
    const mobileDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !(filterRef.current as any).contains(event.target)) {
                setIsFilterOpen(false);
            }
            if (mobileDropdownRef.current && !(mobileDropdownRef.current as any).contains(event.target)) {
                setIsMobileOrderListOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);



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
    const [pressedKey, setPressedKey] = useState<'left' | 'right' | null>(null);
    const [isShowingPickingSummary, setIsShowingPickingSummary] = useState(false);

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

    const filteredOrders = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const results = orders.filter(order => {
            const orderNum = String(order.order_number || '').toLowerCase();
            const customer = String(order.customer?.name || '').toLowerCase();
            return !query || orderNum.includes(query) || customer.includes(query);
        });

        if (!query) return results;

        // Reordering logic: Exact matches or "Starts with" first
        return [...results].sort((a, b) => {
            const aNum = String(a.order_number).toLowerCase();
            const bNum = String(b.order_number).toLowerCase();
            const aStartsWith = aNum.startsWith(query) ? 1 : 0;
            const bStartsWith = bNum.startsWith(query) ? 1 : 0;
            return bStartsWith - aStartsWith;
        });
    }, [orders, searchQuery]);

    // Keyboard arrow navigation between orders (placed after filteredOrders is declared)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.key === 'ArrowRight') setPressedKey('right');
            if (e.key === 'ArrowLeft') setPressedKey('left');
            if (filteredOrders.length === 0 || !selectedOrder) return;
            const currentIndex = filteredOrders.findIndex(o => o.id === selectedOrder?.id);
            if (e.key === 'ArrowRight') {
                if (currentIndex >= filteredOrders.length - 1) {
                    toast('No more orders', { icon: '➡️', duration: 1500 });
                } else {
                    setSelectedOrder(filteredOrders[currentIndex + 1]);
                }
            }
            if (e.key === 'ArrowLeft') {
                if (currentIndex <= 0) {
                    toast('Already at the latest order', { icon: '⬅️', duration: 1500 });
                } else {
                    setSelectedOrder(filteredOrders[currentIndex - 1]);
                }
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') setPressedKey(null);
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, [filteredOrders, selectedOrder]);

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

                    // "PALLET" label above the numbers
                    doc.setFontSize(110);
                    const labelText = 'PALLET';
                    const labelWidth = doc.getTextWidth(labelText);
                    const labelX = (pageWidth - labelWidth) / 2;
                    doc.text(labelText, labelX, pageHeight / 2 - 20);

                    // "X of Y" numbers
                    doc.setFontSize(200);
                    const textNum = `${i + 1} of ${pallets}`;
                    const textWidth = doc.getTextWidth(textNum);
                    const xCenter = (pageWidth - textWidth) / 2;
                    doc.text(textNum, xCenter, (pageHeight / 2) + 50);
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

    const handleNextOrder = () => {
        if (filteredOrders.length === 0 || !selectedOrder) return;
        const currentIndex = filteredOrders.findIndex(o => o.id === selectedOrder?.id);
        if (currentIndex >= filteredOrders.length - 1) {
            toast('No more orders', { icon: '➡️', duration: 1500 });
        } else {
            setSelectedOrder(filteredOrders[currentIndex + 1]);
        }
    };

    const handlePreviousOrder = () => {
        if (filteredOrders.length === 0 || !selectedOrder) return;
        const currentIndex = filteredOrders.findIndex(o => o.id === selectedOrder?.id);
        if (currentIndex <= 0) {
            toast('Already at the latest order', { icon: '⬅️', duration: 1500 });
        } else {
            setSelectedOrder(filteredOrders[currentIndex - 1]);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-bg-main">
                <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
            </div>
        );
    }

    return (
        <div className="relative flex flex-col md:flex-row h-screen w-full overflow-hidden bg-bg-main font-body">
            {/* Left Sidebar - Order Details Form (Desktop) */}
            <div className="hidden md:block">
                <OrderSidebar
                    formData={formData}
                    setFormData={setFormData}
                    selectedOrder={selectedOrder}
                    user={user}
                    takeOverOrder={takeOverOrder}
                    onRefresh={fetchOrders}
                    onShowPickingSummary={() => setIsShowingPickingSummary(true)}
                />
            </div>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative overflow-hidden h-full">
                {/* Top Navigation Bar */}
                <header className="h-24 ios-glass !border-none !shadow-none shrink-0 flex items-center px-4 md:px-8 z-50">
                    <div className="flex items-center w-full gap-3 md:gap-6">
                        {/* Search Container */}
                        <div className={`flex items-center h-12 bg-surface border border-subtle transition-all duration-500 overflow-hidden ${isSearchExpanded ? 'flex-1 md:w-80 md:flex-none px-4' : 'w-12 justify-center'} rounded-full shadow-sm`}>
                            <button
                                onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                                className="shrink-0 text-muted hover:text-emerald-500 transition-colors"
                            >
                                <Search size={20} />
                            </button>
                            {isSearchExpanded && (
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search orders..."
                                    className="bg-transparent border-none outline-none text-base text-main ml-3 w-full font-bold placeholder:opacity-20"
                                    autoFocus
                                />
                            )}
                        </div>

                        {/* Orders — Mobile: Dropdown, Desktop: Horizontal Scroll */}
                        {/* Mobile: Selected order with dropdown */}
                        <div className={`${isSearchExpanded ? 'w-auto' : 'flex-1'} md:hidden relative`} ref={mobileDropdownRef}>
                            <button
                                onClick={() => setIsMobileOrderListOpen(!isMobileOrderListOpen)}
                                className="flex items-center gap-2 h-12 px-5 bg-surface border border-subtle rounded-full transition-all active:scale-95 shadow-sm"
                            >
                                <span className={`text-main font-black text-lg tracking-tight ${isSearchExpanded ? 'max-w-[80px] truncate' : ''}`}>
                                    {selectedOrder ? `#${selectedOrder.order_number}` : 'Select'}
                                </span>
                                <ChevronDown size={16} className={`text-muted transition-transform duration-300 ${isMobileOrderListOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isMobileOrderListOpen && (
                                <div className="absolute top-14 right-0 w-64 max-h-80 overflow-y-auto bg-surface border border-subtle rounded-[2rem] shadow-2xl p-3 z-[60] animate-soft-in no-scrollbar">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted/30 px-4 mb-2">Orders ({filteredOrders.length})</p>
                                    {filteredOrders.map(order => (
                                        <button
                                            key={order.id}
                                            onClick={() => {
                                                setSelectedOrder(order);
                                                setIsMobileOrderListOpen(false);
                                            }}
                                            className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center justify-between ${selectedOrder?.id === order.id
                                                ? 'bg-main text-main border border-subtle'
                                                : 'hover:bg-main text-muted'
                                                }`}
                                        >
                                            <span>#{order.order_number}</span>
                                            {order.customer?.name && (
                                                <span className={`text-[10px] font-bold normal-case tracking-normal ${selectedOrder?.id === order.id ? 'text-main/40' : 'text-muted/30'
                                                    }`}>{order.customer.name}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Desktop: Horizontal Scroll */}
                        <div className="hidden md:flex flex-1 h-24 items-center gap-4 overflow-x-auto no-scrollbar mask-fade-edges py-2">
                            {filteredOrders.map(order => {
                                const isSelected = selectedOrder?.id === order.id;
                                return (
                                    <div
                                        key={order.id}
                                        ref={el => {
                                            if (isSelected && el) {
                                                el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                                            }
                                        }}
                                        className="shrink-0"
                                    >
                                        <OrderChip
                                            orderNumber={order.order_number}
                                            status={order.status}
                                            isSelected={isSelected}
                                            onClick={() => setSelectedOrder(order)}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Filter Dropdown */}
                        <div className="relative" ref={filterRef}>
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-surface border border-subtle text-muted hover:text-emerald-500 ios-transition shadow-sm"
                            >
                                <Filter size={20} />
                            </button>
                            {isFilterOpen && (
                                <div className="absolute top-14 right-0 w-56 bg-surface border border-subtle rounded-[2rem] shadow-2xl p-3 z-[60] animate-soft-in">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted/30 px-4 mb-2">Filter by Time</p>
                                    {['TODAY', 'YESTERDAY', 'WEEK', 'ALL'].map((filter) => (
                                        <button
                                            key={filter}
                                            onClick={() => {
                                                setTimeFilter(filter);
                                                setIsFilterOpen(false);
                                            }}
                                            className={`w-full text-left px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${timeFilter === filter ? 'bg-main text-main border border-subtle' : 'hover:bg-main text-muted'}`}
                                        >
                                            {filter}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Home Button */}
                        <button
                            onClick={() => navigate('/')}
                            className="w-12 h-12 flex items-center justify-center rounded-full bg-surface border border-subtle text-muted hover:text-emerald-500 ios-transition shadow-sm"
                        >
                            <Home size={20} />
                        </button>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto no-scrollbar relative bg-bg-main p-4 md:p-12 pb-32">
                    {selectedOrder ? (
                        <div className="max-w-4xl mx-auto w-full">
                            {/* Mobile View Toggle/Details (only visible on mobile) */}
                            <div className="md:hidden mb-8">
                                <OrderSidebar
                                    formData={formData}
                                    setFormData={setFormData}
                                    selectedOrder={selectedOrder}
                                    user={user}
                                    takeOverOrder={takeOverOrder}
                                    onRefresh={fetchOrders}
                                    onShowPickingSummary={() => setIsShowingPickingSummary(true)}
                                />
                            </div>

                            <LivePrintPreview
                                orderNumber={selectedOrder.order_number}
                                customerName={formData.customerName}
                                street={formData.street}
                                city={formData.city}
                                state={formData.state}
                                zip={formData.zip}
                                pallets={formData.pallets}
                                units={formData.units}
                                loadNumber={formData.loadNumber}
                                completedAt={selectedOrder.updated_at}
                            />
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-4">
                            <div className="w-16 h-16 rounded-full bg-surface border border-subtle flex items-center justify-center shadow-sm">
                                <Search size={32} className="opacity-20" />
                            </div>
                            <p className="font-heading text-xl font-bold opacity-30">Select an order to preview</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Island — centered on the preview area (right of the sidebar) */}
            <div className="absolute bottom-10 left-0 md:left-80 right-0 flex justify-center z-[100] pointer-events-none">
                <div className="pointer-events-auto animate-soft-in">
                    <FloatingActionButtons
                        onPrint={handlePrint}
                        onNext={handleNextOrder}
                        onPrevious={handlePreviousOrder}
                        isPrinting={isPrinting}
                        hasOrders={!!selectedOrder}
                        pressedKey={pressedKey}
                    />
                </div>
            </div>

            {/* Picking Summary Modal */}
            {isShowingPickingSummary && selectedOrder && (
                <PickingSummaryModal
                    orderNumber={selectedOrder.order_number}
                    items={selectedOrder.items}
                    completedAt={selectedOrder.updated_at}
                    onClose={() => setIsShowingPickingSummary(false)}
                />
            )}
        </div>
    );
};
