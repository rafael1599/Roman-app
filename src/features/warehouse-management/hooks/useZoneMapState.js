import { useState, useMemo, useCallback, useEffect } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
    filterLocations,
    sortByZoneThenAlpha,
    extractWarehouses,
    parseLocationKey,
    getNextZone,
    recalculateZonesFromOrder
} from '../utils/zoneUtils';

/**
 * useZoneMapState - Custom hook for zone map local state management
 */
export const useZoneMapState = ({
    locations,
    zones,
    getZone,
    updateZone,
    batchUpdateZones
}) => {
    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [filterZone, setFilterZone] = useState('ALL');
    const filterWarehouse = 'LUDLOW'; // Solidly LUDLOW as requested

    // Local ordering state (for DND)
    const [orderedLocations, setOrderedLocations] = useState([]);

    // Sync initial order when locations change
    useEffect(() => {
        const baseLocations = locations.filter(loc => parseLocationKey(loc).warehouse === 'LUDLOW');

        // Sort initially by current zones/alphabetical
        setOrderedLocations(sortByZoneThenAlpha(baseLocations, getZone));
    }, [locations, getZone]);

    // Edit mode states
    const [editMode, setEditMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());

    // UI states
    const [isRouteExpanded, setIsRouteExpanded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isAutoAssigning, setIsAutoAssigning] = useState(false);

    // Derived: Available warehouses (Hardcoded for clean UI)
    const availableWarehouses = ['LUDLOW'];

    // Derived: Filtered locations (from the ordered list)
    const filteredLocations = useMemo(() => {
        let result = orderedLocations;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(loc => loc.toLowerCase().includes(lower));
        }

        if (filterZone !== 'ALL') {
            result = result.filter(loc => {
                const { warehouse: wh, location } = parseLocationKey(loc);
                return getZone(wh, location) === filterZone;
            });
        }

        return result;
    }, [orderedLocations, searchTerm, filterZone, getZone]);

    // Derived: Picking route (alias for orderedLocations)
    const pickingRoute = orderedLocations;

    // Handle Drag End
    const handleDragEnd = useCallback((event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setOrderedLocations((items) => {
            const oldIndex = items.indexOf(active.id);
            const newIndex = items.indexOf(over.id);
            const newItems = arrayMove(items, oldIndex, newIndex);

            // AUTOMATIC: Recalculate zones based on new position
            const updates = recalculateZonesFromOrder(newItems);
            if (batchUpdateZones) {
                batchUpdateZones(updates);
            }

            return newItems;
        });
    }, [batchUpdateZones]);

    // Cycle zone on tap
    const cycleZone = useCallback((locKey) => {
        const { warehouse, location } = parseLocationKey(locKey);
        const currentZone = getZone(warehouse, location);
        const nextZone = getNextZone(currentZone);
        updateZone(warehouse, location, nextZone);
    }, [getZone, updateZone]);

    // Handle tap on location
    const handleTap = useCallback((locKey) => {
        if (editMode) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.has(locKey) ? next.delete(locKey) : next.add(locKey);
                return next;
            });
        } else {
            cycleZone(locKey);
        }
    }, [editMode, cycleZone]);

    // Toggle edit mode
    const toggleEditMode = useCallback(() => {
        setEditMode(prev => !prev);
        setSelectedIds(new Set());
    }, []);

    // Batch assign zone to selected locations
    const batchAssignZone = useCallback(async (zone) => {
        if (selectedIds.size === 0) return;

        const updates = Array.from(selectedIds).map(locKey => {
            const { warehouse, location } = parseLocationKey(locKey);
            return { warehouse, location, zone };
        });

        if (batchUpdateZones) {
            await batchUpdateZones(updates);
        } else {
            for (const { warehouse, location, zone: z } of updates) {
                await updateZone(warehouse, location, z);
            }
        }

        setSelectedIds(new Set());
        setEditMode(false);
    }, [selectedIds, batchUpdateZones, updateZone]);

    // Select all visible locations
    const selectAll = useCallback(() => {
        setSelectedIds(new Set(filteredLocations));
    }, [filteredLocations]);

    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    return {
        // Filter state
        searchTerm,
        setSearchTerm,
        filterZone,
        setFilterZone,
        filterWarehouse,

        // Edit mode
        editMode,
        toggleEditMode,
        selectedIds,
        selectAll,
        clearSelection,
        batchAssignZone,

        // UI state
        isRouteExpanded,
        setIsRouteExpanded,
        isSaving,
        setIsSaving,
        isAutoAssigning,
        setIsAutoAssigning,

        // Derived data
        availableWarehouses,
        filteredLocations,
        pickingRoute,

        // Actions
        handleTap,
        handleDragEnd
    };
};
