import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useInventory } from '../hooks/useInventoryData';
import {
    Clock,
    Undo2,
    FileDown,
    ArrowRight,
    Plus,
    Minus,
    RotateCcw,
    Trash2,
    Move as MoveIcon,
    AlertCircle,
    Calendar,
    Search,
    Filter,
    Mail,
    Package,
    User,
    Users
} from 'lucide-react';
import toast from 'react-hot-toast';
// jspdf and autoTable are imported dynamically in handleDownloadReport
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { useConfirmation } from '../context/ConfirmationContext';


export const HistoryScreen = () => {
    const { undoAction, isDemoMode, demoLogs, resetDemo } = useInventory();
    const { isAdmin } = useAuth();
    const { showError } = useError(); // Initialize useError
    const { showConfirmation } = useConfirmation();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');
    const [userFilter, setUserFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState(null);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            setError(null);
            // Fetch logs for "Today" specifically for the report, or just all recent
            // For the screen, we limit to 100. For the report, we might need all of today.
            const { data, error: sbError } = await supabase
                .from('inventory_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200); // Increased limit slightly

            if (sbError) throw sbError;
            setLogs(data || []);
        } catch (err) {
            console.error('Fetch logs failed:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Real-time updates for logs
    useEffect(() => {
        fetchLogs();

        const channel = supabase
            .channel('log_updates')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'inventory_logs' },
                (payload) => {
                    setLogs(prev => [payload.new, ...prev].slice(0, 200));
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'inventory_logs' },
                (payload) => {
                    setLogs(prev => prev.map(log =>
                        log.id === payload.new.id ? { ...log, ...payload.new } : log
                    ));
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'inventory_logs' },
                (payload) => {
                    setLogs(prev => prev.filter(log => log.id !== payload.old.id));
                }
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    const workingLogs = useMemo(() => {
        if (isDemoMode) {
            // Combine real logs with demo logs, putting demo logs first
            // or just show demo logs. Let's show both but demo logs are "extra"
            return [...demoLogs, ...logs];
        }
        return logs;
    }, [isDemoMode, demoLogs, logs]);

    const uniqueUsers = useMemo(() => {
        const users = new Set(workingLogs.map(log => log.performed_by).filter(Boolean));
        return Array.from(users).sort();
    }, [workingLogs]);

    const filteredLogs = useMemo(() => {
        return workingLogs
            .filter(log => filter === 'ALL' || log.action_type === filter)
            .filter(log => userFilter === 'ALL' || log.performed_by === userFilter)
            .filter(log => {
                // If not admin, hide undone (reversed) actions
                if (!isAdmin && log.is_reversed) return false;
                // If not admin, hide 'ADD' (Restock) and 'DELETE' (Remove) actions
                if (!isAdmin && (log.action_type === 'ADD' || log.action_type === 'DELETE')) {
                    return false;
                }
                return true;
            })
            .filter(log => {
                const query = searchQuery.toLowerCase();
                return !searchQuery ||
                    log.sku?.toLowerCase().includes(query) ||
                    log.from_location?.toLowerCase().includes(query) ||
                    log.to_location?.toLowerCase().includes(query);
            });
    }, [workingLogs, filter, searchQuery, isAdmin]);

    const groupedLogs = useMemo(() => {
        const groups = {};
        filteredLogs.forEach(log => {
            const date = new Date(log.created_at);
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);

            let dateLabel;
            if (date.toDateString() === today.toDateString()) dateLabel = 'Today';
            else if (date.toDateString() === yesterday.toDateString()) dateLabel = 'Yesterday';
            else dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

            if (!groups[dateLabel]) groups[dateLabel] = [];
            groups[dateLabel].push(log);
        });
        return groups;
    }, [filteredLogs]);

    const handleUndo = useCallback(async (id) => {
        showConfirmation(
            'Undo Action',
            'Are you sure you want to undo this action?',
            async () => {
                // Optimistic update
                setLogs(prev => prev.map(log =>
                    log.id === id ? { ...log, is_reversed: true } : log
                ));

                try {
                    await undoAction(id);
                } catch (err) {
                    console.error("Undo failed, rolling back state:", err);
                    fetchLogs();
                }
            },
            null,
            'Undo'
        );
    }, [undoAction]);

    const getActionTypeInfo = (type, log = {}) => {
        switch (type) {
            case 'MOVE': return { icon: <MoveIcon size={14} />, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Relocate' };
            case 'ADD': return { icon: <Plus size={14} />, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Restock' };
            case 'DEDUCT': return { icon: <Minus size={14} />, color: 'text-red-500', bg: 'bg-red-500/10', label: log.list_id ? 'Order Pick' : 'Manual Pick' };
            case 'DELETE': return { icon: <Trash2 size={14} />, color: 'text-muted', bg: 'bg-surface', label: 'Remove' };
            default: return { icon: <Clock size={14} />, color: 'text-muted', bg: 'bg-surface', label: 'Update' };
        }
    };

    // --- Report & Automation Logic ---

    const generateDailyPDF = useCallback((jsPDF, autoTable) => {
        const doc = new jsPDF('l', 'mm', 'a4');
        const todayStr = new Date().toLocaleDateString();

        doc.setFontSize(28);
        doc.text(`Daily Inventory Report - ${todayStr}`, 14, 22);

        doc.setFontSize(14);
        doc.text(`Generated at: ${new Date().toLocaleTimeString()}`, 14, 32);

        const now = new Date();
        const todayStrComp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const todaysLogs = logs.filter(log => {
            if (!log.created_at) return false;
            if (log.is_reversed) return false;

            const logDate = new Date(log.created_at);
            const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
            return logDateStr === todayStrComp;
        });

        const tableData = todaysLogs.map(log => {
            let description = '';
            const fromLoc = log.from_location ? `${log.from_location} (${log.from_warehouse || 'N/A'})` : '';
            const toLoc = log.to_location ? `${log.to_location} (${log.to_warehouse || 'N/A'})` : '';

            switch (log.action_type) {
                case 'MOVE':
                    description = `Relocated from ${fromLoc} to ${toLoc}`;
                    break;
                case 'ADD':
                    description = `Restocked inventory in ${toLoc || fromLoc || 'General'}`;
                    break;
                case 'DEDUCT':
                    description = `Picked stock from ${fromLoc || 'General'}`;
                    break;
                case 'DELETE':
                    description = `Removed item from ${fromLoc || 'Inventory'}`;
                    break;
                default:
                    description = `Updated record for ${fromLoc || toLoc || '-'}`;
            }

            return [
                new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                log.sku,
                description,
                log.quantity
            ];
        });

        autoTable(doc, {
            startY: 45,
            head: [['Time', 'SKU', 'Activity Description', 'Qty']],
            body: tableData,
            theme: 'grid',
            headStyles: {
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0],
                fontSize: 16,
                fontStyle: 'bold'
            },
            styles: {
                fontSize: 14,
                cellPadding: 5
            },
            columnStyles: {
                0: { cellWidth: 40 },
                1: { cellWidth: 60, fontStyle: 'bold' },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
            }
        });

        return doc;
    }, [logs]);

    const handleDownloadReport = useCallback(async () => {
        try {
            setLoading(true);
            const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable')
            ]);
            const doc = generateDailyPDF(jsPDF, autoTable);
            doc.save(`inventory-report-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (err) {
            console.error('Failed to generate PDF:', err);
            showError('Error generating PDF report.', err.message);
        } finally {
            setLoading(false);
        }
    }, [generateDailyPDF]);

    const sendDailyEmail = useCallback(async () => {
        try {
            console.log("Attempting to send daily email...");

            const now = new Date();
            const todayStr = now.toLocaleDateString();
            const todayStrComp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const todaysLogs = logs.filter(log => {
                if (!log.created_at) return false;
                // Business rule: Exclude undone actions from email summary
                if (log.is_reversed) return false;

                const logDate = new Date(log.created_at);
                const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
                return logDateStr === todayStrComp;
            });

            const moveCount = todaysLogs.filter(l => l.action_type === 'MOVE').length;
            const pickCount = todaysLogs.filter(l => l.action_type === 'DEDUCT').length;
            const addCount = todaysLogs.filter(l => l.action_type === 'ADD').length;

            const htmlContent = `
                <h1>Daily Inventory Summary - ${todayStr}</h1>
                <p><strong>Total Actions:</strong> ${todaysLogs.length}</p>
                <ul>
                    <li>Moves: ${moveCount}</li>
                    <li>Picks: ${pickCount}</li>
                    <li>Restocks: ${addCount}</li>
                </ul>
                
                <h2>Activity Details</h2>
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: sans-serif;">
                    <thead>
                        <tr style="background-color: #f3f4f6; color: #374151;">
                            <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; width: 80px;">Time</th>
                            <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; width: 120px;">SKU</th>
                            <th style="padding: 12px; border-bottom: 2px solid #e5e7eb;">Activity Description</th>
                            <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; text-align: right; width: 60px;">Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${todaysLogs.map(log => {
                const locationStyle = 'font-weight: 600; color: #111827;';
                const secondaryColor = '#6b7280';

                const fromLoc = log.from_location ? `<span style="${locationStyle}">${log.from_location}</span> <span style="color:${secondaryColor}; font-size: 0.8em;">(${log.from_warehouse || 'N/A'})</span>` : '';
                const toLoc = log.to_location ? `<span style="${locationStyle}">${log.to_location}</span> <span style="color:${secondaryColor}; font-size: 0.8em;">(${log.to_warehouse || 'N/A'})</span>` : '';

                let description = '';
                switch (log.action_type) {
                    case 'MOVE':
                        description = `Relocated from ${fromLoc} to ${toLoc}`;
                        break;
                    case 'ADD':
                        description = `Restocked inventory in ${toLoc || fromLoc || 'General'}`;
                        break;
                    case 'DEDUCT':
                        description = `Picked stock from ${fromLoc || 'General'}`;
                        break;
                    case 'DELETE':
                        description = `Removed item from ${fromLoc || 'Inventory'}`;
                        break;
                    default:
                        description = `Updated record for ${fromLoc || toLoc || '-'}`;
                }

                return `
                                <tr style="border-bottom: 1px solid #f3f4f6;">
                                    <td style="padding: 12px; color: #6b7280; font-size: 0.9em;">
                                        ${new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td style="padding: 12px; font-weight: bold; color: #111827;">
                                        ${log.sku}
                                    </td>
                                    <td style="padding: 12px; color: #374151;">
                                        ${description}
                                    </td>
                                    <td style="padding: 12px; text-align: right; font-weight: bold;">
                                        ${log.quantity}
                                    </td>
                                </tr>
                            `;
            }).join('')}
                    </tbody>
                </table>
                
                <p style="margin-top: 30px; font-size: 11px; color: #9ca3af; text-align: center;">
                    Automated report generated by Roman App • ${new Date().toLocaleString()}
                </p>
            `;

            // Call Supabase Edge Function
            const { data, error } = await supabase.functions.invoke('send-daily-report', {
                body: {
                    to: 'rafaelukf@gmail.com',
                    subject: `Daily Inventory Report - ${todayStr}`,
                    html: htmlContent
                }
            });

            if (error) {
                console.error("Edge Function Invocation Error:", error);
                throw error;
            }

            // Check for functional error returned in body (status 200)
            if (data?.error) {
                console.error("Email Sending Error:", data.error);
                showError('Error sending email', JSON.stringify(data.error));
                return;
            }

            console.log("Email sent successfully:", data);
            localStorage.setItem(`email_sent_${new Date().toDateString()}`, 'true');
            toast.success(`Daily report sent to rafaelukf@gmail.com`);

        } catch (err) {
            console.error("Failed to send email:", err);
            // Optionally alert user or just log
            showError('Failed to send daily email', err.message || "Failed to send daily email via Edge Function.");
        }
    }, [logs]);

    // Automated 6 PM Check
    useEffect(() => {
        const checkTime = () => {
            const now = new Date();
            const is6PM = now.getHours() === 18 && now.getMinutes() === 0; // 18:00

            if (is6PM) {
                const sentKey = `email_sent_${now.toDateString()}`;
                const alreadySent = localStorage.getItem(sentKey);

                if (!alreadySent) {
                    sendDailyEmail();
                }
            }
        };

        const interval = setInterval(checkTime, 60000); // Check every minute
        checkTime(); // Initial check

        return () => clearInterval(interval);
    }, [sendDailyEmail]); // Dependency on logs so we have data to send

    return (
        <div className="flex flex-col h-full bg-main text-content p-4 max-w-2xl mx-auto w-full">
            <header className="flex justify-between items-end mb-8 pt-6">
                <div>
                    <h1 className="text-5xl font-black uppercase tracking-tighter leading-none">History</h1>
                    <p className="text-muted text-[10px] font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                        <Clock size={10} /> Live Activity Log
                    </p>
                </div>
                <div className="flex gap-2">
                    {isDemoMode && (
                        <button
                            onClick={() => {
                                showConfirmation(
                                    'Reset Demo',
                                    'This will clear all demo movements and reset the inventory to its original state.',
                                    resetDemo
                                );
                            }}
                            className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 font-black uppercase text-[10px]"
                        >
                            Reset Demo
                        </button>
                    )}
                    <button
                        onClick={fetchLogs}
                        className="p-3 bg-surface border border-subtle rounded-2xl hover:opacity-80 transition-all text-content"
                        title="Refresh Logs"
                    >
                        <RotateCcw className={loading ? 'animate-spin' : ''} size={20} />
                    </button>
                </div>
            </header>

            {/* Search and Filters */}
            <div className="space-y-4 mb-8">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Search SKU or Location..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        inputMode="numeric"
                        className="w-full bg-surface/50 border border-subtle rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all placeholder:text-muted/50 text-content"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {['ALL', 'MOVE', 'ADD', 'DEDUCT', 'DELETE'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${filter === f
                                ? 'bg-accent border-accent/20 text-main shadow-lg shadow-accent/20'
                                : 'bg-surface text-muted border-subtle hover:border-muted/30'
                                }`}
                        >
                            {f === 'DEDUCT' ? 'Picking' : f}
                        </button>
                    ))}
                </div>

                {/* User Filters */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide items-center">
                    <div className="shrink-0 p-2 bg-surface/50 rounded-full border border-subtle">
                        <Users size={14} className="text-muted" />
                    </div>
                    <button
                        onClick={() => setUserFilter('ALL')}
                        className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${userFilter === 'ALL'
                            ? 'bg-content text-main border-content'
                            : 'bg-surface text-muted border-subtle hover:border-muted/30'
                            }`}
                    >
                        All Users
                    </button>
                    {uniqueUsers.map(user => (
                        <button
                            key={user}
                            onClick={() => setUserFilter(user)}
                            className={`px-4 py-2 rounded-full text-[10px] font-bold transition-all border shrink-0 flex items-center gap-2 ${userFilter === user
                                ? 'bg-content text-main border-content shadow-lg'
                                : 'bg-surface text-muted border-subtle hover:border-muted/30'
                                }`}
                        >
                            <User size={10} />
                            {user}
                        </button>
                    ))}
                </div>
            </div>

            {/* Logs List */}
            <div className="flex-1 overflow-y-auto space-y-8 pb-32">
                {loading && logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
                        <RotateCcw className="animate-spin" size={32} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Scanning blockchain...</span>
                    </div>
                ) : error ? (
                    <div className="p-8 bg-red-500/5 border border-red-500/20 rounded-3xl text-center">
                        <AlertCircle className="mx-auto mb-3 text-red-500" size={32} />
                        <p className="text-sm font-bold text-red-400 mb-1">Database Error</p>
                        <p className="text-[10px] text-red-500/60 font-mono uppercase truncate">{error}</p>
                        <button onClick={fetchLogs} className="mt-4 text-xs font-black uppercase text-red-500 hover:underline">Retry Connection</button>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-24 border-2 border-dashed border-subtle rounded-[2.5rem]">
                        <Clock className="mx-auto mb-4 opacity-10" size={48} />
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">No matching activities</p>
                    </div>
                ) : (
                    Object.entries(groupedLogs).map(([date, items]) => (
                        <div key={date} className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted pl-1 flex items-center gap-2">
                                <Calendar size={12} /> {date}
                            </h3>
                            <div className="space-y-3">
                                {items.map(log => {
                                    const info = getActionTypeInfo(log.action_type, log);
                                    return (
                                        <div
                                            key={log.id}
                                            className={`group relative p-5 rounded-[2rem] border transition-all duration-300 hover:scale-[1.01] ${log.is_reversed
                                                ? 'bg-main border-subtle opacity-40 grayscale pointer-events-none'
                                                : 'bg-surface/40 border-subtle hover:border-accent/30 hover:bg-surface/60'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-3 rounded-2xl ${info.bg} ${info.color} shadow-inner`}>
                                                        {info.icon}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg font-black tracking-tighter uppercase">{log.sku}</span>
                                                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${info.bg} ${info.color} border-current/20`}>
                                                                {info.label}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-muted font-bold uppercase tracking-wider">
                                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {log.performed_by || 'Unknown'} {log.is_demo && <span className="text-accent ml-2">DEMO</span>}
                                                        </p>
                                                    </div>
                                                </div>

                                                {!log.is_reversed && log.action_type !== 'DELETE' && isAdmin && (
                                                    <button
                                                        onClick={() => handleUndo(log.id)}
                                                        className="p-3 bg-surface border border-subtle hover:bg-content hover:text-main rounded-2xl transition-all shadow-xl text-content"
                                                        title="Undo Action"
                                                    >
                                                        <Undo2 size={16} />
                                                    </button>
                                                )}

                                                {log.is_reversed && (
                                                    <span className="px-3 py-1 bg-main border border-subtle rounded-full text-[7px] font-black uppercase tracking-widest text-muted">
                                                        Reversed
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-5 flex items-center gap-3">
                                                {log.action_type === 'MOVE' ? (
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <div className="flex-1 px-3 py-2 bg-main/40 rounded-xl border border-subtle">
                                                            <p className="text-[7px] text-muted font-black uppercase tracking-widest mb-1">From</p>
                                                            <div className="flex items-baseline gap-1">
                                                                <p className="text-[11px] font-bold text-muted">{log.from_location}</p>
                                                                <span className="text-[6px] opacity-40 font-black uppercase">{log.from_warehouse}</span>
                                                            </div>
                                                        </div>
                                                        <ArrowRight size={12} className="text-muted" />
                                                        <div className="flex-1 px-3 py-2 bg-accent/5 rounded-xl border border-accent/20">
                                                            <p className="text-[7px] text-accent/50 font-black uppercase tracking-widest mb-1">To</p>
                                                            <div className="flex items-baseline gap-1">
                                                                <p className="text-[11px] font-black text-accent">{log.to_location}</p>
                                                                <span className="text-[6px] opacity-40 font-black uppercase text-accent">{log.to_warehouse}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 px-4 py-2 bg-surface/30 rounded-xl border border-subtle">
                                                        <p className="text-[7px] text-muted font-black uppercase tracking-widest mb-1">Location</p>
                                                        <div className="flex items-baseline gap-1">
                                                            <p className="text-[11px] font-black text-content">{log.from_location || log.to_location || 'N/A'}</p>
                                                            <span className="text-[6px] opacity-40 font-black uppercase">{(log.from_warehouse || log.to_warehouse) || 'N/A'}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="text-right px-4">
                                                    <p className="text-[7px] text-muted font-black uppercase tracking-widest mb-1">Qty</p>
                                                    <p className="text-2xl font-black leading-none text-content">{log.quantity > 0 ? log.quantity : '??'}</p>
                                                </div>
                                            </div>

                                            {/* Details indicator */}
                                            {(log.prev_quantity !== null && log.new_quantity !== null && isAdmin) && (
                                                <div className="mt-4 flex gap-4 text-[8px] font-black uppercase tracking-widest opacity-20 border-t border-subtle pt-2 text-muted">
                                                    <span>Stock: {log.prev_quantity} → {log.new_quantity}</span>
                                                    {log.list_id && (
                                                        <span className="text-accent opacity-100 flex items-center gap-1 font-mono">
                                                            <Package size={8} /> LIST ID: {log.list_id.slice(-6).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {log.list_id && !isAdmin && (
                                                <div className="mt-4 flex gap-4 text-[8px] font-black uppercase tracking-widest opacity-40 border-t border-subtle pt-2 text-accent font-mono">
                                                    <Package size={8} className="translate-y-[1px]" /> SESIÓN DE PICKING: #{log.list_id.slice(-6).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Header Floating Action (Export) */}
            <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-3">
                {/* Email Test Button (Optional for manual trigger) */}
                <button
                    onClick={sendDailyEmail}
                    className="w-14 h-14 bg-surface text-muted border border-subtle rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all hover:bg-card hover:text-content"
                    title="Send Daily Email Now"
                >
                    <Mail size={24} />
                </button>

                <button
                    onClick={handleDownloadReport}
                    className="w-14 h-14 bg-content text-main rounded-full flex items-center justify-center shadow-2xl shadow-accent/20 hover:scale-110 active:scale-90 transition-all font-black"
                    title="Download Daily Report"
                >
                    <FileDown size={24} />
                </button>
            </div>
        </div>
    );
};
