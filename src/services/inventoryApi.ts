import { supabase } from '../lib/supabase';
import {
  InventoryItemSchema,
  InventoryItemInputSchema,
  type InventoryItem,
  type InventoryItemInput,
} from '../schemas/inventory.schema';
import {
  SKUMetadataSchema,
  SKUMetadataInputSchema,
  type SKUMetadata,
  type SKUMetadataInput,
} from '../schemas/skuMetadata.schema';
import {
  LocationSchema,
  LocationInputSchema,
  type Location,
  type LocationInput,
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
  async fetchInventory(): Promise<InventoryItem[]> {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return validateArray(InventoryItemSchema, data || []);
  },

  /**
   * Fetch metadata for all SKUs
   */
  async fetchAllMetadata(): Promise<SKUMetadata[]> {
    const { data, error } = await supabase.from('sku_metadata').select('*');

    if (error) throw error;
    return validateArray(SKUMetadataSchema, data || []);
  },

  /**
   * OPTIMIZED: Fetch inventory with metadata in single query (reduces round-trips)
   * Use this instead of calling fetchInventory() + fetchAllMetadata() separately
   */
  async fetchInventoryWithMetadata(): Promise<any[]> {
    const { data, error } = await supabase
      .from('inventory')
      .select(
        `
                *,
                sku_metadata (*)
            `
      )
      .order('created_at', { ascending: false });

    if (error) throw error;
    // Since this is a nested join, we use unknown[] and then validate each partially or fully if needed.
    // For now, keeping as any[] to avoid complex joint-schema validation here, 
    // but the intention is to use InventoryItemWithMetadataSchema.
    return data || [];
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
    const { data, error } = await supabase.from('locations').select('*');

    if (error) throw error;
    return validateArray(LocationSchema, data || []);
  },

  /**
   * Update quantity for a specific inventory record
   */
  async updateQuantity(id: string | number, quantity: number): Promise<InventoryItem> {
    const { data, error } = await supabase
      .from('inventory')
      .update({ quantity: quantity })
      .eq('id', id as any)
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
      .upsert([validated], { onConflict: 'sku,warehouse,location' })
      .select()
      .single();

    if (error) throw error;
    return validateData(InventoryItemSchema, data);
  },

  /**
   * Delete an inventory item
   */
  async deleteItem(id: string | number): Promise<void> {
    const { error } = await supabase.from('inventory').delete().eq('id', id as any);

    if (error) throw error;
  },

  /**
   * Create a new location
   */
  async createLocation(location: LocationInput): Promise<Location> {
    const validated = validateData(LocationInputSchema, location);

    const { data, error } = await supabase.from('locations').insert([validated]).select().single();

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
      .eq('sku', sku)
      .eq('warehouse', warehouse)
      .eq('location', location)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return validateData(InventoryItemSchema, data);
  },
};
