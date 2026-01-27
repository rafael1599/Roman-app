import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient, useMutationState } from '@tanstack/react-query';
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
  Mail,
  User,
  Users,
  Settings,
} from 'lucide-react';
import { getUserColor, getUserBgColor } from '../utils/userUtils';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { useConfirmation } from '../context/ConfirmationContext';
import { useInventoryLogs } from '../hooks/useInventoryLogs';
import type { InventoryLog, LogActionTypeValue } from '../schemas/log.schema';

export const HistoryScreen = () => {
  useInventory(); // Ensure provider connection if needed, but don't bind unused vars
  const { isAdmin, profile, user: authUser } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { showError } = useError();
  const { showConfirmation } = useConfirmation();
  const { undoAction: undoLogAction } = useInventoryLogs();
  const [manualLoading, setManualLoading] = useState(false);

  const queryClient = useQueryClient();
  const mutationCache = queryClient.getMutationCache();
  const [filter, setFilter] = useState<LogActionTypeValue | 'ALL'>('ALL');
  const [userFilter, setUserFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('TODAY');
  const [searchQuery, setSearchQuery] = useState('');
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    data: logsData,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['inventory_logs', timeFilter],
    queryFn: async () => {
      let query = supabase
        .from('inventory_logs')
        .select('*, picking_lists(order_number)')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.neq('action_type', 'SYSTEM_RECONCILIATION');
      }

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
        query = query.limit(200);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((log: any) => ({
        ...log,
        order_number: log.order_number || log.picking_lists?.order_number,
      })) as InventoryLog[];
    },
    staleTime: 1000 * 60 * 1, // 1 minute
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  // --- OPTIMISTIC LOGS INJECTION (Hybrid Stream) ---
  // Use useMutationState to observe inventory mutations in a React-friendly way
  const pendingMutations = useMutationState({
    filters: {
      status: 'pending',
      predicate: (m) =>
        Array.isArray(m.options.mutationKey) &&
        m.options.mutationKey[0] === 'inventory'
    },
    select: (mutation) => ({
      variables: mutation.state.variables as any,
      status: mutation.state.status,
      // @ts-ignore
      isPaused: mutation.state.isPaused,
      mutationKey: mutation.options.mutationKey
    })
  });

  const optimisticLogs = useMemo(() => {
    return (pendingMutations || [])
      .map(m => {
        const vars = m.variables;
        const mutationKey = m.mutationKey;
        const mutationType = Array.isArray(mutationKey) ? mutationKey[1] : undefined;

        // Base log template
        const log: Partial<InventoryLog> & { isOptimistic: boolean } = {
          id: (vars?.optimistic_id || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`) as string,
          created_at: new Date().toISOString() as any,
          performed_by: profile?.full_name || authUser?.email || 'You',
          isOptimistic: true,
          is_reversed: false,
        };

        // Map specific mutation variables to Log format
        switch (mutationType) {
          case 'updateQuantity':
            log.sku = vars.sku;
            log.action_type = vars.finalDelta > 0 ? 'ADD' : 'DEDUCT';
            log.quantity_change = vars.finalDelta;
            log.from_warehouse = vars.finalDelta > 0 ? undefined : vars.resolvedWarehouse;
            log.from_location = vars.finalDelta > 0 ? undefined : vars.location;
            log.to_warehouse = vars.finalDelta > 0 ? vars.resolvedWarehouse : undefined;
            log.to_location = vars.finalDelta > 0 ? vars.location : undefined;
            log.order_number = vars.orderNumber;
            break;

          case 'moveItem':
            log.sku = vars.sourceItem?.sku;
            log.action_type = 'MOVE';
            log.quantity_change = -vars.qty; // Log the movement magnitude
            log.from_warehouse = vars.sourceItem?.warehouse;
            log.from_location = vars.sourceItem?.location;
            log.to_warehouse = vars.targetWarehouse;
            log.to_location = vars.targetLocation;
            break;

          case 'addItem':
            log.sku = vars.newItem?.sku;
            log.action_type = 'ADD';
            log.quantity_change = vars.newItem?.quantity;
            log.to_warehouse = vars.warehouse;
            log.to_location = vars.newItem?.location;
            break;

          case 'deleteItem':
            log.sku = vars.sku;
            log.action_type = 'DELETE';
            log.from_warehouse = vars.warehouse;
            break;

          case 'updateItem':
            log.sku = vars.updatedFormData?.sku;
            log.action_type = 'EDIT';
            log.previous_sku = vars.originalItem?.sku !== vars.updatedFormData?.sku ? vars.originalItem?.sku : undefined;
            break;

          case 'undo':
            // The mutation variable for 'undo' is the logId string
            log.id = vars;
            log.action_type = 'UNDO' as any;
            break;
        }

        return log as InventoryLog & { isOptimistic: boolean };
      });
  }, [mutationCache, profile, authUser]);

  // Combine real and optimistic logs with defensive handling
  const logs = useMemo(() => {
    const serverLogs = logsData || [];

    // Defensive: If we're offline and have no cached data, only show optimistic logs
    if (!logsData && optimisticLogs.length > 0) {
      return optimisticLogs;
    }

    // Normal case: merge and deduplicate
    const seenIds = new Set();
    const combined: (InventoryLog & { isOptimistic: boolean })[] = [];

    // Process all logs
    [...optimisticLogs, ...serverLogs].forEach((l) => {
      // Deduplicate by ID but keep optimistic flags
      if (!l.id || seenIds.has(l.id)) return;
      seenIds.add(l.id);
      combined.push(l as any);
    });

    // Special handling for undo: if we have a pending undo mutation, 
    // mark the targeted log as reversed/optimistic in the UI
    const pendingUndoIds = optimisticLogs
      .filter(m => (m as any).action_type === 'UNDO')
      .map(m => m.id);

    const finalLogs = combined.map(l => {
      if (pendingUndoIds.includes(l.id)) {
        return { ...l, is_reversed: true, isOptimistic: true };
      }
      return l;
    });

    // Safe sort with fallback
    return finalLogs.sort((a, b) => {
      const dateA = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [logsData, optimisticLogs]);

  const hasNoData = !loading && logs.length === 0;

  const fetchLogs = useCallback(() => {
    console.log(`[FORENSIC][CACHE][REFETCH_TRIGGER] ${new Date().toISOString()}`);
    refetch();
  }, [refetch]);

  // Network & Cache Monitoring
  useEffect(() => {
    const handleOnline = () => {
      console.log(`[FORENSIC][NETWORK] ${new Date().toISOString()} - ONLINE detected`);
      setIsOnline(true);
    };
    const handleOffline = () => {
      console.log(`[FORENSIC][NETWORK] ${new Date().toISOString()} - OFFLINE detected`);
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (logsData) {
      console.log(`[FORENSIC][CACHE][LOGS_UPDATE] ${new Date().toISOString()} - Size: ${logsData.length}`);
    }
  }, [logsData]);

  const error = queryError ? (queryError as any).message : null;

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimeout: NodeJS.Timeout;

    const setupSubscription = () => {
      if (channel) {
        supabase.removeChannel(channel);
      }

      console.log(`[FORENSIC][REALTIME][LOGS_INIT] ${new Date().toISOString()} - Setting up channel log_updates`);

      channel = supabase
        .channel('log_updates')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'inventory_logs' },
          (payload) => {
            console.log(`[FORENSIC][REALTIME][LOGS_EVENT] ${new Date().toISOString()} - INSERT, SKU: ${payload.new?.sku}`);
            queryClient.invalidateQueries({ queryKey: ['inventory_logs'] });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'inventory_logs' },
          (payload) => {
            console.log(`[FORENSIC][REALTIME][LOGS_EVENT] ${new Date().toISOString()} - UPDATE, SKU: ${payload.new?.sku}`);
            queryClient.invalidateQueries({ queryKey: ['inventory_logs'] });
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'inventory_logs' },
          (payload) => {
            console.log(`[FORENSIC][REALTIME][LOGS_EVENT] ${new Date().toISOString()} - DELETE, ID: ${payload.old?.id}`);
            queryClient.invalidateQueries({ queryKey: ['inventory_logs'] });
          }
        )
        .subscribe((status, err) => {
          console.log(`[FORENSIC][REALTIME][LOGS_STATUS] ${new Date().toISOString()} - Status: ${status}`);

          if (err) {
            console.error(`[FORENSIC][REALTIME][LOGS_ERROR] ${new Date().toISOString()}`, err);
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`[FORENSIC][REALTIME][LOGS_RETRY] ${new Date().toISOString()} - Channel died, retrying in 5s...`);
            if (channel) supabase.removeChannel(channel);
            clearTimeout(retryTimeout);
            retryTimeout = setTimeout(setupSubscription, 5000);
          }
        });
    };

    setupSubscription();

    return () => {
      console.log(`[FORENSIC][REALTIME][LOGS_CLEANUP] ${new Date().toISOString()}`);
      if (channel) supabase.removeChannel(channel);
      clearTimeout(retryTimeout);
    };
  }, [queryClient]);

  const uniqueUsers = useMemo(() => {
    const users = new Set(logs.map((log) => log.performed_by).filter(Boolean));
    return Array.from(users).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => filter === 'ALL' || log.action_type === filter)
      .filter((log) => userFilter === 'ALL' || log.performed_by === userFilter)
      .filter((log) => {
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
  }, [logs, filter, userFilter, debouncedSearch, isAdmin]);

  const groupedLogs = useMemo(() => {
    const groups: Record<string, InventoryLog[]> = {};
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
    async (id: string) => {
      if (undoingId) return;

      showConfirmation(
        'Undo Action',
        'Are you sure you want to undo this action?',
        async () => {
          try {
            setUndoingId(id);
            // Non-blocking call to support offline queueing
            await undoLogAction(id);
            // Implicit feedback via optimistic UI (badge)
          } catch (err: any) {
            // Check if it's a network error (meant to be queued)
            const isOffline = !navigator.onLine || err?.message?.includes('fetch') || err?.message?.includes('disconnected');

            if (!isOffline) {
              console.error('Undo failed:', err);
              toast.error(`Error: ${err.message}`);
              await fetchLogs();
            }
          } finally {
            setUndoingId(null);
          }
        },
        () => setUndoingId(null),
        'Undo'
      );
    },
    [undoLogAction, fetchLogs, showConfirmation, undoingId]
  );

  const getActionTypeInfo = (type: LogActionTypeValue, log: InventoryLog) => {
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
      case 'SYSTEM_RECONCILIATION':
        return {
          icon: <Settings size={14} />,
          color: 'text-purple-500',
          bg: 'bg-purple-500/10',
          label: 'System Sync (Recon)',
        };
      default:
        return {
          icon: <Clock size={14} />,
          color: 'text-muted',
          bg: 'bg-surface',
          label: (type as string) || 'Update',
        };
    }
  };

  const generateDailyPDF = useCallback(
    (jsPDF: any, autoTable: any) => {
      const doc = new jsPDF({
        orientation: 'l',
        unit: 'in',
        format: [6, 4],
      });
      const todayStr = new Date().toLocaleDateString();
      const generatorName = profile?.full_name || authUser?.email || 'System';

      let title = 'Inventory Report';
      if (filter !== 'ALL') {
        const labels: Record<string, string> = {
          MOVE: 'Movement',
          ADD: 'Restock',
          DEDUCT: 'Picking',
          DELETE: 'Removal',
          SYSTEM_RECONCILIATION: 'Reconciliation',
        };
        title = `${labels[filter] || filter} Report`;
      }

      if (userFilter !== 'ALL') {
        title += ` (${userFilter})`;
      }

      doc.setFont('times', 'bold');
      doc.setFontSize(16);
      doc.text(`${title}`, 0.2, 0.4);

      const stats = {
        total: filteredLogs.length,
        qty: filteredLogs.reduce((acc, l) => acc + Math.abs(Number(l.quantity_change) || 0), 0),
      };

      const tableData = filteredLogs.map((log) => {
        let description = '';
        const fromLoc = log.from_location || '';
        const toLoc = log.to_location || '';
        const performer = log.performed_by || 'Unknown';

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
          case 'SYSTEM_RECONCILIATION':
            description = `System reconciliation by ${performer}`;
            break;
          default:
            description = `${performer} updated record at ${fromLoc || toLoc || '-'}`;
        }

        return [
          new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          log.sku,
          description,
          Math.abs(log.quantity_change),
        ];
      });

      autoTable(doc, {
        startY: 0.6,
        margin: { left: 0.2, right: 0.2, bottom: 0.7 },
        head: [['Time', 'SKU', 'Activity Detail', 'Qty']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [40, 40, 40],
          textColor: [255, 255, 255],
          font: 'times',
          fontSize: 12,
          fontStyle: 'bold',
          cellPadding: 0.08,
        },
        styles: {
          font: 'times',
          fontSize: 12,
          cellPadding: 0.08,
          lineColor: [220, 220, 220],
          lineWidth: 0.005,
          overflow: 'linebreak',
        },
        columnStyles: {
          0: { cellWidth: 0.8 },
          1: { cellWidth: 1.2, fontStyle: 'bold' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 0.6, halign: 'right', fontStyle: 'bold' },
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
        didDrawPage: () => {
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();

          doc.setFont('times', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(100, 100, 100);

          const footerLine1 = `Resumen: Total SKU's: ${stats.total} | Total Qty: ${stats.qty}`;
          const footerLine2 = `Date: ${todayStr} | Time: ${new Date().toLocaleTimeString()} | Period: ${timeFilter} | Generated by: ${generatorName}`;

          doc.text(footerLine1, 0.2, pageHeight - 0.4);
          doc.text(footerLine2, 0.2, pageHeight - 0.2);
        },
      });

      return doc;
    },
    [filteredLogs, filter, userFilter, timeFilter, searchQuery, profile, authUser]
  );

  const handleDownloadReport = useCallback(async () => {
    try {
      setManualLoading(true);
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = generateDailyPDF(jsPDF, autoTable);

      const dateStr = new Date().toISOString().split('T')[0];
      const filterLabel = filter === 'ALL' ? 'inventory' : filter.toLowerCase();
      const timeLabel = timeFilter.toLowerCase();
      doc.save(`${filterLabel}-report-${timeLabel}-${dateStr}.pdf`);
    } catch (err: any) {
      console.error('Failed to generate PDF:', err);
      showError('Error generating PDF report.', err.message);
    } finally {
      setManualLoading(false);
    }
  }, [generateDailyPDF, filter, timeFilter, showError]);

  const sendDailyEmail = useCallback(async () => {
    try {
      console.log('Attempting to send daily email...');

      const now = new Date();
      const todayStr = now.toLocaleDateString();
      const todayStrComp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const todaysLogs = logs.filter((log) => {
        if (!log.created_at) return false;
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
              case 'SYSTEM_RECONCILIATION':
                description = `System reconciliation audit`;
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
                                        ${Math.abs(log.quantity_change || 0)}
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

      if (data?.error) {
        console.error('Email Sending Error:', data.error);
        showError('Error sending email', JSON.stringify(data.error));
        return;
      }

      console.log('Email sent successfully:', data);
      localStorage.setItem(`email_sent_${new Date().toDateString()}`, 'true');
      toast.success(`Daily report sent to rafaelukf@gmail.com`);
    } catch (err: any) {
      console.error('Failed to send email:', err);
      showError(
        'Failed to send daily email',
        err.message || 'Failed to send daily email via Edge Function.'
      );
    }
  }, [logs, showError]);

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
          <button
            onClick={fetchLogs}
            className="p-3 bg-surface border border-subtle rounded-2xl hover:opacity-80 transition-all text-content"
            title="Refresh Logs"
          >
            <RotateCcw className={loading || manualLoading ? 'animate-spin' : ''} size={20} />
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
              onClick={() => setFilter(f as any)}
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
        ) : hasNoData ? (
          <div className="text-center py-24 border-2 border-dashed border-subtle rounded-[2.5rem]">
            <AlertCircle className="mx-auto mb-4 opacity-20" size={48} />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-muted mb-2">
              No history available
            </p>
            {!isOnline && (
              <p className="text-[10px] text-muted/60 font-medium italic">
                Connect to internet to load history
              </p>
            )}
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
                      className={`group relative p-5 rounded-[2rem] border transition-all duration-300 hover:scale-[1.01] ${log.is_reversed || (log as any).isOptimistic
                        ? 'bg-main border-subtle'
                        : 'bg-surface/40 border-subtle hover:border-accent/30 hover:bg-surface/60'
                        } ${(log as any).isOptimistic ? 'opacity-60 border-dashed' : ''} ${log.is_reversed ? 'opacity-40 grayscale pointer-events-none' : ''}`}
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
                              {(log as any).isOptimistic && (
                                <span className="text-[8px] font-black bg-accent/20 text-accent px-2 py-1 flex items-center gap-1">
                                  <Clock size={8} className="animate-pulse" /> PENDING SYNC
                                </span>
                              )}
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
                              </span>
                            </p>
                          </div>
                        </div>

                        {!log.is_reversed && isAdmin && (
                          <button
                            onClick={() => handleUndo(log.id)}
                            disabled={(log as any).isOptimistic || undoingId === log.id}
                            className={`p-3 bg-surface border border-subtle rounded-2xl transition-all shadow-xl text-content ${(log as any).isOptimistic || undoingId === log.id
                              ? 'opacity-20 cursor-not-allowed scale-90'
                              : 'hover:bg-content hover:text-main'
                              }`}
                            title={(log as any).isOptimistic ? "Syncing..." : undoingId === log.id ? "Undoing..." : "Undo Action"}
                          >
                            {undoingId === log.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-content border-t-transparent" />
                            ) : (
                              <Undo2 size={16} />
                            )}
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
                            {typeof log.quantity_change === 'number' ? Math.abs(log.quantity_change) : '??'}
                          </p>
                        </div>
                      </div>

                      {log.prev_quantity !== null && log.new_quantity !== null && isAdmin && (
                        <div className="mt-4 flex gap-4 text-[8px] font-black uppercase tracking-widest opacity-20 border-t border-subtle pt-2 text-muted">
                          <span>
                            Stock: {log.prev_quantity} → {log.new_quantity}
                          </span>
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

      <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-3">
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
