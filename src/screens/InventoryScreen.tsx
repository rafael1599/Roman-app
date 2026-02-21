import { useState, useMemo, useEffect, useCallback } from 'react';
import { useInventory } from '../hooks/InventoryProvider';
import { useViewMode } from '../context/ViewModeContext';
import { SearchInput } from '../components/ui/SearchInput.tsx';
import { useDebounce } from '../hooks/useDebounce';
import { InventoryCard } from '../features/inventory/components/InventoryCard';
import { InventoryModal } from '../features/inventory/components/InventoryModal';
import CamScanner from '../features/smart-picking/components/CamScanner';
import { naturalSort } from '../utils/sortUtils';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Warehouse from 'lucide-react/dist/esm/icons/warehouse';
import Mail from 'lucide-react/dist/esm/icons/mail'; // Added Mail icon
import { MovementModal } from '../features/inventory/components/MovementModal';
import { CapacityBar } from '../components/ui/CapacityBar.tsx';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import FileDown from 'lucide-react/dist/esm/icons/file-down';

import { usePickingSession } from '../context/PickingContext';
import { useAuth } from '../context/AuthContext';
import { useLocationManagement } from '../hooks/useLocationManagement';
import LocationEditorModal from '../features/warehouse-management/components/LocationEditorModal';
import { useError } from '../context/ErrorContext';
import { useConfirmation } from '../context/ConfirmationContext';
import { SessionInitializationModal } from '../features/picking/components/SessionInitializationModal';
import { InventoryItemWithMetadata } from '../schemas/inventory.schema';
import { Location } from '../schemas/location.schema';
import { supabase } from '../lib/supabase';

const SEARCHING_MESSAGE = (
  <div className="py-20 text-center text-muted font-bold uppercase tracking-widest animate-pulse">
    Searching Inventory...
  </div>
);

const NoInventoryFound = ({ onClear }: { onClear: () => void }) => (
  <div className="text-center text-muted mt-20 py-20 border-2 border-dashed border-subtle rounded-3xl">
    <Warehouse className="mx-auto mb-4 opacity-20" size={48} />
    <p className="text-xl font-black uppercase tracking-widest opacity-30 mb-6">
      No inventory found
    </p>
    <button
      onClick={onClear}
      className="px-6 py-2.5 bg-accent text-white font-black uppercase tracking-widest rounded-xl text-xs active:scale-95 transition-all shadow-lg shadow-accent/20"
    >
      Clear Search
    </button>
  </div>
);

