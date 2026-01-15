import React, { useState, useEffect, useMemo } from 'react';
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
    Mail
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


export const HistoryScreen = () => {
    const { undoAction } = useInventory();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');
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
                    setLogs(prev => prev.map(log => log.id === payload.new.id ? payload.new : log));
                }
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    const filteredLogs = useMemo(() => {
        return logs
            .filter(log => filter === 'ALL' || log.action_type === filter)
            .filter(log => {
                const query = searchQuery.toLowerCase();
                return !searchQuery ||
                    log.sku?.toLowerCase().includes(query) ||
                    log.from_location?.toLowerCase().includes(query) ||
                    log.to_location?.toLowerCase().includes(query);
            });
    }, [logs, filter, searchQuery]);

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

    const handleUndo = async (id) => {
        if (window.confirm('Are you sure you want to undo this action?')) {
            await undoAction(id);
        }
    };

    const getActionTypeInfo = (type) => {
        switch (type) {
            case 'MOVE': return { icon: <MoveIcon size={14} />, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Relocate' };
            case 'ADD': return { icon: <Plus size={14} />, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Restock' };
            case 'DEDUCT': return { icon: <Minus size={14} />, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Pick' };
            case 'DELETE': return { icon: <Trash2 size={14} />, color: 'text-neutral-500', bg: 'bg-neutral-500/10', label: 'Remove' };
            default: return { icon: <Clock size={14} />, color: 'text-neutral-400', bg: 'bg-neutral-800', label: 'Update' };
        }
    };

    // --- Report & Automation Logic ---

    const generateDailyPDF = () => {
        const doc = new jsPDF();
        const todayStr = new Date().toLocaleDateString();

        doc.setFontSize(20);
        doc.text(`Daily Inventory Report - ${todayStr}`, 14, 22);

        doc.setFontSize(10);
        doc.text(`Generated at: ${new Date().toLocaleTimeString()}`, 14, 30);

        // Filter valid logs for today
        const todaysLogs = logs.filter(log => {
            const logDate = new Date(log.created_at);
            const today = new Date();
            return logDate.getDate() === today.getDate() &&
                logDate.getMonth() === today.getMonth() &&
                logDate.getFullYear() === today.getFullYear();
        });

        const tableData = todaysLogs.map(log => {
            let description = '';
            switch (log.action_type) {
                case 'MOVE':
                    description = `Relocated from ${log.from_location} to ${log.to_location}`;
                    break;
                case 'ADD':
                    description = `Restocked inventory in ${log.to_location || log.from_location || 'General'}`;
                    break;
                case 'DEDUCT':
                    description = `Picked stock from ${log.from_location || 'General'}`;
                    break;
                case 'DELETE':
                    description = `Removed item from ${log.from_location || 'Inventory'}`;
                    break;
                default:
                    description = `Updated record for ${log.from_location || log.to_location || '-'}`;
            }

            return [
                new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                log.sku,
                description,
                log.quantity
            ];
        });

        autoTable(doc, {
            startY: 40,
            head: [['Time', 'SKU', 'Activity Description', 'Qty']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] }, // Green-600
            columnStyles: {
                0: { cellWidth: 25 }, // Time
                1: { cellWidth: 35, fontStyle: 'bold' }, // SKU
                2: { cellWidth: 'auto' }, // Description
                3: { cellWidth: 20, halign: 'right', fontStyle: 'bold' } // Qty
            }
        });

        return doc;
    };

    const handleDownloadReport = () => {
        const doc = generateDailyPDF();
        doc.save(`inventory-report-${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const sendDailyEmail = async () => {
        try {
            console.log("Attempting to send daily email...");

            // Build simple HTML summary
            const todayStr = new Date().toLocaleDateString();
            const todaysLogs = logs.filter(log => {
                const logDate = new Date(log.created_at);
                const today = new Date();
                return logDate.toDateString() === today.toDateString();
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
                let description = '';
                const locationStyle = 'font-weight: 600; color: #111827;';
                const secondaryColor = '#6b7280';

                switch (log.action_type) {
                    case 'MOVE':
                        description = `Relocated from <span style="color:${secondaryColor}">${log.from_location}</span> to <span style="${locationStyle}">${log.to_location}</span>`;
                        break;
                    case 'ADD':
                        description = `Restocked inventory in <span style="${locationStyle}">${log.to_location || log.from_location || 'General'}</span>`;
                        break;
                    case 'DEDUCT':
                        description = `Picked stock from <span style="${locationStyle}">${log.from_location || 'General'}</span>`;
                        break;
                    case 'DELETE':
                        description = `Removed item from <span style="${locationStyle}">${log.from_location || 'Inventory'}</span>`;
                        break;
                    default:
                        description = `Updated record for <span style="${locationStyle}">${log.from_location || log.to_location || '-'}</span>`;
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
                alert(`Error sending email: ${JSON.stringify(data.error)}`);
                return;
            }

            console.log("Email sent successfully:", data);
            localStorage.setItem(`email_sent_${new Date().toDateString()}`, 'true');
            alert(`Daily report sent to rafaelukf@gmail.com`);

        } catch (err) {
            console.error("Failed to send email:", err);
            // Optionally alert user or just log
            alert("Failed to send daily email via Edge Function.");
        }
    };

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
    }, [logs]); // Dependency on logs so we have data to send

    return (
        <div className="flex flex-col h-full bg-black text-white p-4 max-w-2xl mx-auto w-full">
            <header className="flex justify-between items-end mb-8 pt-6">
                <div>
                    <h1 className="text-5xl font-black uppercase tracking-tighter leading-none">History</h1>
                    <p className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                        <Clock size={10} /> Live Activity Log
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchLogs}
                        className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 transition-all"
                        title="Refresh Logs"
                    >
                        <RotateCcw className={loading ? 'animate-spin' : ''} size={20} />
                    </button>
                </div>
            </header>

            {/* Search and Filters */}
            <div className="space-y-4 mb-8">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Search SKU or Location..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-neutral-900/50 border border-neutral-800/80 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-neutral-700"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {['ALL', 'MOVE', 'ADD', 'DEDUCT', 'DELETE'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${filter === f
                                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                                : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700'
                                }`}
                        >
                            {f === 'DEDUCT' ? 'Picking' : f}
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
                    <div className="text-center py-24 border-2 border-dashed border-neutral-900 rounded-[2.5rem]">
                        <Clock className="mx-auto mb-4 opacity-10" size={48} />
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-600">No matching activities</p>
                    </div>
                ) : (
                    Object.entries(groupedLogs).map(([date, items]) => (
                        <div key={date} className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 pl-1 flex items-center gap-2">
                                <Calendar size={12} /> {date}
                            </h3>
                            <div className="space-y-3">
                                {items.map(log => {
                                    const info = getActionTypeInfo(log.action_type);
                                    return (
                                        <div
                                            key={log.id}
                                            className={`group relative p-5 rounded-[2rem] border transition-all duration-300 hover:scale-[1.01] ${log.is_reversed
                                                ? 'bg-neutral-950 border-neutral-900 opacity-40 grayscale pointer-events-none'
                                                : 'bg-neutral-900/40 border-neutral-800/60 hover:border-neutral-700 hover:bg-neutral-900/60'
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
                                                        <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-wider">
                                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {log.performed_by || 'Unknown'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {!log.is_reversed && log.action_type !== 'DELETE' && (
                                                    <button
                                                        onClick={() => handleUndo(log.id)}
                                                        className="p-3 bg-neutral-900/50 hover:bg-white hover:text-black rounded-2xl transition-all shadow-xl"
                                                        title="Undo Action"
                                                    >
                                                        <Undo2 size={16} />
                                                    </button>
                                                )}

                                                {log.is_reversed && (
                                                    <span className="px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-full text-[7px] font-black uppercase tracking-widest text-neutral-500">
                                                        Reversed
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-5 flex items-center gap-3">
                                                {log.action_type === 'MOVE' ? (
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <div className="flex-1 px-3 py-2 bg-black/40 rounded-xl border border-neutral-800/50">
                                                            <p className="text-[7px] text-neutral-600 font-black uppercase tracking-widest mb-1">From</p>
                                                            <p className="text-[11px] font-bold text-neutral-400">{log.from_location}</p>
                                                        </div>
                                                        <ArrowRight size={12} className="text-neutral-700" />
                                                        <div className="flex-1 px-3 py-2 bg-blue-500/5 rounded-xl border border-blue-500/20">
                                                            <p className="text-[7px] text-blue-500/50 font-black uppercase tracking-widest mb-1">To</p>
                                                            <p className="text-[11px] font-black text-blue-400">{log.to_location}</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 px-4 py-2 bg-neutral-800/30 rounded-xl border border-neutral-800/50">
                                                        <p className="text-[7px] text-neutral-600 font-black uppercase tracking-widest mb-1">Location</p>
                                                        <p className="text-[11px] font-black text-neutral-300">{log.from_location || log.to_location || 'N/A'}</p>
                                                    </div>
                                                )}

                                                <div className="text-right px-4">
                                                    <p className="text-[7px] text-neutral-600 font-black uppercase tracking-widest mb-1">Qty</p>
                                                    <p className="text-2xl font-black leading-none">{log.quantity > 0 ? log.quantity : '??'}</p>
                                                </div>
                                            </div>

                                            {/* Details indicator */}
                                            {(log.prev_quantity !== null && log.new_quantity !== null) && (
                                                <div className="mt-4 flex gap-4 text-[8px] font-black uppercase tracking-widest opacity-20 border-t border-neutral-800/50 pt-2">
                                                    <span>Stock: {log.prev_quantity} → {log.new_quantity}</span>
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
                    className="w-14 h-14 bg-neutral-800 text-neutral-400 border border-neutral-700 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all hover:bg-neutral-700 hover:text-white"
                    title="Send Daily Email Now"
                >
                    <Mail size={24} />
                </button>

                <button
                    onClick={handleDownloadReport}
                    className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/20 hover:scale-110 active:scale-90 transition-all font-black"
                    title="Download Daily Report"
                >
                    <FileDown size={24} />
                </button>
            </div>
        </div>
    );
};
