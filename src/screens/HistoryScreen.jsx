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
    Filter
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
            const { data, error: sbError } = await supabase
                .from('inventory_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

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
                    setLogs(prev => [payload.new, ...prev].slice(0, 100));
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
            // Real-time will handle the UI update if marks as reversed
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

    return (
        <div className="flex flex-col h-full bg-black text-white p-4 max-w-2xl mx-auto w-full">
            <header className="flex justify-between items-end mb-8 pt-6">
                <div>
                    <h1 className="text-5xl font-black uppercase tracking-tighter leading-none">History</h1>
                    <p className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                        <Clock size={10} /> Live Activity Log
                    </p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 transition-all"
                >
                    <RotateCcw className={loading ? 'animate-spin' : ''} size={20} />
                </button>
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
            <div className="fixed bottom-24 right-4 z-50">
                <button
                    onClick={() => { }} // Placeholder for pdf export
                    className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/20 hover:scale-110 active:scale-90 transition-all font-black"
                >
                    <FileDown size={24} />
                </button>
            </div>
        </div>
    );
};