export const InventoryScreen = () => {
  const {
    inventoryData,
    locationCapacities,
    updateQuantity,
    addItem,
    updateItem,
    moveItem,
    deleteItem,
    loading,
    syncFilters,
    showInactive,
    setShowInactive,
  } = useInventory();

  const [localSearch, setLocalSearch] = useState('');

  // Auto-scroll to top when searching to ensure results are visible
  useEffect(() => {
    if (localSearch) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [localSearch]);
  const debouncedSearch = useDebounce(localSearch, 300);

  // Sync filters with provider for Context-Aware Realtime updates
  useEffect(() => {
    syncFilters({ search: debouncedSearch, showInactive });
  }, [debouncedSearch, showInactive, syncFilters]);

  // Client-side filtering and pagination logic (by location)
  const [displayLocationCount, setDisplayLocationCount] = useState(50);

  const filteredInventory = useMemo(() => {
    const s = debouncedSearch.toLowerCase().trim();
    return inventoryData.filter((item) => {
      // Show only active items unless showInactive is true
      if (!showInactive && item.is_active === false) return false;

      if (!s) return true;

      // Multi-field search
      return (
        (item.sku || '').toLowerCase().includes(s) ||
        (item.location || '').toLowerCase().includes(s) ||
        (item.sku_note || '').toLowerCase().includes(s) ||
        (item.warehouse || '').toLowerCase().includes(s)
      );
    });
  }, [inventoryData, debouncedSearch]);

  const isLoading = loading;

  const allGroupedData = useMemo(() => {
    const groups: Record<
      string,
      Record<string, { items: typeof filteredInventory; locationId?: string | null }>
    > = {};

    // First pass: Group by Warehouse + Location
    filteredInventory.forEach((item) => {
      const wh = item.warehouse || 'UNKNOWN';
      const locName = item.location || 'Unknown Location';

      if (!groups[wh]) groups[wh] = {};
      if (!groups[wh][locName]) {
        groups[wh][locName] = {
          items: [],
          locationId: item.location_id,
        };
      }

      groups[wh][locName].items.push(item);
      if (item.location_id && !groups[wh][locName].locationId) {
        groups[wh][locName].locationId = item.location_id;
      }
    });

    // Second pass: Consolidate items within each location by SKU
    Object.keys(groups).forEach(wh => {
      Object.keys(groups[wh]).forEach(loc => {
        const consolidated: Record<string, InventoryItemWithMetadata> = {};

        groups[wh][loc].items.forEach(item => {
          const skuKey = item.sku.toUpperCase().trim();

          if (!consolidated[skuKey]) {
            consolidated[skuKey] = { ...item };
          } else {
            // MERGE Logic
            const existing = consolidated[skuKey];

            // Prefer a 'real' ID over an optimistic one if both exist,
            // but keep the local flag if either is local.
            const isExistingTemp = (typeof existing.id === 'string' && (existing.id.startsWith('add-') || existing.id.startsWith('move-'))) ||
              (typeof existing.id === 'number' && existing.id < 0);
            const isItemReal = typeof item.id === 'number' && item.id > 0;

            if (isExistingTemp && isItemReal) {
              existing.id = item.id;
            }

            existing.quantity = (existing.quantity || 0) + (item.quantity || 0);

            // Merge notes if they differ
            if (item.sku_note && item.sku_note !== existing.sku_note) {
              existing.sku_note = existing.sku_note
                ? `${existing.sku_note} | ${item.sku_note}`
                : item.sku_note;
            }

            // Sync metadata if missing
            if (!existing.sku_metadata && item.sku_metadata) {
              existing.sku_metadata = item.sku_metadata;
            }

            // Preservation of flags
            if (item._lastUpdateSource === 'local') {
              existing._lastUpdateSource = 'local';
              existing._lastLocalUpdateAt = Math.max(existing._lastLocalUpdateAt || 0, item._lastLocalUpdateAt || 0);
            }
          }
        });

        let consolidatedItems = Object.values(consolidated);

        // Filter out zero-quantity items unless showing inactive
        if (!showInactive) {
          consolidatedItems = consolidatedItems.filter(item => item.quantity > 0);
        }

        groups[wh][loc].items = consolidatedItems;
      });
    });

    return groups;
  }, [filteredInventory, showInactive]);

  const allSortedWarehouses = useMemo(() => {
    const warehouses = Object.keys(allGroupedData);
    return warehouses.sort((a, b) => {
      if (a === 'LUDLOW') return -1;
      if (b === 'LUDLOW') return 1;
      return a.localeCompare(b);
    });
  }, [allGroupedData]);

  const allLocationBlocks = useMemo(() => {
    return allSortedWarehouses.flatMap((wh) =>
      Object.keys(allGroupedData[wh])
        .sort(naturalSort)
        .map((location) => ({
          wh,
          location,
          items: allGroupedData[wh][location].items,
          locationId: allGroupedData[wh][location].locationId,
        }))
        .filter(block => block.items.length > 0) // Remove empty locations from view
    );
  }, [allSortedWarehouses, allGroupedData]);

  const locationBlocks = useMemo(() => {
    return allLocationBlocks.slice(0, displayLocationCount);
  }, [allLocationBlocks, displayLocationCount]);

  const hasNextPage = displayLocationCount < allLocationBlocks.length;
  const remaining = Math.max(0, allLocationBlocks.length - locationBlocks.length);

  const loadMore = useCallback(() => {
    setDisplayLocationCount((prev) => prev + 50);
  }, []);

  // Scroll to top when search changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setDisplayLocationCount(50); // Reset pagination on search
  }, [debouncedSearch]);

  const { viewMode, isSearching } = useViewMode(); // 'stock' | 'picking'

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemWithMetadata | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedWarehouseForAdd, setSelectedWarehouseForAdd] = useState('LUDLOW');
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [locationBeingEdited, setLocationBeingEdited] = useState<Location | any>(null);

  const { isAdmin, user: authUser, profile } = useAuth();
  const { showError } = useError();
  const { showConfirmation } = useConfirmation();
  const {
    locations: allMappedLocations,
    createLocation,
    updateLocation,
    deactivateLocation,
  } = useLocationManagement();


  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Calculate stats for the filtered view
  const filteredStats = useMemo(() => {
    const uniqueSkus = new Set<string>();
    let totalQty = 0;

    allLocationBlocks.forEach(block => {
      block.items.forEach(item => {
        uniqueSkus.add(item.sku);
        totalQty += item.quantity;
      });
    });

    return { totalSkus: uniqueSkus.size, totalQuantity: totalQty };
  }, [allLocationBlocks]);

  const handleDownloadView = useCallback(async () => {
    if (allLocationBlocks.length === 0) {
      toast.error('No inventory to download');
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF({ orientation: 'p', unit: 'in', format: [8.5, 11] });
      const todayStr = new Date().toLocaleDateString();
      const generatorName = profile?.full_name || authUser?.email || 'System';

      doc.setFont('times', 'bold');
      doc.setFontSize(16);
      doc.text('Stock View Report', 0.5, 0.5);

      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      doc.text(`Generated by: ${generatorName}`, 0.5, 0.7);
      doc.text(`Date: ${todayStr}`, 0.5, 0.9);

      const filterDesc = [
        localSearch ? `Search: "${localSearch}"` : '',
        showInactive ? 'Including Inactive/Deleted' : ''
      ].filter(Boolean).join(' | ');

      if (filterDesc) {
        doc.text(`Filters: ${filterDesc}`, 0.5, 1.1);
      }

      doc.text(`Total SKUs: ${filteredStats.totalSkus}`, 6.0, 0.7);
      doc.text(`Total Qty: ${filteredStats.totalQuantity}`, 6.0, 0.9);

      const tableData = allLocationBlocks.flatMap(block =>
        block.items.map(item => [
          item.sku,
          item.warehouse || '-',
          item.location || 'Gen',
          item.quantity.toString(),
          item.sku_note || '',
        ])
      );

      (doc as any).autoTable({
        startY: filterDesc ? 1.3 : 1.1,
        head: [['SKU', 'Warehouse', 'Location', 'Qty', 'Note']],
        body: tableData,
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 0.05 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 1.5, fontStyle: 'bold' },
          1: { cellWidth: 1.2 },
          2: { cellWidth: 1.2 },
          3: { cellWidth: 0.8, halign: 'right' },
          4: { cellWidth: 'auto' },
        },
        margin: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
      });

      doc.save(`Stock_Report_${todayStr.replace(/\//g, '-')}.pdf`);
      toast.success('Report downloaded');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [allLocationBlocks, profile, authUser, localSearch, showInactive, filteredStats]);

  // Picking Mode State
  const {
    cartItems,
    setCartItems,
    addToCart,
    getAvailableStock,
    onStartSession,
    sessionMode,
  } = usePickingSession();

  const [showScanner, setShowScanner] = useState(false);

  // --- Stock Mode Handlers ---
  const handleAddItem = useCallback((warehouse = 'LUDLOW') => {
    setModalMode('add');
    setSelectedWarehouseForAdd(warehouse);
    setEditingItem(null);
    setIsModalOpen(true);
  }, []);

  const handleEditItem = useCallback((item: InventoryItemWithMetadata) => {
    setModalMode('edit');
    setEditingItem(item);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback(() => {
    if (editingItem) {
      deleteItem(editingItem.warehouse, editingItem.sku, editingItem.location);
    }
  }, [editingItem, deleteItem]);

  const saveItem = useCallback(
    async (formData: any) => {
      const targetWarehouse = formData.warehouse;
      if (modalMode === 'add') {
        return await addItem(targetWarehouse, formData);
      } else if (editingItem) {
        return await updateItem(editingItem, formData);
      }
    },
    [modalMode, addItem, updateItem, editingItem]
  );

  const handleMoveStock = useCallback(
    async (moveData: { sourceItem: InventoryItemWithMetadata; targetWarehouse: 'LUDLOW' | 'ATS'; targetLocation: string; quantity: number }) => {
      try {
        await moveItem(
          moveData.sourceItem,
          moveData.targetWarehouse,
          moveData.targetLocation,
          moveData.quantity
        );
        toast.success('Stock successfully moved!');
      } catch (err: any) {
        console.error('Error moving stock:', err);
        showError('Move failed', err.message);
      }
    },
    [moveItem, showError]
  );

  const handleQuickMove = useCallback((item: InventoryItemWithMetadata) => {
    setEditingItem(item);
    setIsMovementModalOpen(true);
  }, []);

  const handleOpenLocationEditor = useCallback(
    (warehouse: string, locationName: string, locationId?: string | null) => {
      if (!isAdmin || viewMode !== 'stock') return;
      let loc = null;
      if (locationId) {
        loc = allMappedLocations.find((l) => l.id === locationId);
      }
      if (!loc) {
        loc = allMappedLocations.find(
          (l) =>
            l.warehouse === warehouse && l.location.toLowerCase() === locationName.toLowerCase()
        );
      }
      if (loc) {
        setLocationBeingEdited(loc);
      } else {
        setLocationBeingEdited({
          warehouse,
          location: locationName,
          max_capacity: 550,
          zone: 'UNASSIGNED',
          picking_order: 999,
          isNew: true,
        });
      }
    },
    [isAdmin, viewMode, allMappedLocations]
  );

  const handleSaveLocation = useCallback(
    async (formData: any) => {
      let result;
      if (locationBeingEdited?.isNew) {
        const { isNew, ...dataToCreate } = formData;
        result = await createLocation(dataToCreate);
      } else {
        result = await updateLocation(locationBeingEdited.id, formData);
      }

      if (result.success) {
        setLocationBeingEdited(null);
        window.location.reload();
      } else {
        showError('Error saving location', result.error);
      }
    },
    [locationBeingEdited, createLocation, updateLocation, showError]
  );

  const handleDeleteLocation = useCallback(
    async (id: string) => {
      if (locationBeingEdited?.isNew) {
        const totalUnits = inventoryData
          .filter(
            (i) =>
              i.warehouse === locationBeingEdited.warehouse &&
              i.location === locationBeingEdited.location
          )
          .reduce((sum, i) => sum + (i.quantity || 0), 0);

        const confirmMsg = `This is a "ghost" location (it only exists as text on ${totalUnits} inventory units). 
Do you want to PERMANENTLY DELETE all these products so the location disappears?`;

        showConfirmation(
          'Delete Ghost Location',
          confirmMsg,
          async () => {
            const itemsToDelete = inventoryData.filter(
              (i) =>
                i.warehouse === locationBeingEdited.warehouse &&
                i.location === locationBeingEdited.location
            );
            for (const item of itemsToDelete) {
              await deleteItem(item.warehouse, item.sku);
            }
            setLocationBeingEdited(null);
            window.location.reload();
          },
          undefined,
          'Permanently Delete',
          'Cancel'
        );
        return;
      }

      const result = await deactivateLocation(id);
      if (result.success) {
        setLocationBeingEdited(null);
        window.location.reload();
      }
    },
    [locationBeingEdited, inventoryData, deleteItem, deactivateLocation, showConfirmation]
  );

  // --- Picking Mode Handlers ---
  const handleCardClick = useCallback(
    (item: InventoryItemWithMetadata) => {
      if (viewMode === 'stock') {
        handleEditItem(item);
      } else {
        onStartSession();
        addToCart(item);
      }
    },
    [viewMode, handleEditItem, addToCart]
  );

  const handleScanComplete = (scannedLines: any[]) => {
    const newItems: any[] = scannedLines.map((line) => {
      onStartSession();
      const match = inventoryData.find((i) => i.sku === line.sku);
      if (match) {
        return { ...match, pickingQty: line.qty || 1 };
      }
      return {
        id: -1,
        sku: line.sku,
        quantity: 0,
        location: 'UNKNOWN',
        warehouse: 'LUDLOW',
        created_at: new Date(),
        pickingQty: line.qty || 1,
      };
    });
    setCartItems((prev) => [...prev, ...newItems]);
    setShowScanner(false);
  };

  // REMOVED EARLY LOADING RETURN TO PREVENT KEYBOARD DISMISSAL
  // Layout must remain stable while charging

  // Removed isError check as we are using local data now


  // --- Manual Snapshot Trigger (Plan 2.2: R2 Link + History Logic) ---
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const triggerDailySnapshot = useCallback(async () => {
    try {
      if (!confirm('Are you sure you want to trigger the Daily Snapshot email now? (Includes Inventory Map Link)')) return;

      setIsSendingEmail(true);

      // 0. Get current session token for JWT Verification
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token ? {
        Authorization: `Bearer ${session.access_token}`
      } : {};

      // 1. Generate R2 Snapshot FIRST to get the URL
      toast.loading('Generating R2 Inventory Map...', { id: 'snapshot-toast' });
      const now = new Date();
      const todayStr = now.toLocaleDateString();
      const todayStrComp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const { data: snapshotData, error: snapshotError } = await supabase.functions.invoke('daily-snapshot', {
        body: { snapshot_date: todayStrComp },
        headers
      });

      if (snapshotError) throw snapshotError;
      const r2Url = snapshotData?.url;
      console.log('R2 Snapshot Ready:', r2Url);

      // 2. Fetch Logs for the summary
      toast.loading('Fetching today\'s activity summary...', { id: 'snapshot-toast' });
      const { data: logs, error: logsError } = await supabase
        .from('inventory_logs')
        .select('*')
        .gte('created_at', `${todayStrComp}T00:00:00Z`)
        .lte('created_at', `${todayStrComp}T23:59:59Z`)
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;

      const todaysLogs = (logs || []).filter(l => !l.is_reversed);
      const moveCount = todaysLogs.filter((l) => l.action_type === 'MOVE').length;
      const pickCount = todaysLogs.filter((l) => l.action_type === 'DEDUCT').length;
      const addCount = todaysLogs.filter((l) => l.action_type === 'ADD').length;

      // 3. Generate Simple HTML (Proven path)
      const htmlContent = `
                <div style="font-family: sans-serif; padding: 20px;">
                <h1>Daily Inventory Summary - ${todayStr}</h1>
                <p><strong>Total Actions:</strong> ${todaysLogs.length}</p>
                <ul>
                    <li>Moves: ${moveCount}</li>
                    <li>Picks: ${pickCount}</li>
                    <li>Restocks: ${addCount}</li>
                </ul>
                                ${snapshotData?.fileName ? `
                    <div style="margin: 25px 0; padding: 15px; border: 1px dashed #4f46e5; border-radius: 8px; text-align: center;">
                        <p style="margin-bottom: 10px; font-size: 14px;">Full inventory details archived here:</p>
                        <a href="${window.location.origin}/snapshot/${snapshotData.fileName}" style="color: #4f46e5; font-weight: bold; text-decoration: underline;">
                            SEE FULL INVENTORY MAP (Snapshot)
                        </a>
                    </div>
                    ` : ''}

                <h2>Activity Details</h2>
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background-color: #f3f4f6; color: #374151;">
                            <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; width: 80px;">Time</th>
                            <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; width: 120px;">SKU</th>
                            <th style="padding: 12px; border-bottom: 2px solid #e5e7eb;">Activity</th>
                            <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; text-align: right; width: 60px;">Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${todaysLogs.slice(0, 100).map((log) => {
        const logTimeStr = log.created_at || new Date().toISOString();
        const time = new Date(logTimeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const from = log.from_location ? `[${log.from_location}]` : '';
        const to = log.to_location ? `[${log.to_location}]` : '';
        let desc = '';
        if (log.action_type === 'MOVE') desc = `Relocated ${from} to ${to}`;
        else if (log.action_type === 'ADD') desc = `Added to ${to || from}`;
        else if (log.action_type === 'DEDUCT') desc = `Picked from ${from}`;
        else desc = `${log.action_type}`;

        return `
                            <tr style="border-bottom: 1px solid #f3f4f6;">
                                <td style="padding: 12px; color: #6b7280; font-size: 12px;">${time}</td>
                                <td style="padding: 12px; font-weight: bold;">${log.sku}</td>
                                <td style="padding: 12px; color: #374151; font-size: 13px;">${desc}</td>
                                <td style="padding: 12px; text-align: right; font-weight: bold;">${Math.abs(log.quantity_change || 0)}</td>
                            </tr>
                          `;
      }).join('')}
                    </tbody>
                </table>
                
                <p style="margin-top: 30px; font-size: 11px; color: #9ca3af; text-align: center;">
                    Report generated by PickD • ${new Date().toLocaleString()}
                </p>
                </div>
            `;

      // 4. Send the Email
      toast.loading('Delivering report to rafaelukf@gmail.com...', { id: 'snapshot-toast' });
      const { data: emailData, error: emailError } = await supabase.functions.invoke('send-daily-report', {
        body: {
          to: 'rafaelukf@gmail.com',
          subject: `Daily Inventory Report - ${todayStr}`,
          html: htmlContent,
        },
        headers
      });

      if (emailError) throw emailError;
      if (emailData?.error) throw new Error(JSON.stringify(emailData.error));

      toast.success('Report and Map sent successfully!', { id: 'snapshot-toast' });
      console.log('Full Snapshot Success:', { snapshot: snapshotData, email: emailData });

    } catch (err: any) {
      console.error('Snapshot trigger failed:', err);
      toast.error(`Error: ${err.message || 'Unknown error'}`, { id: 'snapshot-toast' });
    } finally {
      setIsSendingEmail(false);
    }
  }, []);

  return (
    <div className="pb-4 relative">
      <SessionInitializationModal />

      {/* Manual Snapshot Button (Admin Stock Mode Only) */}
      {isAdmin && viewMode === 'stock' && (
        <div className="fixed bottom-40 right-4 z-40 flex flex-col gap-3">
          <button
            onClick={handleDownloadView}
            disabled={isGeneratingPDF}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${isGeneratingPDF
              ? 'bg-subtle text-muted cursor-wait'
              : 'bg-surface text-accent border border-accent/20 hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:shadow-blue-500/20'
              }`}
            title="Download Filtered Stock PDF"
          >
            {isGeneratingPDF ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
            ) : (
              <FileDown size={20} />
            )}
          </button>

          <button
            onClick={triggerDailySnapshot}
            disabled={isSendingEmail}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${isSendingEmail
              ? 'bg-subtle text-muted cursor-wait'
              : 'bg-surface text-accent border border-accent/20 hover:bg-accent hover:text-white'
              }`}
            title="Trigger Daily Snapshot Email"
          >
            {isSendingEmail ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
            ) : (
              <Mail size={20} />
            )}
          </button>
        </div>
      )}



      <SearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search SKU, Loc, Warehouse..."
        mode={viewMode as any}
        onScanClick={() => setShowScanner(true)}
        autoFocus={viewMode === 'picking'}
      />

      {viewMode === 'stock' && (
        <div className="px-4 pt-2 flex justify-between items-center text-xs font-black uppercase tracking-widest text-muted">
          <span>{filteredStats.totalSkus} SKUs</span>
          <span>{filteredStats.totalQuantity} Units Total</span>
        </div>
      )}

      {(!isSearching || (allLocationBlocks.length === 0 && localSearch.trim() !== '')) && (
        <div className={`px-4 pt-2 flex items-center gap-2 transition-all duration-300 ${allLocationBlocks.length === 0 && localSearch.trim() !== '' ? 'bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 animate-in fade-in zoom-in-95 duration-500' : ''}`}>
          <input
            type="checkbox"
            id="show-inactive"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className={`rounded transition-colors h-4 w-4 ${allLocationBlocks.length === 0 && localSearch.trim() !== ''
              ? 'border-blue-500 text-blue-500 focus:ring-blue-500'
              : 'border-neutral-600 bg-surface text-accent focus:ring-accent focus:ring-offset-0'
              }`}
          />
          <label
            htmlFor="show-inactive"
            className={`text-sm font-medium cursor-pointer select-none transition-colors ${allLocationBlocks.length === 0 && localSearch.trim() !== ''
              ? 'text-blue-500 font-black uppercase tracking-wider'
              : 'text-muted'
              }`}
          >
            Show Deleted Items & Qty 0 SKUs
          </label>
        </div>
      )}


      <div className="p-4 space-y-12 min-h-[50vh]">
        {isLoading && !locationBlocks.length ? (
          SEARCHING_MESSAGE
        ) : (
          locationBlocks.map(({ wh, location, items, locationId }, index) => {
            const isFirstInWarehouse = index === 0 || locationBlocks[index - 1].wh !== wh;

            return (
              <div key={`${wh}-${location}`} className="space-y-4">
                {isFirstInWarehouse && !isSearching && (
                  <div className="flex items-center gap-4 pt-8 pb-2">
                    <div className="h-px flex-1 bg-subtle" />
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-content bg-surface px-6 py-2 rounded-full border border-subtle shadow-sm flex items-center gap-3" style={{ fontFamily: 'var(--font-heading)' }}>
                      <Warehouse className="text-accent" size={24} />
                      {wh === 'DELETED ITEMS' ? 'Deleted Items' : wh}
                    </h2>
                    <div className="h-px flex-1 bg-subtle" />
                  </div>
                )}

                <div className="sticky top-[84px] bg-main/95 backdrop-blur-sm z-30 py-3 border-b border-subtle group">
                  <div className="flex items-center gap-4 px-1">
                    <div className="flex-[3]">
                      <CapacityBar
                        current={locationCapacities[`${wh}-${(location || '').trim().toUpperCase()}`]?.current || 0}
                        max={locationCapacities[`${wh}-${(location || '').trim().toUpperCase()}`]?.max || 550}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3
                        className={`text-content text-xl font-black uppercase tracking-tighter truncate ${isAdmin && viewMode === 'stock' ? 'cursor-pointer hover:text-accent transition-colors' : ''}`}
                        style={{ fontFamily: 'var(--font-heading)' }}
                        title={isAdmin && viewMode === 'stock' ? 'Click to edit location' : location}
                        onClick={() => handleOpenLocationEditor(wh, location, locationId)}
                      >
                        {location}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-1">
                  {items.map((item) => {
                    const isInCart = cartItems.some(
                      (c) =>
                        c.sku === item.sku &&
                        c.warehouse === item.warehouse &&
                        c.location === item.location
                    );

                    // Calculate availability for picking mode
                    const stockInfo = viewMode === 'picking' ? getAvailableStock(item) : null;

                    return (
                      <div
                        key={`inv-row-${item.id}-${item.sku}`}
                        className={`animate-staggered-fade-in ${isInCart && viewMode === 'picking' ? 'ring-1 ring-accent rounded-lg' : ''
                          }`}
                        style={{ animationDelay: `${(index % 10) * 0.05}s` }}
                      >
                        <InventoryCard
                          sku={item.sku}
                          quantity={item.quantity}
                          detail={item.sku_note}
                          warehouse={item.warehouse}
                          onIncrement={() =>
                            updateQuantity(item.sku, 1, item.warehouse, item.location)
                          }
                          onDecrement={() =>
                            updateQuantity(item.sku, -1, item.warehouse, item.location)
                          }
                          onMove={() => handleQuickMove(item)}
                          onClick={() => handleCardClick(item)}
                          mode={viewMode === 'picking' ? sessionMode : 'stock'}
                          reservedByOthers={stockInfo?.reservedByOthers || 0}
                          available={stockInfo?.available}
                          lastUpdateSource={(item as any)._lastUpdateSource}
                          is_active={item.is_active}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {hasNextPage ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <button
              onClick={loadMore}
              className="px-8 py-4 font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shadow-lg bg-subtle text-accent hover:bg-accent hover:text-white"
            >
              Load More Locations ({remaining} remaining)
            </button>
          </div>
        ) : null}

        {allLocationBlocks.length === 0 ? <NoInventoryFound onClear={() => setLocalSearch('')} /> : null}
      </div>

      {viewMode === 'stock' ? (
        <div className="fixed bottom-24 right-4 flex flex-col gap-3 z-40">
          <button
            onClick={() => handleAddItem('LUDLOW')}
            className="w-16 h-16 ios-btn-primary shadow-2xl shadow-accent/40 active:scale-90 transition-transform"
            title="Add New SKU"
          >
            <Plus size={32} strokeWidth={3} />
          </button>
        </div>
      ) : null}


      <InventoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={saveItem}
        onDelete={handleDelete}
        initialData={editingItem}
        mode={modalMode}
        screenType={selectedWarehouseForAdd || editingItem?.warehouse}
      />

      {showScanner ? (
        <CamScanner onScanComplete={handleScanComplete} onCancel={() => setShowScanner(false)} />
      ) : null}
      <MovementModal
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        onMove={handleMoveStock}
        initialSourceItem={editingItem}
      />

      {locationBeingEdited ? (
        <LocationEditorModal
          location={locationBeingEdited}
          onSave={handleSaveLocation}
          onDelete={handleDeleteLocation}
          onCancel={() => setLocationBeingEdited(null)}
        />
      ) : null}
    </div>
  );
};
