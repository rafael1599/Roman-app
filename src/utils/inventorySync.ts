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
    showInactive?: boolean;
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
    // 0. Inactive filter
    if (!filters.showInactive && item.is_active === false) {
        return false;
    }

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
        const noteMatch = (item.sku_note || '').toLowerCase().includes(query);
        if (!skuMatch && !locMatch && !noteMatch) return false;
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

    const { eventType, new: rawNewItem, old: oldItem } = event;

    // Universal Normalization for the UI state
    const newItem = rawNewItem ? {
        ...rawNewItem,
        location: (rawNewItem.location || '').trim().toUpperCase()
    } : null;

    const isMatch = newItem && matchesContext(newItem, filters);
    let nextItems = [...items];

    switch (eventType) {
        case 'INSERT': {
            if (isMatch && newItem) {
                // 🛡️ ENHANCED DUPLICATION PROTECTION:
                // Check if we have a match (SKU+Wh+Loc) that is currently in a 'local' state.
                // This handles both new optimistic items (negative IDs) AND existing items 
                // that were optimistically updated/merged.
                const localMatchIndex = nextItems.findIndex((i: any) => {
                    const isTempId = (typeof i.id === 'string' && (i.id.startsWith('add-') || i.id.startsWith('move-'))) ||
                        (typeof i.id === 'number' && i.id < 0);
                    return isTempId &&
                        i.sku === newItem.sku &&
                        i.warehouse === newItem.warehouse &&
                        (i.location || '').toUpperCase() === (newItem.location || '').toUpperCase();
                });

                const enriched: InventoryItemWithMetadata = {
                    ...newItem,
                    sku_metadata: metadataMap?.[newItem.sku] || (newItem as any).sku_metadata,
                    _lastUpdateSource: (newItem as any)._lastUpdateSource || 'remote'
                };

                if (localMatchIndex !== -1) {
                    console.log(`[SYNC] De-duplicating: Replacing local/optimistic item ${nextItems[localMatchIndex].id} with real DB record ${newItem.id}`);
                    nextItems = nextItems.map((item, idx) => idx === localMatchIndex ? enriched : item);
                } else {
                    nextItems = [enriched, ...nextItems];
                }
            }
            break;
        }

        case 'UPDATE': {
            if (!newItem) break;
            const existingIndex = nextItems.findIndex((i: any) => String(i.id) === String(newItem.id));
            const alreadyInView = existingIndex !== -1;

            if (alreadyInView) {
                if (!isMatch) {
                    nextItems = nextItems.filter((_, idx) => idx !== existingIndex);
                } else {
                    nextItems = nextItems.map((item, idx) => {
                        if (idx === existingIndex) {
                            const isIncomingRemote = !(newItem as any)._lastUpdateSource || (newItem as any)._lastUpdateSource === 'remote';
                            const isExistingLocal = item._lastUpdateSource === 'local';
                            const localUpdateAge = item._lastLocalUpdateAt ? Date.now() - item._lastLocalUpdateAt : Infinity;

                            // 🛡️ GHOST UPDATE PROTECTION
                            if (isExistingLocal && isIncomingRemote && localUpdateAge < 4000) {
                                if (newItem.quantity !== item.quantity) {
                                    console.log(`[SYNC] Ignoring stale remote update for ${item.sku}: Local=${item.quantity}, Remote=${newItem.quantity}`);
                                    return item;
                                }
                            }

                            return {
                                ...item,
                                ...newItem,
                                sku_metadata: metadataMap?.[newItem.sku] || item.sku_metadata || (newItem as any).sku_metadata,
                                _lastUpdateSource: (isExistingLocal && isIncomingRemote && newItem.quantity === item.quantity)
                                    ? 'local'
                                    : ((newItem as any)._lastUpdateSource || 'remote')
                            };
                        }
                        return item;
                    });
                }
            } else if (isMatch) {
                // 🛡️ DUPLICATION PROTECTION FOR UPDATES:
                // If this is a move to an existing location, it might be an UPDATE event
                // instead of INSERT. Check for optimistic duplicates.
                const localMatchIndex = nextItems.findIndex((i: any) => {
                    const isTempId = (typeof i.id === 'string' && (i.id.startsWith('add-') || i.id.startsWith('move-'))) ||
                        (typeof i.id === 'number' && i.id < 0);
                    return isTempId &&
                        i.sku === newItem.sku &&
                        i.warehouse === newItem.warehouse &&
                        (i.location || '').toUpperCase() === (newItem.location || '').toUpperCase();
                });

                const enriched: InventoryItemWithMetadata = {
                    ...newItem,
                    sku_metadata: metadataMap?.[newItem.sku] || (newItem as any).sku_metadata,
                    _lastUpdateSource: (newItem as any)._lastUpdateSource || 'remote'
                };

                if (localMatchIndex !== -1) {
                    console.log(`[SYNC] De-duplicating UPDATE: Replacing local/optimistic item ${nextItems[localMatchIndex].id} with real DB record ${newItem.id}`);
                    nextItems = nextItems.map((item, idx) => idx === localMatchIndex ? enriched : item);
                } else {
                    nextItems = [enriched, ...nextItems];
                }
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
