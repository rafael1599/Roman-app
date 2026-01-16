import { Save, RotateCcw } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';

// Sub-components
import { ZoneFilterBar } from './ZoneFilterBar';
import { BulkEditBar } from './BulkEditBar';
import { ZoneCard } from './ZoneCard';
import { PickingRoutePreview } from './PickingRoutePreview';

// Hooks
import { useZoneMapState } from '../hooks/useZoneMapState';

// Utils
import { parseLocationKey } from '../utils/zoneUtils';

export const UnifiedZoneMap = ({
    locations,
    zones,
    getZone,
    updateZone,
    batchUpdateZones,
    autoAssignZones,
    hasUnsavedChanges,
    onSave
}) => {
    // All state management delegated to custom hook
    const {
        searchTerm,
        setSearchTerm,
        filterZone,
        setFilterZone,
        filterWarehouse,
        editMode,
        toggleEditMode,
        selectedIds,
        clearSelection,
        batchAssignZone,
        isRouteExpanded: showEditor,
        setIsRouteExpanded: setShowEditor,
        isSaving,
        setIsSaving,
        isAutoAssigning,
        setIsAutoAssigning,
        availableWarehouses,
        filteredLocations,
        pickingRoute,
        handleTap,
        handleDragEnd
    } = useZoneMapState({ locations, zones, getZone, updateZone, batchUpdateZones });

    // DND Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Avoid accidental drags when tapping
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Handle save
    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (onSave) await onSave();
        } finally {
            setIsSaving(false);
        }
    };

    // Handle auto-assign
    const handleAutoAssign = async () => {
        if (!confirm("Auto-assign zones based on alphabetical order? COLD for first third, WARM for middle, HOT for last third.")) return;
        setIsAutoAssigning(true);
        try {
            if (autoAssignZones) await autoAssignZones();
        } finally {
            setIsAutoAssigning(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* 1. Picking Route Preview (PERMANENT) */}
            <PickingRoutePreview
                route={pickingRoute}
                getZone={getZone}
                isExpanded={showEditor}
                onToggle={() => setShowEditor(prev => !prev)}
            />

            {/* 2. Configuration Grid (COLLAPSIBLE) */}
            {showEditor && (
                <>
                    {/* Toolbar */}
                    <div className="flex flex-col gap-3 bg-card border border-subtle p-4 rounded-xl animate-in fade-in slide-in-from-top-4 duration-500">
                        {/* Detailed Editor Instructions (AS REQUESTED) */}
                        <div className="mb-2 p-3 bg-surface rounded-lg border border-subtle">
                            <p className="text-[11px] text-muted leading-relaxed">
                                <span className="text-content font-bold block mb-1">Editor Instructions:</span>
                                Tap any location to cycle its zone manually. Position determines color:
                                <span className="block mt-1 font-mono">
                                    ❄️ <span className="text-blue-500">COLD</span> (Back/First) →
                                    ☀️ <span className="text-orange-500">WARM</span> (Middle) →
                                    🔥 <span className="text-red-500">HOT</span> (Shipping/Last)
                                </span>
                            </p>
                        </div>

                        <ZoneFilterBar
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            filterZone={filterZone}
                            onZoneFilterChange={setFilterZone}
                            editMode={editMode}
                            onToggleEditMode={toggleEditMode}
                            onAutoAssign={handleAutoAssign}
                            isAutoAssigning={isAutoAssigning}
                        />

                        {editMode && (
                            <BulkEditBar
                                selectedCount={selectedIds.size}
                                onAssignZone={batchAssignZone}
                                onClearSelection={clearSelection}
                            />
                        )}
                    </div>

                    {/* Zone Grid with DND Context */}
                    <div className="bg-card border border-subtle rounded-2xl p-4 animate-in fade-in slide-in-from-top-8 duration-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-content font-bold text-sm uppercase tracking-wider">
                                Drag to Rank • Tap to Zone • {filteredLocations.length} Locations
                            </h3>
                            {hasUnsavedChanges && (
                                <span className="text-orange-400 text-xs font-bold animate-pulse">● Unsaved</span>
                            )}
                        </div>

                        {filteredLocations.length === 0 ? (
                            <div className="text-center py-12 text-neutral-500">
                                No locations found matching your filters.
                            </div>
                        ) : (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={filteredLocations}
                                    strategy={rectSortingStrategy}
                                >
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                                        {filteredLocations.map((locKey) => {
                                            const { warehouse, location } = parseLocationKey(locKey);
                                            return (
                                                <ZoneCard
                                                    key={locKey}
                                                    locKey={locKey}
                                                    zone={getZone(warehouse, location)}
                                                    routePosition={pickingRoute.indexOf(locKey) + 1}
                                                    isSelected={selectedIds.has(locKey)}
                                                    editMode={editMode}
                                                    onTap={handleTap}
                                                />
                                            );
                                        })}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>
                </>
            )}

            {/* Save Button */}
            {hasUnsavedChanges && (
                <div className="sticky bottom-4 z-50">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full py-4 bg-accent hover:opacity-90 text-main font-black uppercase tracking-wider rounded-xl shadow-2xl shadow-accent/30 transition-all flex items-center justify-center gap-3"
                    >
                        {isSaving ? <RotateCcw className="animate-spin" size={20} /> : <Save size={20} />}
                        {isSaving ? 'Saving...' : 'Save Zone Configuration'}
                    </button>
                </div>
            )}
        </div>
    );
};
