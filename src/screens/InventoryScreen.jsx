import React, { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventoryData';
import { SearchInput } from '../components/ui/SearchInput';
import { InventoryCard } from '../features/inventory/components/InventoryCard';
import { InventoryModal } from '../features/inventory/components/InventoryModal';
import { naturalSort } from '../utils/sortUtils';
import { Plus, Warehouse } from 'lucide-react';

export const InventoryScreen = () => {
    const { inventoryData, updateQuantity, addItem, updateItem, deleteItem, loading } = useInventory();
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [modalMode, setModalMode] = useState('add');
    const [selectedWarehouseForAdd, setSelectedWarehouseForAdd] = useState('LUDLOW');

    const handleAddItem = (warehouse = 'LUDLOW') => {
        setModalMode('add');
        setSelectedWarehouseForAdd(warehouse);
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
            deleteItem(editingItem.Warehouse, editingItem.SKU);
        }
    };

    const saveItem = (formData) => {
        if (modalMode === 'add') {
            addItem(selectedWarehouseForAdd, formData);
        } else {
            updateItem(editingItem.Warehouse, editingItem.SKU, formData);
        }
    };

    const filteredData = useMemo(() => {
        if (!search) return inventoryData;
        const lowerSearch = search.toLowerCase();
        return inventoryData.filter(item =>
            (item.SKU && item.SKU.toLowerCase().includes(lowerSearch)) ||
            (item.Location && item.Location.toLowerCase().includes(lowerSearch)) ||
            (item.Warehouse && item.Warehouse.toLowerCase().includes(lowerSearch))
        );
    }, [inventoryData, search]);

    // Grouping: Warehouse -> Location
    const groupedData = useMemo(() => {
        const groups = {};
        filteredData.forEach(item => {
            const wh = item.Warehouse || 'UNKNOWN';
            const loc = item.Location || 'Unknown Location';

            if (!groups[wh]) groups[wh] = {};
            if (!groups[wh][loc]) groups[wh][loc] = [];

            groups[wh][loc].push(item);
        });
        return groups;
    }, [filteredData]);

    const sortedWarehouses = useMemo(() => {
        const warehouses = Object.keys(groupedData);
        return warehouses.sort((a, b) => {
            if (a === 'LUDLOW') return -1;
            if (b === 'LUDLOW') return 1;
            return a.localeCompare(b);
        });
    }, [groupedData]);

    if (loading) return <div className="p-8 text-center text-neutral-500 font-bold uppercase tracking-widest animate-pulse">Loading Global Inventory...</div>;

    return (
        <div className="pb-4 relative">
            <SearchInput value={search} onChange={setSearch} placeholder="Search SKU, Loc, Warehouse..." />

            <div className="p-4 space-y-12">
                {sortedWarehouses.flatMap(wh =>
                    Object.keys(groupedData[wh]).sort(naturalSort).map(location => (
                        <div key={`${wh}-${location}`} className="space-y-4">
                            <div className="sticky top-[89px] bg-neutral-950/95 backdrop-blur-sm z-30 py-3 border-b border-neutral-800/50 flex items-center justify-between group flex-row-reverse">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-white text-2xl font-black uppercase tracking-tighter">
                                        {location}
                                    </h3>
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border flex items-center gap-1.5 ${wh === 'LUDLOW' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                        wh === 'ATS' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                        }`}>
                                        <Warehouse size={12} />
                                        {wh}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleAddItem(wh)}
                                    className="p-1.5 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-500 hover:text-green-400 hover:border-green-500/30 transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-1">
                                {groupedData[wh][location].map((item, idx) => (
                                    <InventoryCard
                                        key={`${item.id || item.SKU}-${idx}`}
                                        sku={item.SKU}
                                        quantity={item.Quantity}
                                        detail={item.Location_Detail}
                                        warehouse={item.Warehouse}
                                        onIncrement={() => updateQuantity(item.SKU, 1, item.Warehouse, item.Location)}
                                        onDecrement={() => updateQuantity(item.SKU, -1, item.Warehouse, item.Location)}
                                        onClick={() => handleEditItem(item)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                )}

                {sortedWarehouses.length === 0 && (
                    <div className="text-center text-neutral-500 mt-20 py-20 border-2 border-dashed border-neutral-800 rounded-3xl">
                        <Warehouse className="mx-auto mb-4 opacity-20" size={48} />
                        <p className="text-xl font-black uppercase tracking-widest opacity-30">No inventory found</p>
                    </div>
                )}
            </div>

            {/* Floating Action Button */}
            <button
                onClick={() => handleAddItem('LUDLOW')}
                className="fixed bottom-20 right-4 w-14 h-14 bg-green-500 hover:bg-green-400 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/40 text-black z-50 active:scale-90 transition-transform"
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
                screenType={selectedWarehouseForAdd || (editingItem?.Warehouse)}
            />
        </div>
    );
};
