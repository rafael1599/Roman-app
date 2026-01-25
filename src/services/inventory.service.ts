import { supabase } from '../lib/supabase';
import { BaseService, AppError } from './base.service';
import {
    InventoryItemSchema as inventorySchema,
    type InventoryItem as InventoryModel,
    InventoryItemInputSchema,
    type InventoryItemInput
} from '../schemas/inventory.schema';
import { type Location } from '../schemas/location.schema';
import { type InventoryLogInput } from '../schemas/log.schema';

export interface InventoryServiceContext {
    isAdmin: boolean;
    userInfo: { performed_by: string; user_id?: string };
    trackLog: (logData: InventoryLogInput, userInfo: { performed_by: string; user_id?: string }) => Promise<string | null>;
    onLocationCreated?: (newLoc: Location) => void;
}

interface ResolvedLocation {
    name: string;
    id: string | null;
    isNew: boolean;
}

/**
 * Service to handle inventory-specific business logic.
 * Extends BaseService to inherit standard CRUD operations.
 */
class InventoryService extends BaseService<'inventory'> {
    constructor() {
        super(supabase, 'inventory', () => ({ schema: inventorySchema as any }));
    }

    /**
     * Resolves a location name, mapping numeric inputs ("9") to standard format ("Row 9").
     * Encapsulated as private to preserve domain logic.
     */
    private resolveLocationName(
        locations: Location[],
        warehouse: string,
        inputLocation: string
    ): ResolvedLocation {
        if (!inputLocation) return { name: '', id: null, isNew: false };

        // 1. Check if exact match exists
        const exactMatch = locations.find(
            (l) => l.warehouse === warehouse && l.location.toLowerCase() === inputLocation.toLowerCase()
        );

        if (exactMatch) {
            return { name: exactMatch.location, id: exactMatch.id, isNew: false };
        }

        // 2. Business Rule: Mapping numeric "9" to "Row 9"
        const isNumeric = /^\d+$/.test(inputLocation);
        if (isNumeric) {
            const rowLocation = `Row ${inputLocation}`;
            const rowMatch = locations.find(
                (l) => l.warehouse === warehouse && l.location.toLowerCase() === rowLocation.toLowerCase()
            );

            if (rowMatch) {
                return { name: rowMatch.location, id: rowMatch.id, isNew: false };
            }

            const existsInArray = locations.some(
                (l) => l.warehouse === warehouse && l.location === rowLocation
            );

            return { name: rowLocation, id: null, isNew: !existsInArray };
        }

        return { name: inputLocation, id: null, isNew: true };
    }

    /**
     * Ensures a location exists, creating it if necessary with resilient race-condition handling.
     */
    private async ensureLocationExists(
        warehouse: string,
        locationName: string,
        locations: Location[],
        ctx: { isAdmin: boolean; onLocationCreated?: (newLoc: Location) => void }
    ): Promise<{ id: string | null; name: string }> {
        const { isAdmin, onLocationCreated } = ctx;

        const resolved = this.resolveLocationName(locations, warehouse, locationName);

        if (!resolved.isNew) {
            return { id: resolved.id, name: resolved.name };
        }

        if (!isAdmin) {
            throw new AppError(`Unauthorized: Only administrators can create new locations ("${resolved.name}").`, 403);
        }

        try {
            const { data: newLoc, error } = await this.supabase
                .from('locations')
                .insert([
                    {
                        warehouse,
                        location: resolved.name,
                        max_capacity: 550,
                        zone: 'UNASSIGNED',
                        is_active: true,
                    },
                ])
                .select()
                .single();

            if (error) {
                if (error.code === '23505') { // Unique Violation
                    const { data: recoveredLoc } = await this.supabase
                        .from('locations')
                        .select('id')
                        .eq('warehouse', warehouse)
                        .eq('location', resolved.name)
                        .single();

                    if (recoveredLoc) {
                        return { id: recoveredLoc.id, name: resolved.name };
                    }
                    throw error;
                }
                throw error;
            }

            if (newLoc) {
                if (onLocationCreated) onLocationCreated(newLoc as any);
                return { id: newLoc.id, name: resolved.name };
            }
        } catch (err: any) {
            if (err instanceof AppError) throw err;
            throw new AppError(err.message || 'Failed to resolve location', err.code, err);
        }

        return { id: null, name: resolved.name };
    }

