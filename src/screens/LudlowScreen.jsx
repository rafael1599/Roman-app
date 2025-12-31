import React, { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventoryData';
import { SearchInput } from '../components/ui/SearchInput';
import { InventoryCard } from '../features/inventory/components/InventoryCard';
import { InventoryModal } from '../features/inventory/components/InventoryModal';
import { naturalSort } from '../utils/sortUtils';
import { Plus, Warehouse } from 'lucide-react';

export const LudlowScreen = () => {
    const { ludlowData, updateLudlowQuantity, addItem, updateItem, deleteItem, loading } = useInventory();
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [modalMode, setModalMode] = useState('add');

    const handleAddItem = () => {
        setModalMode('add');
        setEditingItem(null);
        setIsModalOpen(true);
    };

    const handleEditItem = (item) => {
        setModalMode('edit');
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleDelete = () => {
        if (editingItem) {
            deleteItem('LUDLOW', editingItem.SKU);
        }
    };

    const saveItem = (formData) => {
        if (modalMode === 'add') {
            addItem('LUDLOW', formData);
        } else {
            updateItem('LUDLOW', editingItem.SKU, formData);
        }
    };


    const filteredData = useMemo(() => {
        if (!search) return ludlowData;
        const lowerSearch = search.toLowerCase();
        return ludlowData.filter(item =>
            (item.SKU && item.SKU.toLowerCase().includes(lowerSearch)) ||
            (item.Location && item.Location.toLowerCase().includes(lowerSearch))
        );
    }, [ludlowData, search]);

    // FIXME: Grouping Logic - "Agrupar ítems por Location"
    // If user wants grouping visually, we can sort by location or render sections.
    // Prompt says "Agrupar ítems por Location (ej: 'Row 1', 'Row 2')".
    // Let's render sections.

    const groupedData = useMemo(() => {
        const groups = {};
        filteredData.forEach(item => {
            const loc = item.Location || 'Unknown Location';
            if (!groups[loc]) groups[loc] = [];
            groups[loc].push(item);
        });
        return groups;
    }, [filteredData]);

    const sortedLocations = useMemo(() => Object.keys(groupedData).sort(naturalSort), [groupedData]);

    if (loading) return <div className="p-8 text-center text-neutral-500">Loading Inventory...</div>;

    return (
        <div className="pb-4 relative">
            <SearchInput value={search} onChange={setSearch} placeholder="Search Ludlow SKU / Location..." />

            <div className="p-4 space-y-6">
                {sortedLocations.map(location => (
                    <div key={location}>
                        <h2 className="text-white text-2xl font-black uppercase tracking-tighter mb-4 border-b-2 border-green-500/50 pb-2 sticky top-[72px] bg-neutral-950/95 py-2 z-30 flex items-center gap-2">
                            <Warehouse className="text-green-400" size={20} />
                            {location}
                        </h2>
                        <div className="space-y-3">
                            {groupedData[location].map((item, idx) => (
                                <InventoryCard
                                    key={`${item.SKU}-${idx}`}
                                    sku={item.SKU}
                                    quantity={item.Quantity}
                                    onIncrement={() => updateLudlowQuantity(item.SKU, 1, item.Location)}
                                    onDecrement={() => updateLudlowQuantity(item.SKU, -1, item.Location)}
                                    onClick={() => handleEditItem(item)}
                                />
                            ))}
                        </div>
                    </div>
                ))}

                {sortedLocations.length === 0 && (
                    <div className="text-center text-neutral-500 mt-10">No items found.</div>
                )}
            </div>

            {/* Floating Action Button */}
            <button
                onClick={handleAddItem}
                className="fixed bottom-20 right-4 w-14 h-14 bg-green-400 hover:bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-400/20 text-neutral-950 z-40 active:scale-90 transition-transform"
            >
                <Plus className="w-8 h-8" />
            </button>

            <InventoryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={saveItem}
                onDelete={handleDelete}
                initialData={editingItem}
                mode={modalMode}
                screenType="LUDLOW"
            />
        </div>
    );
};
