import { InventoryItem, InventoryItemWithMetadata } from '../schemas/inventory.schema';
import { SKUMetadata } from '../schemas/skuMetadata.schema';

/**
 * Represents the structure of filters used in the Inventory View.
 * Matches the context awareness requirement.
 */
export interface InventoryFilters {
    search?: string;
    warehouse?: string;
    minQuantity?: number; // e.g., 1 to show only items in stock
}

/**
 * Payload structure from Supabase Realtime 'postgres_changes'
 */
export type RealtimeInventoryEvent = {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: InventoryItem;
    old: Partial<InventoryItem>;
};

/**
 * Pure helper to determine if an item matches the current UI filter context.
 */
const matchesContext = (item: InventoryItem, filters: InventoryFilters): boolean => {
    // 1. Warehouse filter
    if (filters.warehouse && item.warehouse !== filters.warehouse) {
        return false;
    }

    // 2. Quantity filter (Handling the quantity > 0 requirement)
    const minQty = filters.minQuantity ?? 0;
    if (item.quantity < minQty) {
        return false;
    }

    // 3. Search filter (Context awareness for SKU and Location)
    if (filters.search) {
        const query = filters.search.toLowerCase().trim();
        const skuMatch = item.sku.toLowerCase().includes(query);
        const locMatch = (item.location || '').toLowerCase().includes(query);
        if (!skuMatch && !locMatch) return false;
    }

    return true;
};

/**
 * Paso 1: "The Silent Brain"
 * Functional utility to patch the React Query cache based on DB events.
 * 
 * @param oldData - Current array of items in the cache
 * @param event - The raw event from Supabase Realtime
 * @param filters - Current filters applied to the view
 * @param metadataMap - Optional global metadata to enrich new items
 */
export function updateInventoryCache(
    oldData: any, // Can be array OR { data: [], count: number }
    event: RealtimeInventoryEvent,
    filters: InventoryFilters,
    metadataMap?: Record<string, SKUMetadata>
): any {
    if (!oldData) return oldData;

    // 1. Detect and normalize data structure
    let items: InventoryItemWithMetadata[] = [];
    let isPaginatedStructure = false;

    if (Array.isArray(oldData)) {
        items = oldData;
    } else if (oldData && Array.isArray(oldData.data)) {
        items = oldData.data;
        isPaginatedStructure = true;
    } else {
        // If it's not a structure we handle (like a single metadata object/list id), return as is
        return oldData;
    }

    const { eventType, new: newItem, old: oldItem } = event;
    const isMatch = matchesContext(newItem, filters);
    let nextItems = [...items];

    switch (eventType) {
        case 'INSERT': {
            if (isMatch) {
                const enriched: InventoryItemWithMetadata = {
                    ...newItem,
                    sku_metadata: metadataMap?.[newItem.sku] || (newItem as any).sku_metadata,
                    _lastUpdateSource: (newItem as any)._lastUpdateSource || 'remote'
                };
                nextItems = [enriched, ...nextItems];
            }
            break;
        }

        case 'UPDATE': {
            const existingIndex = nextItems.findIndex((i: any) => String(i.id) === String(newItem.id));
            const alreadyInView = existingIndex !== -1;

            if (alreadyInView) {
                if (!isMatch) {
                    nextItems = nextItems.filter((_, idx) => idx !== existingIndex);
                } else {
                    nextItems = nextItems.map((item, idx) => {
                        if (idx === existingIndex) {
                            return {
                                ...item,
                                ...newItem,
                                sku_metadata: item.sku_metadata || metadataMap?.[newItem.sku],
                                _lastUpdateSource: (newItem as any)._lastUpdateSource || 'remote'
                            };
                        }
                        return item;
                    });
                }
            } else if (isMatch) {
                const enriched: InventoryItemWithMetadata = {
                    ...newItem,
                    sku_metadata: metadataMap?.[newItem.sku] || (newItem as any).sku_metadata,
                    _lastUpdateSource: (newItem as any)._lastUpdateSource || 'remote'
                };
                nextItems = [enriched, ...nextItems];
            }
            break;
        }

        case 'DELETE': {
            const targetId = String(newItem?.id || oldItem?.id);
            nextItems = nextItems.filter((i: any) => String(i.id) !== targetId);
            break;
        }
    }

    // 2. Return data in original structure
    if (isPaginatedStructure) {
        return {
            ...oldData,
            data: nextItems,
            count: (oldData.count ?? 0) + (nextItems.length - items.length)
        };
    }

    return nextItems;
}
