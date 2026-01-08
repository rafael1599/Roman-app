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
    CheckCircle2
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const HistoryScreen = () => {
    const { undoAction } = useInventory();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL'); // 'ALL', 'MOVE', 'ADD', 'DEDUCT', 'DELETE'

    const fetchLogs = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('inventory_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (!error && data) {
            setLogs(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const filteredLogs = useMemo(() => {
        if (filter === 'ALL') return logs;
        return logs.filter(log => log.action_type === filter);
    }, [logs, filter]);

    const handleUndo = async (id) => {
        if (window.confirm('Are you sure you want to undo this action?')) {
            await undoAction(id);
            fetchLogs(); // Refresh
        }
    };

    const exportPDF = () => {
        const doc = jsPDF();

        // --- Consolidation Logic ---
        // Group by Date + SKU
        const dailySummary = {};

        logs.forEach(log => {
            const date = new Date(log.created_at).toLocaleDateString();
            const key = `${date}_${log.sku}`;

            if (!dailySummary[key]) {
                dailySummary[key] = {
                    date,
                    sku: log.sku,
                    movements: []
                };
            }
            dailySummary[key].movements.push(log);
        });

        // Net Change Logic: Start vs End
        const tableData = [];
        Object.values(dailySummary).forEach(group => {
            // Sort by time
            const sorted = group.movements.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            // For moves, find initial source and final destination
            const moves = sorted.filter(m => m.action_type === 'MOVE');
            if (moves.length > 0) {
                const initial = moves[0].from_location;
                const final = moves[moves.length - 1].to_location;

                // If Net Change is zero (returned to start), skip unless totally necessary
                if (initial === final) return;

                tableData.push([
                    group.date,
                    group.sku,
                    'MOVE',
                    `${initial} -> ${final}`,
                    moves.reduce((acc, m) => acc + m.quantity, 0)
                ]);
            }

            // For ADDS/DEDUCTS
            const others = sorted.filter(m => m.action_type !== 'MOVE');
            others.forEach(m => {
                tableData.push([
                    group.date,
                    group.sku,
                    m.action_type,
                    m.from_location || m.to_location,
                    m.quantity
                ]);
            });
        });

        doc.text('Inventory Movement Report', 14, 15);
        doc.autoTable({
            head: [['Date', 'SKU', 'Action', 'Location Flow', 'Qty']],
            body: tableData,
            startY: 20,
            theme: 'striped',
            headStyles: { fillStyle: '#000000' }
        });

        doc.save(`inventory_report_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const getActionIcon = (type) => {
        switch (type) {
            case 'MOVE': return <MoveIcon className="text-blue-400" size={16} />;
            case 'ADD': return <Plus className="text-green-400" size={16} />;
            case 'DEDUCT': return <Minus className="text-red-400" size={16} />;
            case 'DELETE': return <Trash2 className="text-neutral-500" size={16} />;
            default: return <Clock className="text-neutral-400" size={16} />;
        }
    };

    return (
        <div className="flex flex-col h-full bg-black text-white p-4">
            <header className="flex justify-between items-center mb-6 pt-4">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tighter">History</h1>
                    <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest">Audit Trail</p>
                </div>
                <button
                    onClick={exportPDF}
                    className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 transition-all flex items-center gap-2"
                >
                    <FileDown size={20} />
                    <span className="text-xs font-black uppercase tracking-wider">Report</span>
                </button>
            </header>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                {['ALL', 'MOVE', 'ADD', 'DEDUCT', 'DELETE'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${filter === f
                                ? 'bg-white text-black border-white'
                                : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                            }`}
                    >
                        {f === 'DEDUCT' ? 'Orders' : f}
                    </button>
                ))}
            </div>

            {/* Logs List */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-24">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-48 py-10 gap-3 opacity-20">
                        <RotateCcw className="animate-spin" />
                        <span className="text-xs font-black uppercase tracking-widest">Loading Logs...</span>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-20 opacity-20">
                        <p className="text-xs font-black uppercase tracking-widest">No activities found</p>
                    </div>
                ) : (
                    filteredLogs.map(log => (
                        <div
                            key={log.id}
                            className={`p-4 rounded-2xl border transition-all ${log.is_reversed
                                    ? 'bg-neutral-950 border-neutral-900 opacity-40 grayscale'
                                    : 'bg-neutral-900/50 border-neutral-800'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={`p-2 rounded-lg ${log.is_reversed ? 'bg-neutral-800' : 'bg-neutral-800/50'
                                        }`}>
                                        {getActionIcon(log.action_type)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-black uppercase tracking-tight">{log.sku}</p>
                                        <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                                            {new Date(log.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                {!log.is_reversed && log.action_type !== 'DELETE' && (
                                    <button
                                        onClick={() => handleUndo(log.id)}
                                        className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-all group"
                                        title="Undo Action"
                                    >
                                        <Undo2 size={16} className="group-active:scale-95 transition-transform" />
                                    </button>
                                )}
                                {log.is_reversed && (
                                    <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
                                        <RotateCcw size={10} />
                                        Undone
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-neutral-800/50">
                                {log.action_type === 'MOVE' ? (
                                    <div className="flex items-center gap-2 flex-1">
                                        <div className="bg-neutral-800 px-3 py-1.5 rounded-lg flex-1">
                                            <p className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em] mb-0.5">From</p>
                                            <p className="text-xs font-black">{log.from_location}</p>
                                        </div>
                                        <ArrowRight className="text-neutral-700" size={12} />
                                        <div className="bg-neutral-800 px-3 py-1.5 rounded-lg flex-1 border border-neutral-700/50">
                                            <p className="text-[8px] text-blue-500/50 font-black uppercase tracking-[0.2em] mb-0.5">To</p>
                                            <p className="text-xs font-black">{log.to_location}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1">
                                        <div className="bg-neutral-800 px-3 py-1.5 rounded-lg inline-block min-w-[100px]">
                                            <p className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em] mb-0.5">Location</p>
                                            <p className="text-xs font-black">{log.from_location || log.to_location}</p>
                                        </div>
                                    </div>
                                )}
                                <div className="text-right">
                                    <p className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em] mb-0.5">Quantity</p>
                                    <p className="text-xl font-black">{log.quantity}</p>
                                </div>
                            </div>

                            {/* Snapshots info if available */}
                            {(log.prev_quantity !== null || log.new_quantity !== null) && !log.is_reversed && (
                                <div className="mt-2 flex gap-4 opacity-50">
                                    <span className="text-[10px] font-bold">Was: {log.prev_quantity}</span>
                                    <span className="text-[10px] font-bold">Now: {log.new_quantity}</span>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
