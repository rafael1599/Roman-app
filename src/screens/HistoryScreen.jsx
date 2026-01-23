import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../hooks/useDebounce';
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
  Users,
} from 'lucide-react';
import { getUserColor, getUserBgColor } from '../utils/userUtils';
import toast from 'react-hot-toast';
// jspdf and autoTable are imported dynamically in handleDownloadReport
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { useConfirmation } from '../context/ConfirmationContext';

export const HistoryScreen = () => {
  const { undoAction, isDemoMode, demoLogs, resetDemo } = useInventory();
  const { isAdmin, profile, user: authUser } = useAuth();
  const { showError } = useError(); // Initialize useError
  const { showConfirmation } = useConfirmation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [userFilter, setUserFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('TODAY');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('inventory_logs')
        .select('*, picking_lists(order_number)')
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
      } else if (timeFilter === 'MONTH') {
        const lastMonth = new Date(startOfToday);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        query = query.gte('created_at', lastMonth.toISOString());
      } else {
        // ALL - Limit to 200 to avoid massive fetches
        query = query.limit(200);
      }

      const { data, error: sbError } = await query;

      if (sbError) throw sbError;

      // Flatten the structure for easier usage
      const formattedLogs = (data || []).map((log) => ({
        ...log,
        // Prioritize local order_number, fallback to joined data for legacy logs
        order_number: log.order_number || log.picking_lists?.order_number,
      }));

      setLogs(formattedLogs);
    } catch (err) {
      console.error('Fetch logs failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  // Real-time updates for logs
  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel('log_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inventory_logs' },
        (payload) => {
          // Check if it fits the current time filter before adding
          const logDate = new Date(payload.new.created_at);
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);

          if (timeFilter === 'YESTERDAY' && logDate >= startOfToday) return;

          setLogs((prev) => [payload.new, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inventory_logs' },
        (payload) => {
          setLogs((prev) =>
            prev.map((log) => (log.id === payload.new.id ? { ...log, ...payload.new } : log))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'inventory_logs' },
        (payload) => {
          setLogs((prev) => prev.filter((log) => log.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchLogs, timeFilter]);

  const workingLogs = useMemo(() => {
    if (isDemoMode) {
      // Combine real logs with demo logs, putting demo logs first
      // or just show demo logs. Let's show both but demo logs are "extra"
      return [...demoLogs, ...logs];
    }
    return logs;
  }, [isDemoMode, demoLogs, logs]);

  const uniqueUsers = useMemo(() => {
    const users = new Set(workingLogs.map((log) => log.performed_by).filter(Boolean));
    return Array.from(users).sort();
  }, [workingLogs]);

  const filteredLogs = useMemo(() => {
    return workingLogs
      .filter((log) => filter === 'ALL' || log.action_type === filter)
      .filter((log) => userFilter === 'ALL' || log.performed_by === userFilter)
      .filter((log) => {
        // If not admin, hide undone (reversed) actions to keep the view clean
        if (!isAdmin && log.is_reversed) return false;
        return true;
      })
      .filter((log) => {
        const query = debouncedSearch.toLowerCase();
        return (
          !debouncedSearch ||
          log.sku?.toLowerCase().includes(query) ||
          log.from_location?.toLowerCase().includes(query) ||
          log.to_location?.toLowerCase().includes(query) ||
          log.order_number?.toLowerCase().includes(query) ||
          (log.list_id && log.list_id.toLowerCase().includes(query))
        );
      });
  }, [workingLogs, filter, userFilter, searchQuery, isAdmin]);

  const groupedLogs = useMemo(() => {
    const groups = {};
    filteredLogs.forEach((log) => {
      const date = new Date(log.created_at);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      let dateLabel;
      if (date.toDateString() === today.toDateString()) dateLabel = 'Today';
      else if (date.toDateString() === yesterday.toDateString()) dateLabel = 'Yesterday';
      else
        dateLabel = date.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });

      if (!groups[dateLabel]) groups[dateLabel] = [];
      groups[dateLabel].push(log);
    });
    return groups;
  }, [filteredLogs]);

  const handleUndo = useCallback(
    async (id) => {
      showConfirmation(
        'Undo Action',
        'Are you sure you want to undo this action?',
        async () => {
          // Optimistic update
          setLogs((prev) =>
            prev.map((log) => (log.id === id ? { ...log, is_reversed: true } : log))
          );

          try {
            await undoAction(id);
          } catch (err) {
            console.error('Undo failed, rolling back state:', err);
            fetchLogs();
          }
        },
        null,
        'Undo'
      );
    },
    [undoAction]
  );

  const getActionTypeInfo = (type, log = {}) => {
    switch (type) {
      case 'MOVE':
        return {
          icon: <MoveIcon size={14} />,
          color: 'text-blue-500',
          bg: 'bg-blue-500/10',
          label: 'Relocate',
        };
      case 'ADD':
        return {
          icon: <Plus size={14} />,
          color: 'text-green-500',
          bg: 'bg-green-500/10',
          label: 'Restock',
        };
      case 'DEDUCT':
        const orderLabel = log.order_number
          ? `ORDER #${log.order_number}`
          : log.list_id
            ? `ORDER #${log.list_id.slice(-6).toUpperCase()}`
            : 'Manual Pick';
        return {
          icon: <Minus size={14} />,
          color: 'text-red-500',
          bg: 'bg-red-500/10',
          label: orderLabel,
        };
      case 'DELETE':
        return {
          icon: <Trash2 size={14} />,
          color: 'text-muted',
          bg: 'bg-surface',
          label: 'Remove',
        };
      case 'EDIT':
        return {
          icon: <Clock size={14} />,
          color: 'text-amber-500',
          bg: 'bg-amber-500/10',
          label: 'Update',
        };
      default:
        return {
          icon: <Clock size={14} />,
          color: 'text-muted',
          bg: 'bg-surface',
          label: log.action_type || 'Update',
        };
    }
  };

  // --- Report & Automation Logic ---

  const generateDailyPDF = useCallback(
    (jsPDF, autoTable) => {
      // 6x4 inches horizontal (landscape)
      const doc = new jsPDF({
        orientation: 'l',
        unit: 'in',
        format: [6, 4],
      });
      const todayStr = new Date().toLocaleDateString();
      const generatorName = profile?.full_name || authUser?.email || 'System';

      // Determine title based on filters
      let title = 'Inventory Report';
      if (filter !== 'ALL') {
        const labels = {
          MOVE: 'Movement',
          ADD: 'Restock',
          DEDUCT: 'Picking',
          DELETE: 'Removal',
        };
        title = `${labels[filter] || filter} Report`;
      }

      if (userFilter !== 'ALL') {
        title += ` (${userFilter})`;
      }

      // Title Section (Fixed to 16 as requested)
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(`${title}`, 0.2, 0.4);

      // Metadata Section
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text(`Date: ${todayStr} | Time: ${new Date().toLocaleTimeString()} | Period: ${timeFilter}`, 0.2, 0.58);
      doc.text(`Generated by: ${generatorName}`, 0.2, 0.72);

      if (searchQuery) {
        doc.setFontSize(7);
        doc.text(`Search: "${searchQuery}"`, 0.2, 0.85);
      }

      // Summary (Readability improvement)
      const stats = {
        total: filteredLogs.length,
        qty: filteredLogs.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0),
      };
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text(`Total SKU's: ${stats.total} | Total Qty: ${stats.qty}`, 4.0, 0.4, {
        align: 'right',
      });

      // Use filteredLogs instead of logs to respect UI filters
      const dataToExport = filteredLogs;

      const tableData = dataToExport.map((log) => {
        let description = '';
        const fromLoc = log.from_location || '';
        const toLoc = log.to_location || '';
        const performer = log.performed_by || 'Unknown';

        // Simplified warehouse logic for space
        const whInfo =
          log.from_warehouse && log.to_warehouse && log.from_warehouse !== log.to_warehouse
            ? ` [${log.from_warehouse}→${log.to_warehouse}]`
            : log.from_warehouse
              ? ` [${log.from_warehouse}]`
              : '';

        switch (log.action_type) {
          case 'MOVE':
            description = `${performer} moved from ${fromLoc} to ${toLoc}${whInfo}`;
            break;
          case 'ADD':
            description = `${performer} restocked at ${toLoc || fromLoc || 'Gen'}`;
            break;
          case 'DEDUCT':
            description = `${performer} picked at ${fromLoc || 'Gen'}`;
            break;
          case 'DELETE':
            description = `${performer} removed at ${fromLoc || 'Inv'}`;
            break;
          default:
            description = `${performer} updated record at ${fromLoc || toLoc || '-'}`;
        }

        return [
          new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          log.sku,
          description,
          log.quantity,
        ];
      });

      autoTable(doc, {
        startY: searchQuery ? 1.0 : 0.9,
        margin: { left: 0.2, right: 0.2, bottom: 0.2 },
        head: [['Time', 'SKU', 'Activity Detail', 'Qty']],
        body: tableData,
        theme: 'striped', // Zebra stripes for readability
        headStyles: {
          fillColor: [40, 40, 40], // Darker header for contrast
          textColor: [255, 255, 255],
          fontSize: 10,
          fontStyle: 'bold',
          cellPadding: 0.05,
        },
        styles: {
          fontSize: 9,
          cellPadding: 0.05,
          lineColor: [220, 220, 220],
          lineWidth: 0.005,
        },
        columnStyles: {
          0: { cellWidth: 0.65 }, // Time
          1: { cellWidth: 1.1, fontStyle: 'bold' }, // SKU
          2: { cellWidth: 'auto' }, // Activity
          3: { cellWidth: 0.5, halign: 'right', fontStyle: 'bold' }, // Qty
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
      });

      return doc;
    },
    [filteredLogs, filter, userFilter, timeFilter, searchQuery, profile, authUser]
  );

  const handleDownloadReport = useCallback(async () => {
    try {
      setLoading(true);
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = generateDailyPDF(jsPDF, autoTable);

      // Dynamic filename based on filter
      const dateStr = new Date().toISOString().split('T')[0];
      const filterLabel = filter === 'ALL' ? 'inventory' : filter.toLowerCase();
      const timeLabel = timeFilter.toLowerCase();
      doc.save(`${filterLabel}-report-${timeLabel}-${dateStr}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      showError('Error generating PDF report.', err.message);
    } finally {
      setLoading(false);
    }
  }, [generateDailyPDF]);

  const sendDailyEmail = useCallback(async () => {
    try {
      console.log('Attempting to send daily email...');

      const now = new Date();
      const todayStr = now.toLocaleDateString();
      const todayStrComp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const todaysLogs = logs.filter((log) => {
        if (!log.created_at) return false;
        // Business rule: Exclude undone actions from email summary
        if (log.is_reversed) return false;

        const logDate = new Date(log.created_at);
        const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
        return logDateStr === todayStrComp;
      });

      const moveCount = todaysLogs.filter((l) => l.action_type === 'MOVE').length;
      const pickCount = todaysLogs.filter((l) => l.action_type === 'DEDUCT').length;
      const addCount = todaysLogs.filter((l) => l.action_type === 'ADD').length;

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
                        ${todaysLogs
          .map((log) => {
            const locationStyle = 'font-weight: 600; color: #111827;';
            const secondaryColor = '#6b7280';

            const fromLoc = log.from_location
              ? `<span style="${locationStyle}">${log.from_location}</span> <span style="color:${secondaryColor}; font-size: 0.8em;">(${log.from_warehouse || 'N/A'})</span>`
              : '';
            const toLoc = log.to_location
              ? `<span style="${locationStyle}">${log.to_location}</span> <span style="color:${secondaryColor}; font-size: 0.8em;">(${log.to_warehouse || 'N/A'})</span>`
              : '';

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
          })
          .join('')}
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
          html: htmlContent,
        },
      });

      if (error) {
        console.error('Edge Function Invocation Error:', error);
        throw error;
      }

      // Check for functional error returned in body (status 200)
      if (data?.error) {
        console.error('Email Sending Error:', data.error);
        showError('Error sending email', JSON.stringify(data.error));
        return;
      }

      console.log('Email sent successfully:', data);
      localStorage.setItem(`email_sent_${new Date().toDateString()}`, 'true');
      toast.success(`Daily report sent to rafaelukf@gmail.com`);
    } catch (err) {
      console.error('Failed to send email:', err);
      // Optionally alert user or just log
      showError(
        'Failed to send daily email',
        err.message || 'Failed to send daily email via Edge Function.'
      );
    }
  }, [logs]);

  // OPTIMIZED: Removed duplicate polling - realtime subscription handles updates
  // Automated 6 PM Check (DISABLED - this caused duplicate updates)
  // If you need 6PM email automation, implement via Edge Function cron job instead
  /*
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
    */

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
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors"
            size={18}
          />
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
          {['ALL', 'MOVE', 'ADD', 'DEDUCT', 'DELETE'].map((f) => (
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
              ? 'bg-content text-main border-content shadow-lg'
              : 'bg-surface text-muted border-subtle hover:border-muted/30'
              }`}
          >
            All Users
          </button>
          {uniqueUsers.map((user) => (
            <button
              key={user}
              onClick={() => setUserFilter(user)}
              style={{
                borderColor: userFilter === user ? getUserColor(user) : undefined,
                color: userFilter === user ? 'white' : getUserColor(user),
                backgroundColor: userFilter === user ? getUserColor(user) : getUserBgColor(user),
              }}
              className={`px-4 py-2 rounded-full text-[10px] font-bold transition-all border shrink-0 flex items-center gap-2 ${userFilter === user ? 'shadow-lg' : 'hover:border-muted/30'}`}
            >
              <User size={10} />
              {user}
            </button>
          ))}
        </div>

        {/* Time Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide items-center">
          <div className="shrink-0 p-2 bg-surface/50 rounded-full border border-subtle">
            <Clock size={14} className="text-muted" />
          </div>
          {['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'ALL'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeFilter(tf)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${timeFilter === tf
                ? 'bg-accent border-accent/20 text-main shadow-lg shadow-accent/20'
                : 'bg-surface text-muted border-subtle hover:border-muted/30'
                }`}
            >
              {tf.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Logs List */}
      <div className="flex-1 overflow-y-auto space-y-8 pb-32">
        {loading && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
            <RotateCcw className="animate-spin" size={32} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Scanning blockchain...
            </span>
          </div>
        ) : error ? (
          <div className="p-8 bg-red-500/5 border border-red-500/20 rounded-3xl text-center">
            <AlertCircle className="mx-auto mb-3 text-red-500" size={32} />
            <p className="text-sm font-bold text-red-400 mb-1">Database Error</p>
            <p className="text-[10px] text-red-500/60 font-mono uppercase truncate">{error}</p>
            <button
              onClick={fetchLogs}
              className="mt-4 text-xs font-black uppercase text-red-500 hover:underline"
            >
              Retry Connection
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-24 border-2 border-dashed border-subtle rounded-[2.5rem]">
            <Clock className="mx-auto mb-4 opacity-10" size={48} />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">
              No matching activities
            </p>
          </div>
        ) : (
          Object.entries(groupedLogs).map(([date, items]) => (
            <div key={date} className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted pl-1 flex items-center gap-2">
                <Calendar size={12} /> {date}
              </h3>
              <div className="space-y-3">
                {items.map((log) => {
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
                              <span className="text-lg font-black tracking-tighter uppercase">
                                {log.sku}
                              </span>
                              <span
                                className={`text-[10px] font-black px-2 py-1 rounded-none border ${info.bg} ${info.color} border-current/20`}
                              >
                                {info.label}
                              </span>
                              {log.previous_sku && (
                                <span className="text-[8px] font-bold text-muted uppercase italic">
                                  (Was: {log.previous_sku})
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted font-bold uppercase tracking-wider">
                              {new Date(log.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              •{' '}
                              <span
                                style={{ color: getUserColor(log.performed_by) }}
                                className="font-black"
                              >
                                {log.performed_by || 'Unknown'}
                              </span>{' '}
                              {log.is_demo && <span className="text-accent ml-2">DEMO</span>}
                            </p>
                          </div>
                        </div>

                        {!log.is_reversed && isAdmin && (
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
                              <p className="text-[7px] text-muted font-black uppercase tracking-widest mb-1">
                                From
                              </p>
                              <div className="flex items-baseline gap-1">
                                <p className="text-[11px] font-bold text-muted">
                                  {log.from_location}
                                </p>
                                <span className="text-[6px] opacity-40 font-black uppercase">
                                  {log.from_warehouse}
                                </span>
                              </div>
                            </div>
                            <ArrowRight size={12} className="text-muted" />
                            <div className="flex-1 px-3 py-2 bg-accent/5 rounded-xl border border-accent/20">
                              <p className="text-[7px] text-accent/50 font-black uppercase tracking-widest mb-1">
                                To
                              </p>
                              <div className="flex items-baseline gap-1">
                                <p className="text-[11px] font-black text-accent">
                                  {log.to_location}
                                </p>
                                <span className="text-[6px] opacity-40 font-black uppercase text-accent">
                                  {log.to_warehouse}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 px-4 py-2 bg-surface/30 rounded-xl border border-subtle">
                            <p className="text-[7px] text-muted font-black uppercase tracking-widest mb-1">
                              Location
                            </p>
                            <div className="flex items-baseline gap-1">
                              <p className="text-[11px] font-black text-content">
                                {log.from_location || log.to_location || 'N/A'}
                              </p>
                              <span className="text-[6px] opacity-40 font-black uppercase">
                                {log.from_warehouse || log.to_warehouse || 'N/A'}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="text-right px-4">
                          <p className="text-[7px] text-muted font-black uppercase tracking-widest mb-1">
                            Qty
                          </p>
                          <p className="text-2xl font-black leading-none text-content">
                            {typeof log.quantity === 'number' ? log.quantity : '??'}
                          </p>
                        </div>
                      </div>

                      {/* Details indicator */}
                      {log.prev_quantity !== null && log.new_quantity !== null && isAdmin && (
                        <div className="mt-4 flex gap-4 text-[8px] font-black uppercase tracking-widest opacity-20 border-t border-subtle pt-2 text-muted">
                          <span>
                            Stock: {log.prev_quantity} → {log.new_quantity}
                          </span>
                          <span className="text-accent opacity-100 flex items-center gap-1 font-mono">
                            {/* Details moved to header */}
                          </span>
                        </div>
                      )}
                      {/* Order details removed from here as they are now in the header label */}
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
