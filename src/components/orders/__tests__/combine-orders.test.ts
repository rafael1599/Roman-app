import { describe, it, expect } from 'vitest';
import { CombineMetaSchema } from '../../../schemas/picking.schema';

/**
 * Tests for the auto-combine orders feature — schema validation and data structures.
 */

describe('CombineMetaSchema', () => {
    it('accepts valid combine_meta with source_orders', () => {
        const valid = {
            is_combined: true,
            source_orders: [
                { order_number: '878279', added_at: '2026-03-17T10:00:00Z', item_count: 5 },
                { order_number: '878280', added_at: '2026-03-17T10:05:00Z', item_count: 3, pdf_hash: 'abc123', file_name: 'order.pdf' },
            ],
        };

        const result = CombineMetaSchema.safeParse(valid);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data?.source_orders).toHaveLength(2);
            expect(result.data?.is_combined).toBe(true);
        }
    });

    it('accepts null (non-combined order)', () => {
        const result = CombineMetaSchema.safeParse(null);
        expect(result.success).toBe(true);
        expect(result.data).toBeNull();
    });

    it('accepts undefined (non-combined order)', () => {
        const result = CombineMetaSchema.safeParse(undefined);
        expect(result.success).toBe(true);
        expect(result.data).toBeUndefined();
    });

    it('rejects invalid structure', () => {
        const invalid = { is_combined: 'yes', source_orders: 'nope' };
        const result = CombineMetaSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('requires order_number and added_at in source_orders', () => {
        const missing = {
            is_combined: true,
            source_orders: [{ item_count: 5 }],
        };
        const result = CombineMetaSchema.safeParse(missing);
        expect(result.success).toBe(false);
    });
});

describe('Split logic — grouping items by source_order', () => {
    it('groups items correctly by source_order', () => {
        const items = [
            { sku: '03-3684BL', pickingQty: 4, source_order: '878279' },
            { sku: '03-3994BR', pickingQty: 2, source_order: '878280' },
            { sku: '03-1234XX', pickingQty: 1, source_order: '878279' },
            { sku: '03-5678YY', pickingQty: 3, source_order: '878280' },
        ];

        const groups: Record<string, typeof items> = {};
        for (const item of items) {
            const source = item.source_order || 'unknown';
            if (!groups[source]) groups[source] = [];
            groups[source].push(item);
        }

        expect(Object.keys(groups)).toEqual(['878279', '878280']);
        expect(groups['878279']).toHaveLength(2);
        expect(groups['878280']).toHaveLength(2);
        expect(groups['878279'][0].sku).toBe('03-3684BL');
        expect(groups['878280'][0].sku).toBe('03-3994BR');
    });

    it('handles items without source_order as unknown', () => {
        const items = [
            { sku: 'A', pickingQty: 1, source_order: '878279' },
            { sku: 'B', pickingQty: 2 },
        ];

        const groups: Record<string, typeof items> = {};
        for (const item of items) {
            const source = (item as any).source_order || 'unknown';
            if (!groups[source]) groups[source] = [];
            groups[source].push(item);
        }

        expect(groups['unknown']).toHaveLength(1);
        expect(groups['unknown'][0].sku).toBe('B');
    });

    it('handles triple-combined order (3 source orders)', () => {
        const items = [
            { sku: 'A', pickingQty: 1, source_order: '001' },
            { sku: 'B', pickingQty: 2, source_order: '002' },
            { sku: 'C', pickingQty: 3, source_order: '003' },
        ];

        const groups: Record<string, typeof items> = {};
        for (const item of items) {
            const source = item.source_order || 'unknown';
            if (!groups[source]) groups[source] = [];
            groups[source].push(item);
        }

        expect(Object.keys(groups)).toEqual(['001', '002', '003']);
    });
});
