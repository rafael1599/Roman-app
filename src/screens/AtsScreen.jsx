import React, { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventoryData';
import { SearchInput } from '../components/ui/SearchInput';
import { InventoryCard } from '../features/inventory/components/InventoryCard';
import { InventoryModal } from '../features/inventory/components/InventoryModal';
import { naturalSort } from '../utils/sortUtils';
import { Plus } from 'lucide-react';

export const AtsScreen = () => {
    const { atsData, updateAtsQuantity, addItem, updateItem, deleteItem, loading } = useInventory();
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
            deleteItem('ATS', editingItem.SKU);
        }
    };

    const saveItem = (formData) => {
        if (modalMode === 'add') {
            addItem('ATS', formData);
        } else {
            updateItem('ATS', editingItem.SKU, formData);
        }
    };


    const filteredData = useMemo(() => {
        let data = atsData;
        if (search) {
            const lowerSearch = search.toLowerCase();
            data = atsData.filter(item =>
                (item.SKU && item.SKU.toLowerCase().includes(lowerSearch)) ||
                (item.Location && item.Location.toLowerCase().includes(lowerSearch)) ||
                (item.Location_Detail && item.Location_Detail.toLowerCase().includes(lowerSearch))
            );
        }
        // Sort logic
        return [...data].sort((a, b) => {
            // Sort by Location first
            const locA = a.Location || '';
            const locB = b.Location || '';
            const locDiff = naturalSort(locA, locB);
            if (locDiff !== 0) return locDiff;

            // Then by Location_Detail
            const detailA = a.Location_Detail || '';
            const detailB = b.Location_Detail || '';
            return naturalSort(detailA, detailB);
        });
    }, [atsData, search]);

    if (loading) return <div className="p-8 text-center text-neutral-500">Loading Inventory...</div>;

    return (
        <div className="pb-4 relative">
            <SearchInput value={search} onChange={setSearch} placeholder="Search ATS SKU, Loc, Detail..." />

            <div className="p-4 space-y-3">
                {/* ATS - requirement says "Agrupar por Location (si aplica) o mostrar lista plana optimizada" 
            Given high density and "Location_Detail", a flat list sorted by location might be better 
            or grouped. Let's stick to flat list for now but grouped by main location if possible.
            Actually, let's just list them, emphasizing Location_Detail.
        */}
                {filteredData.map((item, idx) => (
                    <InventoryCard
                        key={`${item.SKU}-${idx}`}
                        sku={item.SKU}
                        quantity={item.Quantity}
                        location={item.Location}
                        detail={item.Location_Detail}
                        onIncrement={() => updateAtsQuantity(item.SKU, 1, item.Location)}
                        onDecrement={() => updateAtsQuantity(item.SKU, -1, item.Location)}
                        onClick={() => handleEditItem(item)}
                    />
                ))}

                {filteredData.length === 0 && (
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
                screenType="ATS"
            />
        </div>
    );
};
