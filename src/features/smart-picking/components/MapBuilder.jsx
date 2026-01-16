import { useState, useEffect } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useInventory } from '../../../hooks/useInventoryData';
import { Plus, Trash2, Edit2, GripVertical } from 'lucide-react';

/**
 * Draggable location block component
 */
function LocationBlock({ id, location, position, onEdit, onDelete, isCustom }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                bg-gradient-to-br from-green-500/20 to-green-600/20 
                border-2 border-green-500 rounded-lg p-3
                hover:border-green-400 hover:shadow-lg hover:shadow-green-500/20
                transition-all duration-200 relative
                ${isDragging ? 'z-50 scale-105' : 'z-0'}
            `}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div {...attributes} {...listeners} className="cursor-move flex-shrink-0">
                        <GripVertical className="text-green-400" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-green-400 font-bold text-base truncate">
                            {location}
                        </div>
                        <div className="text-green-300/60 text-xs mt-0.5">
                            Position: {position + 1}
                            {isCustom && <span className="ml-2 text-blue-400">(Custom)</span>}
                        </div>
                    </div>
                </div>
                {isCustom && (
                    <div className="flex gap-1 flex-shrink-0">
                        <button
                            onClick={() => onEdit(location)}
                            className="p-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 rounded text-blue-400 transition-colors"
                            title="Edit location"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button
                            onClick={() => onDelete(location)}
                            className="p-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-red-400 transition-colors"
                            title="Delete location"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Add/Edit Location Modal
 */
function LocationModal({ location, onSave, onCancel }) {
    const [name, setName] = useState(location || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) {
            onSave(name.trim());
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border-2 border-accent rounded-xl p-6 max-w-md w-full">
                <h3 className="text-xl font-bold text-accent mb-4">
                    {location ? 'Edit Location' : 'Add New Location'}
                </h3>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-muted text-sm font-semibold mb-2">
                            Location Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., A-01, B-15, DOCK-1"
                            className="w-full px-4 py-3 bg-main border-2 border-subtle rounded-lg text-content placeholder-muted/50 focus:border-accent focus:outline-none"
                            autoFocus
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 px-4 py-2 bg-surface hover:opacity-80 text-content rounded-lg transition-colors border border-subtle"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim()}
                            className="flex-1 px-4 py-2 bg-accent hover:opacity-90 text-main font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {location ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * Map Builder Component
 * Allows visual configuration of warehouse layout with CRUD operations
 */
export default function MapBuilder() {
    const { ludlowInventory, atsInventory } = useInventory();
    const [warehouse, setWarehouse] = useState('ludlow'); // Internal warehouse selector
    const [locations, setLocations] = useState([]);
    const [customLocations, setCustomLocations] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false); // Track if there are unsaved changes
    const [showModal, setShowModal] = useState(false);
    const [editingLocation, setEditingLocation] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    // Load custom locations from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('custom_locations');
        if (saved) {
            setCustomLocations(JSON.parse(saved));
        }
    }, []);

    // Extract unique locations from inventory and merge with custom
    useEffect(() => {
        const inventory = warehouse === 'ludlow' ? ludlowInventory : atsInventory;
        const inventoryLocations = [...new Set(
            inventory
                .map(item => item.Location)
                .filter(loc => loc && loc.trim() !== '')
        )];

        // Merge inventory locations with custom locations
        const allLocations = [...new Set([...inventoryLocations, ...customLocations])].sort();

        // Load saved map or create default
        const savedMap = localStorage.getItem('warehouse_map');
        if (savedMap) {
            const mapData = JSON.parse(savedMap);
            // Order locations based on saved positions
            const orderedLocations = allLocations.sort((a, b) => {
                const posA = mapData[a]?.position ?? 999;
                const posB = mapData[b]?.position ?? 999;
                return posA - posB;
            });
            setLocations(orderedLocations);
        } else {
            setLocations(allLocations);
        }
    }, [warehouse, ludlowInventory, atsInventory, customLocations]);

    /**
     * Handle drag end - reorder locations
     */
    const handleDragEnd = (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            setLocations((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
            setHasChanges(true); // Mark as changed when reordering
        }
    };

    /**
     * Save map configuration to localStorage
     */
    const saveMap = () => {
        setIsSaving(true);

        // Create map with positions and coordinates
        const mapData = {};
        locations.forEach((location, index) => {
            mapData[location] = {
                position: index,
                x: 100,
                y: 1000 - (index * 100),
            };
        });

        localStorage.setItem('warehouse_map', JSON.stringify(mapData));

        setTimeout(() => {
            setIsSaving(false);
            setHasChanges(false); // Reset changes flag after saving
            console.log('✅ Warehouse map saved:', mapData);
        }, 500);
    };

    /**
     * Reset to default order
     */
    const resetMap = () => {
        if (confirm('Reset map to default order? This will not delete custom locations.')) {
            const inventory = warehouse === 'ludlow' ? ludlowInventory : atsInventory;
            const inventoryLocations = [...new Set(
                inventory
                    .map(item => item.Location)
                    .filter(loc => loc && loc.trim() !== '')
            )];
            const allLocations = [...new Set([...inventoryLocations, ...customLocations])].sort();
            setLocations(allLocations);
            localStorage.removeItem('warehouse_map');
        }
    };

    /**
     * Add new custom location
     */
    const handleAddLocation = (name) => {
        if (!customLocations.includes(name) && !locations.includes(name)) {
            const updated = [...customLocations, name];
            setCustomLocations(updated);
            localStorage.setItem('custom_locations', JSON.stringify(updated));
            setHasChanges(true); // Mark as changed
            setShowModal(false);
        } else {
            alert('Location already exists!');
        }
    };

    /**
     * Edit custom location
     */
    const handleEditLocation = (oldName, newName) => {
        if (newName === oldName) {
            setShowModal(false);
            setEditingLocation(null);
            return;
        }

        if (customLocations.includes(newName) || locations.includes(newName)) {
            alert('Location already exists!');
            return;
        }

        const updated = customLocations.map(loc => loc === oldName ? newName : loc);
        setCustomLocations(updated);
        localStorage.setItem('custom_locations', JSON.stringify(updated));

        // Update in locations array
        setLocations(prev => prev.map(loc => loc === oldName ? newName : loc));

        // Update in saved map
        const savedMap = localStorage.getItem('warehouse_map');
        if (savedMap) {
            const mapData = JSON.parse(savedMap);
            if (mapData[oldName]) {
                mapData[newName] = mapData[oldName];
                delete mapData[oldName];
                localStorage.setItem('warehouse_map', JSON.stringify(mapData));
            }
        }

        setHasChanges(true); // Mark as changed
        setShowModal(false);
        setEditingLocation(null);
    };

    /**
     * Delete custom location
     */
    const handleDeleteLocation = (name) => {
        if (confirm(`Delete location "${name}"? This cannot be undone.`)) {
            const updated = customLocations.filter(loc => loc !== name);
            setCustomLocations(updated);
            localStorage.setItem('custom_locations', JSON.stringify(updated));

            // Remove from locations array
            setLocations(prev => prev.filter(loc => loc !== name));

            // Remove from saved map
            const savedMap = localStorage.getItem('warehouse_map');
            if (savedMap) {
                const mapData = JSON.parse(savedMap);
                delete mapData[name];
                localStorage.setItem('warehouse_map', JSON.stringify(mapData));
            }

            setHasChanges(true); // Mark as changed
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:gap-4">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-green-400">
                        Warehouse Map Editor
                    </h2>
                    <p className="text-green-300/60 text-xs sm:text-sm mt-1">
                        Drag locations to organize picking route.
                    </p>
                </div>

                {/* Warehouse Selector - Full width on mobile */}
                <div className="flex bg-gray-800 rounded-lg p-1 border border-green-500/30">
                    <button
                        onClick={() => setWarehouse('ludlow')}
                        className={`flex-1 px-3 sm:px-4 py-2.5 rounded-md font-semibold text-sm sm:text-base transition-all touch-manipulation ${warehouse === 'ludlow'
                            ? 'bg-green-500 text-black'
                            : 'text-green-400 active:text-green-300'
                            }`}
                    >
                        Ludlow
                    </button>
                    <button
                        onClick={() => setWarehouse('ats')}
                        className={`flex-1 px-3 sm:px-4 py-2.5 rounded-md font-semibold text-sm sm:text-base transition-all touch-manipulation ${warehouse === 'ats'
                            ? 'bg-green-500 text-black'
                            : 'text-green-400 active:text-green-300'
                            }`}
                    >
                        ATS Grid
                    </button>
                </div>

                {/* Action Buttons - Stacked on mobile, row on desktop */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <button
                        onClick={() => {
                            setEditingLocation(null);
                            setShowModal(true);
                        }}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-500 text-white rounded-lg transition-colors text-sm sm:text-base font-semibold touch-manipulation"
                    >
                        <Plus size={18} />
                        Add Location
                    </button>
                    <div className="flex gap-2 sm:gap-3">
                        <button
                            onClick={resetMap}
                            className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm sm:text-base font-semibold touch-manipulation"
                        >
                            Reset
                        </button>
                        <button
                            onClick={saveMap}
                            disabled={isSaving || !hasChanges}
                            className={`flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-lg font-semibold transition-all text-sm sm:text-base touch-manipulation ${isSaving
                                ? 'bg-green-600 text-white cursor-not-allowed'
                                : !hasChanges
                                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                    : 'bg-green-500 hover:bg-green-400 active:bg-green-400 text-black'
                                }`}
                        >
                            {isSaving ? '✓ Saved!' : 'Save Map'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <div className="text-blue-400 text-xl">ℹ️</div>
                    <div className="text-blue-300 text-sm">
                        <strong>How it works:</strong> The picking route is calculated based on the order of locations here.
                        Items from the top location will be picked first, then the second, and so on.
                        You can add custom locations that don't exist in your inventory yet.
                    </div>
                </div>
            </div>

            {/* Map Grid */}
            <div className="bg-gray-900/50 border-2 border-green-500/30 rounded-xl p-6">
                <div className="mb-4 flex items-center justify-between">
                    <div className="text-green-400 font-semibold">
                        {warehouse === 'ludlow' ? 'Ludlow Zone' : 'ATS Zone'} - {locations.length} Locations
                    </div>
                    <div className="text-green-300/60 text-sm">
                        {customLocations.length} custom location{customLocations.length !== 1 ? 's' : ''}
                    </div>
                </div>

                {locations.length === 0 ? (
                    <div className="text-center py-12 text-green-300/40">
                        No locations found. Click "Add Location" to create one.
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={locations} strategy={rectSortingStrategy}>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {locations.map((location, index) => (
                                    <LocationBlock
                                        key={location}
                                        id={location}
                                        location={location}
                                        position={index}
                                        isCustom={customLocations.includes(location)}
                                        onEdit={(loc) => {
                                            setEditingLocation(loc);
                                            setShowModal(true);
                                        }}
                                        onDelete={handleDeleteLocation}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* Route Preview */}
            <div className="bg-gray-900/30 border border-green-500/20 rounded-lg p-4">
                <div className="text-green-400 font-semibold mb-3">Picking Route Preview:</div>
                <div className="flex flex-wrap gap-2">
                    {locations.map((location, index) => (
                        <div key={location} className="flex items-center gap-2">
                            <span className={`text-sm font-mono ${customLocations.includes(location)
                                ? 'text-blue-400'
                                : 'text-green-500'
                                }`}>
                                {index + 1}. {location}
                            </span>
                            {index < locations.length - 1 && (
                                <span className="text-green-500/40">→</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <LocationModal
                    location={editingLocation}
                    onSave={(name) => {
                        if (editingLocation) {
                            handleEditLocation(editingLocation, name);
                        } else {
                            handleAddLocation(name);
                        }
                    }}
                    onCancel={() => {
                        setShowModal(false);
                        setEditingLocation(null);
                    }}
                />
            )}
        </div>
    );
}
