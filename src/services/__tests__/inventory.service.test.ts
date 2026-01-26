import { describe, it, expect, vi } from 'vitest';
import { inventoryService } from '../inventory.service';
import { mockSupabase } from '../../test/mocks/supabase';

describe('InventoryService', () => {
    describe('checkExistence', () => {
        it('should return true if item exists at coordinates', async () => {
            // Setup mock result
            mockSupabase.maybeSingle.mockResolvedValue({
                data: { id: 123 },
                error: null
            });

            const exists = await inventoryService.checkExistence(
                'SKU-TEST',
                'Row 1',
                'LUDLOW'
            );

            expect(mockSupabase.from).toHaveBeenCalledWith('inventory');
            expect(mockSupabase.eq).toHaveBeenCalledWith('SKU', 'SKU-TEST');
            expect(mockSupabase.eq).toHaveBeenCalledWith('Warehouse', 'LUDLOW');
            expect(exists).toBe(true);
        });

        it('should return false if item does not exist', async () => {
            mockSupabase.maybeSingle.mockResolvedValue({
                data: null,
                error: null
            });

            const exists = await inventoryService.checkExistence(
                'SKU-NONE',
                'Row 2',
                'ATS'
            );

            expect(exists).toBe(false);
        });
    });

    describe('updateItem', () => {
        const mockCtx: any = {
            userInfo: { performed_by: 'Test User', user_id: '123' },
            trackLog: vi.fn().mockResolvedValue(null)
        };

        const mockLocations: any[] = [
            { id: 'loc-1', warehouse: 'LUDLOW', location: 'Row 1' },
            { id: 'loc-2', warehouse: 'LUDLOW', location: 'Row 2' }
        ];

        const originalItem: any = {
            id: 'item-orig',
            SKU: 'SKU-A',
            Warehouse: 'LUDLOW',
            Location: 'Row 1',
            Quantity: 5,
            sku_note: 'Vieja',
            created_at: new Date().toISOString()
        };

        it('should throw Conflict error if renaming to an existing SKU in target location', async () => {
            // Setup: Target location has SKU-B already
            mockSupabase.maybeSingle.mockResolvedValue({
                data: {
                    id: 'item-conflict',
                    SKU: 'SKU-B',
                    Location: 'Row 1',
                    Warehouse: 'LUDLOW',
                    Quantity: 1,
                    created_at: new Date().toISOString()
                },
                error: null
            });

            const updatedData: any = {
                SKU: 'SKU-B',
                Warehouse: 'LUDLOW',
                Location: 'Row 1',
                Quantity: 5
            };

            await expect(inventoryService.updateItem(originalItem, updatedData, mockLocations, mockCtx))
                .rejects.toThrow(/Cannot rename to "SKU-B"/);

            expect(mockSupabase.update).not.toHaveBeenCalled();
            expect(mockSupabase.delete).not.toHaveBeenCalled();
        });

        it('should merge quantities and updated note if incoming has content', async () => {
            // Setup: Target has SKU-A, Qty 10, Note "Original"
            mockSupabase.maybeSingle.mockResolvedValue({
                data: {
                    id: 'item-target',
                    SKU: 'SKU-A',
                    Location: 'Row 2',
                    Quantity: 10,
                    sku_note: 'Original',
                    Warehouse: 'LUDLOW',
                    created_at: new Date().toISOString()
                },
                error: null
            });

            const updatedData: any = {
                SKU: 'SKU-A',
                Warehouse: 'LUDLOW',
                Location: 'Row 2',
                Quantity: 5,
                sku_note: 'NUEVA DESCRIPCIÓN'
            };

            const result = await inventoryService.updateItem(originalItem, updatedData, mockLocations, mockCtx);

            expect(result.action).toBe('consolidated');
            // Verify quantity sum (10 + 5) and note overwrite
            expect(mockSupabase.update).toHaveBeenCalledWith({
                Quantity: 15,
                location_id: 'loc-2',
                sku_note: 'NUEVA DESCRIPCIÓN'
            });
            // Verify that we targeted the correct ID for update and delete
            expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'item-target');
            expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'item-orig');

            expect(mockSupabase.delete).toHaveBeenCalled();
        });

        it('should protect and preserve existing note if incoming is empty/spaces', async () => {
            // Setup: Target has SKU-A, Note "Descripción Valiosa"
            mockSupabase.maybeSingle.mockResolvedValue({
                data: {
                    id: 'item-target',
                    SKU: 'SKU-A',
                    Location: 'Row 2',
                    Quantity: 10,
                    sku_note: 'Descripción Valiosa',
                    Warehouse: 'LUDLOW',
                    created_at: new Date().toISOString()
                },
                error: null
            });

            const updatedData: any = {
                SKU: 'SKU-A',
                Warehouse: 'LUDLOW',
                Location: 'Row 2',
                Quantity: 5,
                sku_note: '   ' // Empty spaces
            };

            await inventoryService.updateItem(originalItem, updatedData, mockLocations, mockCtx);

            // Verify note was preserved
            expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
                sku_note: 'Descripción Valiosa'
            }));
        });
    });
});
