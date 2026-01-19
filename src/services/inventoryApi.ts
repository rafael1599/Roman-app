import { supabase } from '../lib/supabaseClient';
import {
    InventoryItemSchema,
    InventoryItemInputSchema,
    type InventoryItem,
    type InventoryItemInput
} from '../schemas/inventory.schema';
import {
    SKUMetadataSchema,
    SKUMetadataInputSchema,
    type SKUMetadata,
    type SKUMetadataInput
} from '../schemas/skuMetadata.schema';
import {
    LocationSchema,
    LocationInputSchema,
    type Location,
    type LocationInput
} from '../schemas/location.schema';
import { validateData, validateArray } from '../utils/validate';

/**
 * Service for interacting with Inventory and Locations in Supabase.
 * Provides type-safe methods and centralized validation.
 */
export const inventoryApi = {
    /**
     * Fetch all inventory items
     */
    async fetchInventory(): Promise<any[]> {
        const { data, error } = await supabase
            .from('inventory')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        // We allow raw data for now because the join makes it a nested object
        return data || [];
    },

    /**
     * Fetch metadata for all SKUs
     */
    async fetchAllMetadata(): Promise<SKUMetadata[]> {
        const { data, error } = await supabase
            .from('sku_metadata')
            .select('*');

        if (error) throw error;
        return validateArray(SKUMetadataSchema, data || []);
    },

    /**
     * Update or create SKU metadata
     */
    async upsertMetadata(metadata: SKUMetadataInput): Promise<SKUMetadata> {
        const validated = validateData(SKUMetadataInputSchema, metadata);

        const { data, error } = await supabase
            .from('sku_metadata')
            .upsert([validated], { onConflict: 'sku' })
            .select()
            .single();

        if (error) throw error;
        return validateData(SKUMetadataSchema, data);
    },

    /**
     * Fetch all warehouse locations
     */
    async fetchLocations(): Promise<Location[]> {
        const { data, error } = await supabase
            .from('locations')
            .select('*');

        if (error) throw error;
        return validateArray(LocationSchema, data || []);
    },

    /**
     * Update quantity for a specific inventory record
     */
    async updateQuantity(id: string, quantity: number): Promise<InventoryItem> {
        const { data, error } = await supabase
            .from('inventory')
            .update({ Quantity: quantity })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return validateData(InventoryItemSchema, data);
    },

    /**
     * Create or update an inventory item
     */
    async upsertItem(item: InventoryItemInput): Promise<InventoryItem> {
        const validated = validateData(InventoryItemInputSchema, item);

        const { data, error } = await supabase
            .from('inventory')
            .upsert([validated], { onConflict: 'SKU,Warehouse,Location' })
            .select()
            .single();

        if (error) throw error;
        return validateData(InventoryItemSchema, data);
    },

    /**
     * Delete an inventory item
     */
    async deleteItem(id: string): Promise<void> {
        const { error } = await supabase
            .from('inventory')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * Create a new location
     */
    async createLocation(location: LocationInput): Promise<Location> {
        const validated = validateData(LocationInputSchema, location);

        const { data, error } = await supabase
            .from('locations')
            .insert([validated])
            .select()
            .single();

        if (error) throw error;
        return validateData(LocationSchema, data);
    },

    /**
     * Find item by unique SKU/Warehouse/Location combination
     */
    async findItem(sku: string, warehouse: string, location: string): Promise<InventoryItem | null> {
        const { data, error } = await supabase
            .from('inventory')
            .select('*')
            .eq('SKU', sku)
            .eq('Warehouse', warehouse)
            .eq('Location', location)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;
        return validateData(InventoryItemSchema, data);
    }
};
