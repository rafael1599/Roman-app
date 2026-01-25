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
     * Orchestrates adding stock to a SKU, handling dynamic location creation and merges.
     * Implements "Insert -> Catch -> Recover" for resilient location creation.
     */
    async addItem(
        warehouse: string,
        newItem: InventoryItemInput & { isReversal?: boolean; force_id?: string | number },
        locations: Location[],
        ctx: InventoryServiceContext
    ) {
        const { isAdmin, userInfo, trackLog, onLocationCreated } = ctx;

        // 1. Zod Validation (Includes Coercion for numbers)
        const validatedInput = InventoryItemInputSchema.parse(newItem);
        const qty = validatedInput.Quantity;

        // 2. Resolve Target Location
        const {
            name: targetLocation,
            id: existingId,
            isNew,
        } = this.resolveLocationName(locations, warehouse, validatedInput.Location || '');
        let locationId = existingId;

        // 3. Handle resilient Location Creation
        if (isNew) {
            if (!isAdmin) {
                throw new AppError(`Unauthorized: Only administrators can create new locations ("${targetLocation}").`, 403);
            }

            try {
                // Try to insert
                const { data: newLoc, error } = await this.supabase
                    .from('locations')
                    .insert([
                        {
                            warehouse,
                            location: targetLocation,
                            max_capacity: 550,
                            zone: 'UNASSIGNED',
                            is_active: true,
                        },
                    ])
                    .select()
                    .single();

                if (error) {
                    // CODE 23505: Unique Violation (Someone else created it just now)
                    if (error.code === '23505') {
                        const { data: recoveredLoc } = await this.supabase
                            .from('locations')
                            .select('id')
                            .eq('warehouse', warehouse)
                            .eq('location', targetLocation)
                            .single();

                        if (recoveredLoc) {
                            locationId = recoveredLoc.id;
                        } else {
                            throw error; // If we can't recover, throw the original
                        }
                    } else {
                        throw error; // Other database errors
                    }
                } else if (newLoc) {
                    locationId = newLoc.id;
                    if (onLocationCreated) onLocationCreated(newLoc as any);
                }
            } catch (err: any) {
                // Wrap in AppError if not already one
                if (err instanceof AppError) throw err;
                throw new AppError(err.message || 'Failed to resolve location', err.code, err);
            }
        }

        // 4. Process Inventory Persistence (UPSERT logic via BaseService)
        const { data: existingItemData } = await this.supabase
            .from(this.table)
            .select('*')
            .eq('SKU', validatedInput.SKU)
            .eq('Warehouse', warehouse)
            .eq('Location', targetLocation)
            .maybeSingle();

        if (existingItemData) {
            const existingItem = this.validate(existingItemData);
            const newTotal = (existingItem.Quantity || 0) + qty;

            await this.update(existingItem.id, {
                Quantity: newTotal,
                location_id: locationId,
            } as any);

            await trackLog(
                {
                    sku: validatedInput.SKU,
                    to_warehouse: warehouse,
                    to_location: targetLocation,
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

        // 5. Insert New Item
        const itemToInsert: any = {
            ...validatedInput,
            Warehouse: warehouse,
            Location: targetLocation,
            location_id: locationId,
        };

        if (newItem.force_id) {
            itemToInsert.id = newItem.force_id;
        }

        const inserted = await this.create(itemToInsert);

        await trackLog(
            {
                sku: validatedInput.SKU,
                to_warehouse: warehouse,
                to_location: targetLocation,
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
            .select('*', { count: 'exact' })
            .gt('Quantity', 0)
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
            data: validatedData,
            count,
        };
    }
}

// Export a singleton instance for application-wide use
export const inventoryService = new InventoryService();

