import { useState, useCallback } from 'react';
import { useInventory } from '../../../hooks/useInventoryData';

const MAX_ITEMS_PER_PALLET = 13;

/**
 * Custom hook for order processing and picking logic
 */
export function useOrderProcessing() {
    const { ludlowInventory, atsInventory, updateLudlowInventory, updateAtsInventory } = useInventory();
    const [orders, setOrders] = useState([]);
    const [currentOrder, setCurrentOrder] = useState(null);

    /**
     * Get warehouse map configuration from localStorage
     */
    const getWarehouseMap = useCallback(() => {
        const mapData = localStorage.getItem('warehouse_map');
        return mapData ? JSON.parse(mapData) : null;
    }, []);

    /**
     * Get position from warehouse map (lower position = picked first)
     */
    const getLocationPosition = useCallback((location) => {
        const map = getWarehouseMap();
        if (!map || !map[location]) {
            return 999999; // Unknown locations go last
        }
        return map[location].position ?? 999999;
    }, [getWarehouseMap]);

    /**
     * Normalize SKU for comparison (remove hyphens, spaces, convert to uppercase)
     */
    const normalizeSKU = useCallback((sku) => {
        if (!sku) return '';
        return sku.toString().replace(/[-\s]/g, '').toUpperCase();
    }, []);

    /**
     * Find similar SKUs in inventory (for suggestions)
     */
    const findSimilarSKUs = useCallback((sku) => {
        const normalized = normalizeSKU(sku);
        const allInventory = [...ludlowInventory, ...atsInventory];

        return allInventory
            .filter(item => {
                const itemNormalized = normalizeSKU(item.SKU);
                // Check if normalized SKUs are similar (Levenshtein distance or contains)
                return itemNormalized.includes(normalized.slice(0, 6)) ||
                    normalized.includes(itemNormalized.slice(0, 6));
            })
            .slice(0, 3) // Top 3 suggestions
            .map(item => item.SKU);
    }, [ludlowInventory, atsInventory, normalizeSKU]);

    /**
     * Find item in inventory and return its details
     * Now supports SKU normalization and detects items in both warehouses
     */
    const findInventoryItem = useCallback((sku) => {
        const normalizedSku = normalizeSKU(sku);

        // Search in both warehouses
        const ludlowExact = ludlowInventory.find(i => i.SKU === sku);
        const atsExact = atsInventory.find(i => i.SKU === sku);

        // If found in both warehouses (exact match)
        if (ludlowExact && atsExact) {
            return {
                inBothWarehouses: true,
                ludlow: { ...ludlowExact, warehouse: 'ludlow', matchType: 'exact' },
                ats: { ...atsExact, warehouse: 'ats', matchType: 'exact' },
            };
        }

        // If found only in one warehouse (exact match)
        if (ludlowExact) {
            return { ...ludlowExact, warehouse: 'ludlow', matchType: 'exact' };
        }
        if (atsExact) {
            return { ...atsExact, warehouse: 'ats', matchType: 'exact' };
        }

        // Try normalized match
        const ludlowNormalized = ludlowInventory.find(i => normalizeSKU(i.SKU) === normalizedSku);
        const atsNormalized = atsInventory.find(i => normalizeSKU(i.SKU) === normalizedSku);

        // If found in both warehouses (normalized match)
        if (ludlowNormalized && atsNormalized) {
            console.log(`✅ Found SKU in BOTH warehouses: "${sku}" (normalized)`);
            return {
                inBothWarehouses: true,
                ludlow: { ...ludlowNormalized, warehouse: 'ludlow', matchType: 'normalized' },
                ats: { ...atsNormalized, warehouse: 'ats', matchType: 'normalized' },
            };
        }

        // If found only in one warehouse (normalized match)
        if (ludlowNormalized) {
            console.log(`✅ Found SKU match: "${sku}" → "${ludlowNormalized.SKU}" (normalized, Ludlow)`);
            return { ...ludlowNormalized, warehouse: 'ludlow', matchType: 'normalized' };
        }
        if (atsNormalized) {
            console.log(`✅ Found SKU match: "${sku}" → "${atsNormalized.SKU}" (normalized, ATS)`);
            return { ...atsNormalized, warehouse: 'ats', matchType: 'normalized' };
        }

        // Not found - get suggestions
        const suggestions = findSimilarSKUs(sku);
        console.warn(`❌ SKU not found: "${sku}"`, suggestions.length > 0 ? `Similar: ${suggestions.join(', ')}` : '');

        return null;
    }, [ludlowInventory, atsInventory, normalizeSKU, findSimilarSKUs]);

    /**
     * Validate order items against inventory
     * Returns items with stock status and location info
     * Detects items in both warehouses and marks them for user selection
     */
    const validateOrder = useCallback((orderItems, warehousePreferences = {}) => {
        return orderItems.map(orderItem => {
            const inventoryItem = findInventoryItem(orderItem.sku);

            if (!inventoryItem) {
                const suggestions = findSimilarSKUs(orderItem.sku);
                return {
                    ...orderItem,
                    status: 'not_found',
                    available: 0,
                    location: null,
                    warehouse: null,
                    suggestions,
                };
            }

            // Item found in BOTH warehouses
            if (inventoryItem.inBothWarehouses) {
                // Check if user already made a selection for this SKU
                const preference = warehousePreferences[orderItem.sku];

                if (preference) {
                    const target = preference === 'ludlow' ? inventoryItem.ludlow : inventoryItem.ats;
                    const available = parseInt(target.Quantity) || 0;
                    const hasStock = available >= orderItem.qty;

                    return {
                        ...orderItem,
                        status: hasStock ? 'available' : 'shortage',
                        available,
                        location: target.Location,
                        locationDetail: target.Location_Detail,
                        warehouse: preference,
                        position: getLocationPosition(target.Location),
                        matchType: target.matchType,
                    };
                }

                // No preference yet - needs user selection
                const ludlowAvailable = parseInt(inventoryItem.ludlow.Quantity) || 0;
                const atsAvailable = parseInt(inventoryItem.ats.Quantity) || 0;

                return {
                    ...orderItem,
                    status: 'needs_warehouse_selection',
                    inBothWarehouses: true,
                    ludlow: {
                        available: ludlowAvailable,
                        hasStock: ludlowAvailable >= orderItem.qty,
                        location: inventoryItem.ludlow.Location,
                        locationDetail: inventoryItem.ludlow.Location_Detail,
                    },
                    ats: {
                        available: atsAvailable,
                        hasStock: atsAvailable >= orderItem.qty,
                        location: inventoryItem.ats.Location,
                        locationDetail: inventoryItem.ats.Location_Detail,
                    },
                    matchType: inventoryItem.ludlow.matchType,
                };
            }

            // Item found in only ONE warehouse
            const available = parseInt(inventoryItem.Quantity) || 0;
            const hasStock = available >= orderItem.qty;

            return {
                ...orderItem,
                status: hasStock ? 'available' : 'shortage',
                available,
                location: inventoryItem.Location,
                locationDetail: inventoryItem.Location_Detail,
                warehouse: inventoryItem.warehouse,
                position: getLocationPosition(inventoryItem.Location),
                matchType: inventoryItem.matchType,
            };
        });
    }, [findInventoryItem, getLocationPosition, findSimilarSKUs]);

    /**
     * Deduct inventory for an order
     * Only deducts items with available stock
     */
    const deductInventory = useCallback((validatedItems) => {
        const ludlowUpdates = [...ludlowInventory];
        const atsUpdates = [...atsInventory];

        const transactions = [];

        validatedItems.forEach(item => {
            if (item.status !== 'available') {
                return; // Skip items without stock
            }

            const targetInventory = item.warehouse === 'ludlow' ? ludlowUpdates : atsUpdates;
            const index = targetInventory.findIndex(i => i.SKU === item.sku);

            if (index !== -1) {
                const currentQty = parseInt(targetInventory[index].Quantity) || 0;
                const newQty = currentQty - item.qty;
                targetInventory[index] = {
                    ...targetInventory[index],
                    Quantity: Math.max(0, newQty).toString(),
                };

                transactions.push({
                    sku: item.sku,
                    warehouse: item.warehouse,
                    previousQty: currentQty,
                    newQty: Math.max(0, newQty),
                    deducted: item.qty,
                });
            }
        });

        // Update inventories
        updateLudlowInventory(ludlowUpdates);
        updateAtsInventory(atsUpdates);

        return transactions;
    }, [ludlowInventory, atsInventory, updateLudlowInventory, updateAtsInventory]);

    /**
     * Split items into pallets based on MAX_ITEMS_PER_PALLET
     * If an item has more than max, split it across multiple pallets
     */
    const createPallets = useCallback((validatedItems) => {
        // Sort by position (based on warehouse map) or natural sort of location
        const sortedItems = [...validatedItems]
            .filter(item => item.status === 'available')
            .sort((a, b) => {
                if (a.position !== 999999 || b.position !== 999999) {
                    return a.position - b.position;
                }
                // Fallback to natural sort of location strings
                const locA = a.location || '';
                const locB = b.location || '';
                return locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
            });

        const pallets = [];
        let currentPallet = [];
        let currentPalletCount = 0;

        sortedItems.forEach(item => {
            let remainingQty = item.qty;

            while (remainingQty > 0) {
                const spaceLeft = MAX_ITEMS_PER_PALLET - currentPalletCount;

                if (spaceLeft === 0) {
                    // Current pallet is full, start a new one
                    pallets.push(currentPallet);
                    currentPallet = [];
                    currentPalletCount = 0;
                    continue;
                }

                const qtyToAdd = Math.min(remainingQty, spaceLeft);

                currentPallet.push({
                    ...item,
                    qty: qtyToAdd,
                    originalQty: item.qty,
                    isSplit: item.qty > qtyToAdd,
                });

                currentPalletCount += qtyToAdd;
                remainingQty -= qtyToAdd;
            }
        });

        // Add the last pallet if it has items
        if (currentPallet.length > 0) {
            pallets.push(currentPallet);
        }

        return pallets;
    }, []);

    /**
     * Process a new order from scanned items
     */
    const processOrder = useCallback((scannedItems, warehousePreferences = {}, orderId = null) => {
        const id = orderId || `ORD-${Date.now()}`;
        const timestamp = new Date().toISOString();

        // Validate items against inventory
        const validatedItems = validateOrder(scannedItems, warehousePreferences);

        // Create pallets (without deducting inventory yet)
        const pallets = createPallets(validatedItems);

        // Items with shortage
        const shortageItems = validatedItems.filter(item =>
            item.status === 'shortage' || item.status === 'not_found'
        );

        const order = {
            id,
            timestamp,
            scannedItems,
            validatedItems,
            pallets,
            shortageItems,
            transactions: [], // Empty initially
            status: 'draft', // Change to draft
            currentPalletIndex: 0,
        };

        // Save order
        setOrders(prev => [...prev, order]);
        setCurrentOrder(order);

        return order;
    }, [validateOrder, createPallets]);

    /**
     * Execute inventory deduction for the current order
     */
    const executeDeduction = useCallback(() => {
        if (!currentOrder || currentOrder.status !== 'draft') return;

        const transactions = deductInventory(currentOrder.validatedItems);

        const updatedOrder = {
            ...currentOrder,
            transactions,
            status: 'in_progress'
        };

        setCurrentOrder(updatedOrder);
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));

        return transactions;
    }, [currentOrder, deductInventory]);

    /**
     * Rollback an order (restore inventory)
     */
    const rollbackOrder = useCallback((orderId) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) {
            throw new Error('Order not found');
        }

        const ludlowUpdates = [...ludlowInventory];
        const atsUpdates = [...atsInventory];

        // Restore inventory based on transactions
        order.transactions.forEach(transaction => {
            const targetInventory = transaction.warehouse === 'ludlow' ? ludlowUpdates : atsUpdates;
            const index = targetInventory.findIndex(i => i.SKU === transaction.sku);

            if (index !== -1) {
                targetInventory[index] = {
                    ...targetInventory[index],
                    Quantity: transaction.previousQty.toString(),
                };
            }
        });

        updateLudlowInventory(ludlowUpdates);
        updateAtsInventory(atsUpdates);

        // Update order status
        setOrders(prev => prev.map(o =>
            o.id === orderId ? { ...o, status: 'rolled_back' } : o
        ));

        if (currentOrder?.id === orderId) {
            setCurrentOrder(null);
        }

        console.log(`✅ Order ${orderId} rolled back successfully`);
    }, [orders, ludlowInventory, atsInventory, updateLudlowInventory, updateAtsInventory, currentOrder]);

    /**
     * Mark current pallet as complete and move to next
     */
    const completePallet = useCallback((palletIndex) => {
        if (!currentOrder) return;

        const updatedOrder = {
            ...currentOrder,
            currentPalletIndex: palletIndex + 1,
        };

        if (updatedOrder.currentPalletIndex >= updatedOrder.pallets.length) {
            updatedOrder.status = 'completed';
        }

        setCurrentOrder(updatedOrder);
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    }, [currentOrder]);

    return {
        orders,
        currentOrder,
        processOrder,
        rollbackOrder,
        executeDeduction,
        completePallet,
        setCurrentOrder,
    };
}
