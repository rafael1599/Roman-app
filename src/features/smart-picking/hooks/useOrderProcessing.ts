import { useState, useCallback } from 'react';
import { useInventory } from '../../../hooks/useInventoryData';
import {
  Order,
  ScannedItem,
  ValidatedItem,
  Transaction,
  Pallet,
} from '../types';

const MAX_ITEMS_PER_PALLET = 13;

interface InventoryMatch {
  inBothWarehouses?: boolean;
  ludlow?: any;
  ats?: any;
  Quantity?: number;
  Location?: string | null;
  Location_Detail?: string | null;
  warehouse?: 'ludlow' | 'ats';
  matchType: 'exact' | 'normalized';
}

/**
 * Custom hook for order processing and picking logic
 */
export function useOrderProcessing() {
  const { ludlowData, atsData, updateLudlowInventory, updateAtsInventory } = useInventory();
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);

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
  const getLocationPosition = useCallback(
    (location: string | null) => {
      if (!location) return 999999;
      const map = getWarehouseMap();
      if (!map || !map[location]) {
        return 999999; // Unknown locations go last
      }
      return map[location].position ?? 999999;
    },
    [getWarehouseMap]
  );

  /**
   * Normalize SKU for comparison (remove hyphens, spaces, convert to uppercase)
   */
  const normalizeSKU = useCallback((sku: string | number) => {
    if (!sku) return '';
    return sku.toString().replace(/[-\s]/g, '').toUpperCase();
  }, []);

  /**
   * Find similar SKUs in inventory (for suggestions)
   */
  const findSimilarSKUs = useCallback(
    (sku: string) => {
      const normalized = normalizeSKU(sku);
      const allInventory = [...ludlowData, ...atsData];

      return allInventory
        .filter((item) => {
          const itemNormalized = normalizeSKU(item.SKU);
          return (
            itemNormalized.includes(normalized.slice(0, 6)) ||
            normalized.includes(itemNormalized.slice(0, 6))
          );
        })
        .slice(0, 3) // Top 3 suggestions
        .map((item) => item.SKU);
    },
    [ludlowData, atsData, normalizeSKU]
  );

  /**
   * Find item in inventory and return its details
   */
  const findInventoryItem = useCallback(
    (sku: string): InventoryMatch | null => {
      const normalizedSku = normalizeSKU(sku);

      // Search in both warehouses
      const ludlowExact = ludlowData.find((i) => i.SKU === sku);
      const atsExact = atsData.find((i) => i.SKU === sku);

      // If found in both warehouses (exact match)
      if (ludlowExact && atsExact) {
        return {
          inBothWarehouses: true,
          ludlow: { ...ludlowExact, warehouse: 'ludlow' as const, matchType: 'exact' as const },
          ats: { ...atsExact, warehouse: 'ats' as const, matchType: 'exact' as const },
          matchType: 'exact' as const
        };
      }

      // If found only in one warehouse (exact match)
      if (ludlowExact) {
        return { ...ludlowExact, warehouse: 'ludlow' as const, matchType: 'exact' as const };
      }
      if (atsExact) {
        return { ...atsExact, warehouse: 'ats' as const, matchType: 'exact' as const };
      }

      // Try normalized match
      const ludlowNormalized = ludlowData.find((i) => normalizeSKU(i.SKU) === normalizedSku);
      const atsNormalized = atsData.find((i) => normalizeSKU(i.SKU) === normalizedSku);

      if (ludlowNormalized && atsNormalized) {
        return {
          inBothWarehouses: true,
          ludlow: { ...ludlowNormalized, warehouse: 'ludlow' as const, matchType: 'normalized' as const },
          ats: { ...atsNormalized, warehouse: 'ats' as const, matchType: 'normalized' as const },
          matchType: 'normalized' as const
        };
      }

      if (ludlowNormalized) {
        return { ...ludlowNormalized, warehouse: 'ludlow' as const, matchType: 'normalized' as const };
      }
      if (atsNormalized) {
        return { ...atsNormalized, warehouse: 'ats' as const, matchType: 'normalized' as const };
      }

      return null;
    },
    [ludlowData, atsData, normalizeSKU]
  );

  /**
   * Validate order items against inventory
   */
  const validateOrder = useCallback(
    (orderItems: ScannedItem[], warehousePreferences: Record<string, 'ludlow' | 'ats'> = {}): ValidatedItem[] => {
      return orderItems.map((orderItem) => {
        const itemSku = orderItem.sku;
        const itemId = orderItem.id || `line-${Math.random().toString(36).substr(2, 9)}`;
        const inventoryItem = findInventoryItem(itemSku);

        if (!inventoryItem) {
          const suggestions = findSimilarSKUs(itemSku);
          return {
            ...orderItem,
            id: itemId,
            status: 'not_found',
            available: 0,
            location: null,
            warehouse: null,
            position: 999999,
            suggestions,
          };
        }

        // Item found in BOTH warehouses
        if (inventoryItem.inBothWarehouses) {
          const preference = warehousePreferences[itemSku] || null;

          if (preference) {
            const target = preference === 'ludlow' ? inventoryItem.ludlow : inventoryItem.ats;
            const available = Number(target.Quantity) || 0;
            const hasStock = available >= orderItem.qty;

            return {
              ...orderItem,
              id: itemId,
              status: hasStock ? 'available' : 'shortage',
              available,
              location: target.Location,
              locationDetail: (target as any).Location_Detail,
              warehouse: preference,
              position: getLocationPosition(target.Location),
              matchType: target.matchType,
            };
          }

          // No preference yet - needs user selection
          const lAvail = Number(inventoryItem.ludlow.Quantity) || 0;
          const aAvail = Number(inventoryItem.ats.Quantity) || 0;

          return {
            ...orderItem,
            id: itemId,
            status: 'needs_warehouse_selection',
            inBothWarehouses: true,
            available: lAvail + aAvail,
            location: null,
            warehouse: null,
            position: 0,
            ludlow: {
              available: lAvail,
              hasStock: lAvail >= orderItem.qty,
              location: inventoryItem.ludlow.Location,
              locationDetail: (inventoryItem.ludlow as any).Location_Detail,
            },
            ats: {
              available: aAvail,
              hasStock: aAvail >= orderItem.qty,
              location: inventoryItem.ats.Location,
              locationDetail: (inventoryItem.ats as any).Location_Detail,
            },
            matchType: inventoryItem.matchType,
          };
        }

        // Item found in only ONE warehouse
        const available = Number(inventoryItem.Quantity) || 0;
        const hasStock = available >= orderItem.qty;

        return {
          ...orderItem,
          id: itemId,
          status: hasStock ? 'available' : 'shortage',
          available,
          location: inventoryItem.Location || null,
          locationDetail: (inventoryItem as any).Location_Detail,
          warehouse: (inventoryItem.warehouse || null) as 'ludlow' | 'ats' | null,
          position: getLocationPosition(inventoryItem.Location || null),
          matchType: inventoryItem.matchType,
        };
      });
    },
    [findInventoryItem, getLocationPosition, findSimilarSKUs]
  );

  /**
   * Deduct inventory for an order
   */
  const deductInventory = useCallback(
    (validatedItems: ValidatedItem[]) => {
      const ludlowUpdates = [...ludlowData];
      const atsUpdates = [...atsData];
      const transactions: Transaction[] = [];

      validatedItems.forEach((item) => {
        if (item.status !== 'available') return;

        const targetInventory = item.warehouse === 'ludlow' ? ludlowUpdates : atsUpdates;
        const index = targetInventory.findIndex((i) => i.SKU === item.sku);

        if (index !== -1) {
          const currentQty = Number(targetInventory[index].Quantity) || 0;
          const newQty = Math.max(0, currentQty - item.qty);
          targetInventory[index] = {
            ...targetInventory[index],
            Quantity: newQty,
          };

          transactions.push({
            sku: item.sku,
            warehouse: item.warehouse,
            previousQty: currentQty,
            newQty: newQty,
            deducted: item.qty,
          });
        }
      });

      updateLudlowInventory(ludlowUpdates);
      updateAtsInventory(atsUpdates);

      return transactions;
    },
    [ludlowData, atsData, updateLudlowInventory, updateAtsInventory]
  );

  /**
   * Split items into pallets
   */
  const createPallets = useCallback((validatedItems: ValidatedItem[]): Pallet[] => {
    const sortedItems = [...validatedItems]
      .filter((item) => item.status === 'available')
      .sort((a, b) => a.position - b.position);

    const pallets: Pallet[] = [];
    let currentPallet: Pallet = [];
    let currentPalletCount = 0;

    sortedItems.forEach((item) => {
      let remainingQty = item.qty;

      while (remainingQty > 0) {
        const spaceLeft = MAX_ITEMS_PER_PALLET - currentPalletCount;

        if (spaceLeft === 0) {
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

    if (currentPallet.length > 0) {
      pallets.push(currentPallet);
    }

    return pallets;
  }, []);

  /**
   * Process a new order
   */
  const processOrder = useCallback(
    (scannedItems: ScannedItem[], warehousePreferences: Record<string, 'ludlow' | 'ats'> = {}, orderId: string | null = null) => {
      const id = orderId || `ORD-${Date.now()}`;
      const timestamp = new Date().toISOString();

      const validatedItems = validateOrder(scannedItems, warehousePreferences);
      const pallets = createPallets(validatedItems);
      const shortageItems = validatedItems.filter(
        (item) => item.status === 'shortage' || item.status === 'not_found'
      );

      const order: Order = {
        id,
        timestamp,
        scannedItems,
        validatedItems,
        pallets,
        shortageItems,
        transactions: [],
        status: 'draft',
        currentPalletIndex: 0,
      };

      setOrders((prev) => [...prev, order]);
      setCurrentOrder(order);

      return order;
    },
    [validateOrder, createPallets]
  );

  /**
   * Execute inventory deduction
   */
  const executeDeduction = useCallback(() => {
    if (!currentOrder || currentOrder.status !== 'draft') return;

    const transactions = deductInventory(currentOrder.validatedItems);

    const updatedOrder: Order = {
      ...currentOrder,
      transactions: transactions || [],
      status: 'in_progress',
    };

    setCurrentOrder(updatedOrder);
    setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

    return transactions;
  }, [currentOrder, deductInventory]);

  /**
   * Rollback an order
   */
  const rollbackOrder = useCallback(
    (orderId: string) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new Error('Order not found');

      const ludlowUpdates = [...ludlowData];
      const atsUpdates = [...atsData];

      order.transactions.forEach((transaction) => {
        const targetInventory = transaction.warehouse === 'ludlow' ? ludlowUpdates : atsUpdates;
        const index = targetInventory.findIndex((i) => i.SKU === transaction.sku);

        if (index !== -1) {
          targetInventory[index] = {
            ...targetInventory[index],
            Quantity: transaction.previousQty,
          };
        }
      });

      updateLudlowInventory(ludlowUpdates);
      updateAtsInventory(atsUpdates);

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'rolled_back' } : o))
      );

      if (currentOrder?.id === orderId) {
        setCurrentOrder(null);
      }
    },
    [orders, ludlowData, atsData, updateLudlowInventory, updateAtsInventory, currentOrder]
  );

  /**
   * Mark current pallet as complete
   */
  const completePallet = useCallback(
    (palletIndex: number) => {
      if (!currentOrder) return;

      const updatedOrder: Order = {
        ...currentOrder,
        currentPalletIndex: palletIndex + 1,
      };

      if (updatedOrder.currentPalletIndex >= updatedOrder.pallets.length) {
        updatedOrder.status = 'completed';
      }

      setCurrentOrder(updatedOrder);
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
    },
    [currentOrder]
  );

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