    /**
     * Orchestrates adding stock to a SKU, handling dynamic location creation and merges.
     */
    async addItem(
        warehouse: string,
        newItem: InventoryItemInput & { isReversal?: boolean; force_id?: string | number },
        locations: Location[],
        ctx: InventoryServiceContext
    ) {
        const { userInfo, trackLog } = ctx;

        // 1. Zod Validation (Includes Coercion for numbers)
        const validatedInput = InventoryItemInputSchema.parse(newItem);
        const qty = validatedInput.Quantity;

        // 2. HARDENING: Resolve destination before touching stock
        const destination = await this.ensureLocationExists(warehouse, validatedInput.Location || '', locations, ctx);

        // 3. Process Inventory Persistence (UPSERT logic via BaseService)
        const { data: existingItemData } = await this.supabase
            .from(this.table)
            .select('*')
            .eq('SKU', validatedInput.SKU)
            .eq('Warehouse', warehouse)
            .eq('Location', destination.name)
            .maybeSingle();

        if (existingItemData) {
            const existingItem = this.validate(existingItemData);
            const newTotal = (existingItem.Quantity || 0) + qty;

            await this.update(existingItem.id, {
                Quantity: newTotal,
                location_id: destination.id,
            } as any);

            await trackLog(
                {
                    sku: validatedInput.SKU,
                    to_warehouse: warehouse,
                    to_location: destination.name,
                    quantity: qty,
                    prev_quantity: existingItem.Quantity || 0,
                    new_quantity: newTotal,
                    action_type: 'ADD',
                    item_id: String(existingItem.id),
                    is_reversed: newItem.isReversal || false,
                },
                userInfo
            );

            return { action: 'updated', id: existingItem.id };
        }

        // 4. Insert New Item
        const itemToInsert: any = {
            ...validatedInput,
            Warehouse: warehouse,
            Location: destination.name,
            location_id: destination.id,
        };

        if (newItem.force_id) {
            itemToInsert.id = newItem.force_id;
        }

        const inserted = await this.create(itemToInsert);

        await trackLog(
            {
                sku: validatedInput.SKU,
                to_warehouse: warehouse,
                to_location: destination.name,
                quantity: qty,
                prev_quantity: 0,
                new_quantity: qty,
                action_type: 'ADD',
                item_id: String(inserted.id),
                is_reversed: newItem.isReversal || false,
            },
            userInfo
        );

        return { action: 'inserted', id: inserted.id };
    }

    /**
     * Detailed movement logic between locations.
     */
    async moveItem(
        sourceItem: InventoryModel,
        targetWarehouse: string,
        targetLocation: string,
        qty: number,
        locations: Location[],
        ctx: InventoryServiceContext,
        isReversal = false
    ) {
        const { userInfo, trackLog } = ctx;

        // 1. HARDENING: Resolve destination before touching source
        const destination = await this.ensureLocationExists(targetWarehouse, targetLocation, locations, ctx);

        // 2. Server-side check
        const { data: serverItem, error: checkError } = await this.supabase
            .from(this.table)
            .select('Quantity')
            .eq('id' as any, sourceItem.id as any)
            .single();

        if (checkError || !serverItem) throw new AppError('Item no longer exists in source.', 404);
        const serverQty = serverItem.Quantity ?? 0;
        if (serverQty < qty) {
            throw new AppError(`Stock mismatch: Found ${serverQty} units, but tried to move ${qty}.`, 409);
        }

        // 3. Update Source (Zero-Stock Handling: Keep the row)
        const remainingQty = ((serverItem.Quantity as number) || 0) - qty;
        await this.update(sourceItem.id as any, { Quantity: remainingQty } as any);

        // 4. Update Destination
        const { data: existingTargetData } = await this.supabase
            .from(this.table)
            .select('*')
            .eq('SKU', sourceItem.SKU)
            .eq('Warehouse', targetWarehouse)
            .eq('Location', destination.name)
            .maybeSingle();

        if (existingTargetData) {
            const existingTarget = this.validate(existingTargetData);
            const newTotal = (existingTarget.Quantity || 0) + qty;
            await this.update(existingTarget.id, {
                Quantity: newTotal,
                location_id: destination.id,
            } as any);
        } else {
            await this.create({
                SKU: sourceItem.SKU,
                Warehouse: targetWarehouse,
                Location: destination.name,
                location_id: destination.id,
                Quantity: qty,
                sku_note: sourceItem.sku_note,
                Status: sourceItem.Status || 'Active',
            } as any);
        }

        // 5. Track Log
        await trackLog(
            {
                sku: sourceItem.SKU,
                from_warehouse: sourceItem.Warehouse as any,
                from_location: sourceItem.Location || undefined,
                to_warehouse: targetWarehouse as any,
                to_location: destination.name,
                quantity: qty,
                prev_quantity: serverItem.Quantity || 0,
                new_quantity: remainingQty,
                action_type: 'MOVE',
                is_reversed: isReversal,
            },
            userInfo
        );
    }

    /**
     * Fetches inventory items with advanced filtering, search, and pagination.
     * Includes total count for UI pagination components.
     * 
     * @returns {Promise<{ data: InventoryModel[], count: number | null }>} 
     */
    async getWithFilters({
        search = '',
        page = 0,
        limit = 100
    }: {
        search?: string;
        page?: number;
        limit?: number;
    } = {}): Promise<{ data: InventoryModel[]; count: number | null }> {
        let query = this.supabase
            .from(this.table)
            .select('*', { count: 'exact' }) as any;

        query = query.gt('Quantity', 0)
            .order('Warehouse', { ascending: false }) // Puts LUDLOW (L) before ATS (A)
            .order('Location', { ascending: true })
            .order('SKU', { ascending: true });

        if (search) {
            // Search across SKU and Location fields
            query = query.or(`SKU.ilike.%${search}%,Location.ilike.%${search}%`);
        }

        const from = page * limit;
        const to = from + limit - 1;

        const { data, error, count } = await query.range(from, to);

        if (error) {
            this.handleError(error);
        }

        // Standardized validation through BaseService
        const validatedData = this.validateArray(data);

        return {
            data: validatedData as any,
            count,
        };
    }
}

// Export a singleton instance for application-wide use
export const inventoryService = new InventoryService();
