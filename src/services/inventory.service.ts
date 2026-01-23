import { supabase } from '../lib/supabase';
import { BaseService } from './base.service';
import { inventorySchema, InventoryModel } from '../models/inventory.schema';

/**
 * Service to handle inventory-specific business logic.
 * Extends BaseService to inherit standard CRUD operations.
 */
class InventoryService extends BaseService<'inventory'> {
    constructor() {
        super(supabase, 'inventory');
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

        // Transform and validate data using Zod schema
        const validatedData = (data || []).map((item) => inventorySchema.parse(item));

        return {
            data: validatedData,
            count,
        };
    }
}

// Export a singleton instance for application-wide use
export const inventoryService = new InventoryService();
