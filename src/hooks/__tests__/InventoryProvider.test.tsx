import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { InventoryProvider, useInventory } from '../InventoryProvider';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// --- MOCKS ---

// Mock default export of supabase if used, or named export.
// Based on provider: import { supabase } from '../lib/supabase';
vi.mock('../../lib/supabase', () => ({
    supabase: {
        channel: vi.fn().mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
        }),
        removeChannel: vi.fn(),
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
}));

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn().mockReturnValue({
        isAdmin: true,
        user: { id: 'test-user-id', email: 'test@example.com' },
        profile: { full_name: 'Test Admin' },
    }),
}));

// Mock InventoryLogs hook
vi.mock('../useInventoryLogs', () => ({
    useInventoryLogs: vi.fn().mockReturnValue({
        trackLog: vi.fn().mockResolvedValue(null),
        fetchLogs: vi.fn().mockResolvedValue([]),
        undoAction: vi.fn(),
    }),
}));

// Mock LocationManagement hook
vi.mock('../useLocationManagement', () => ({
    useLocationManagement: vi.fn().mockReturnValue({
        locations: [
            { id: 'loc1', warehouse: 'LUDLOW', location: 'Row 1', max_capacity: 100 },
        ],
    }),
}));

// Mock InventoryService
vi.mock('../../services/inventory.service', () => ({
    inventoryService: {
        getWithFilters: vi.fn().mockResolvedValue({ data: [], count: 0 }),
        checkExistence: vi.fn().mockResolvedValue(false),
        addItem: vi.fn().mockResolvedValue({ action: 'inserted' }),
        updateItem: vi.fn().mockResolvedValue({ action: 'updated' }),
        moveItem: vi.fn().mockResolvedValue(null),
        deleteItem: vi.fn().mockResolvedValue(null),
    },
}));

// Mock InventoryAPI
vi.mock('../../services/inventoryApi', () => ({
    inventoryApi: {
        fetchInventory: vi.fn().mockResolvedValue([]),
        fetchAllMetadata: vi.fn().mockResolvedValue([]),
        upsertMetadata: vi.fn().mockResolvedValue(null),
    }
}));

// Mock Query Client
const createTestQueryClient = () => new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
        mutations: {
            retry: false,
        },
    },
});

describe('InventoryProvider', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        vi.clearAllMocks();
        queryClient = createTestQueryClient();
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <InventoryProvider>
                {children}
            </InventoryProvider>
        </QueryClientProvider>
    );

    it('should initialize with empty inventory', async () => {
        const { result } = renderHook(() => useInventory(), { wrapper });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.inventoryData).toEqual([]);
    });

    it('should optimistically update quantity when updateQuantity is called', async () => {
        // Setup initial data
        const initialItem = {
            id: 1,
            sku: 'TEST-SKU',
            warehouse: 'LUDLOW' as const,
            location: 'Row 1',
            quantity: 10,
            sku_metadata: null,
            created_at: new Date()
        };

        // Mock API return for initial load
        const { inventoryApi } = await import('../../services/inventoryApi');
        vi.mocked(inventoryApi.fetchInventory).mockResolvedValue([initialItem]);

        const { result } = renderHook(() => useInventory(), { wrapper });

        await waitFor(() => {
            expect(result.current.inventoryData).toHaveLength(1);
        });

        // ACTION: Update Quantity (+5)
        await act(async () => {
            // Calling updateQuantity
            await result.current.updateQuantity('TEST-SKU', 5, 'LUDLOW', 'Row 1');
        });

        // ASSERT: Optimistic Update (Immediate)
        // The mock updateQuantity implementation in the provider uses setInventoryData locally immediately.
        expect(result.current.inventoryData[0].quantity).toBe(15);
    });

    // NOTE: Testing Rollback properly requires mocking the 'useMutation' behavior which is hard-coded inside the provider
    // via '@tanstack/react-query'. Since we are using a real QueryClient in the test wrapper,
    // we rely on intercepting the `mutationFn`. 
    // However, `updateQuantity` in provider calls `updateQuantityMutation.mutate`.
    // We can simulate a failure in the mutation execution if we can control `queryClient` or mock `supabase` calls inside the mutationFn.
    // The `mutationFn` in `InventoryProvider` calls `supabase.from(...).select(...)` and `.update(...)`.
    // Let's force `supabase.update` to fail.

    it('should rollback optimistic update if mutation fails', async () => {
        // Setup initial data
        const initialItem = {
            id: 2,
            sku: 'FAIL-SKU',
            warehouse: 'LUDLOW' as const,
            location: 'Row 1',
            quantity: 100,
            sku_metadata: null,
            created_at: new Date()
        };

        const { inventoryApi } = await import('../../services/inventoryApi');
        vi.mocked(inventoryApi.fetchInventory).mockResolvedValue([initialItem]);

        // Mock Supabase Update to FAIL
        const { supabase } = await import('../../lib/supabase');
        // We need specific mocking behavior here. 
        // 1. Initial load -> success
        // 2. Mutation snapshot -> success
        // 3. Mutation update -> FAIL

        // Complex mock implementation
        const selectMock = vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation((_col, _val) => ({
                single: vi.fn().mockResolvedValue({ data: initialItem, error: null }),
                maybeSingle: vi.fn().mockResolvedValue({ data: initialItem, error: null }),
            }))
        }));

        const updateMock = vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockResolvedValue({ error: new Error('Simulated Database Error') })
        }));

        vi.mocked(supabase.from).mockImplementation((table) => {
            if (table === 'inventory') {
                return {
                    select: selectMock,
                    update: updateMock,
                    insert: vi.fn(),
                    delete: vi.fn(),
                } as any;
            }
            return { select: vi.fn() } as any;
        });


        const { result } = renderHook(() => useInventory(), { wrapper });

        await waitFor(() => {
            expect(result.current.inventoryData).toHaveLength(1);
        });

        // 1. Optimistic Update
        await act(async () => {
            await result.current.updateQuantity('FAIL-SKU', -10, 'LUDLOW', 'Row 1');
        });

        // Verify Optimistic State
        expect(result.current.inventoryData[0].quantity).toBe(90);
        
        // 3. Verify Rollback
        await waitFor(() => {
            expect(result.current.inventoryData[0].quantity).toBe(100);
        }, { timeout: 2000 }); // Wait for the debounce + mutation to fail

        expect(updateMock).toHaveBeenCalled();
    });

    /*
     * Test for Offline Queueing simulation
     * Since we can't easily disconnect the test runner from network, we verify that
     * 1. updateQuantity updates local state immediately
     * 2. Calls are batched/debounced (verifying the timer logic)
     */
    it('should debounce multiple rapid updates into a single mutation call', async () => {
        const initialItem = {
            id: 3,
            sku: 'BATCH-SKU',
            warehouse: 'ATS' as const,
            location: 'Row 2',
            quantity: 50,
            sku_metadata: null,
            created_at: new Date()
        };

        const { inventoryApi } = await import('../../services/inventoryApi');
        vi.mocked(inventoryApi.fetchInventory).mockResolvedValue([initialItem]);

        // Reset supabase mocks to be successful
        const { supabase } = await import('../../lib/supabase');
        const updateMock = vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
        }));
        vi.mocked(supabase.from).mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: initialItem })
                })
            }),
            update: updateMock
        } as any);

        const debouncedWrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <InventoryProvider debounceDelay={50}>
                    {children}
                </InventoryProvider>
            </QueryClientProvider>
        );

        const { result } = renderHook(() => useInventory(), { wrapper: debouncedWrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));

        // Fire 3 rapid updates
        await act(async () => {
            await result.current.updateQuantity('BATCH-SKU', 1, 'ATS', 'Row 2');
        });
        await act(async () => {
            await result.current.updateQuantity('BATCH-SKU', 2, 'ATS', 'Row 2');
        });
        await act(async () => {
            await result.current.updateQuantity('BATCH-SKU', 3, 'ATS', 'Row 2');
        });

        // Verify optimistic total: 50 + 1 + 2 + 3 = 56
        expect(result.current.inventoryData[0].quantity).toBe(56);

        // Verify mutation hasn't fired yet
        expect(updateMock).not.toHaveBeenCalled();

        // Verify mutation called ONCE with total delta 6
        await waitFor(() => {
            expect(updateMock).toHaveBeenCalledTimes(1);
            // The final quantity in the DB would be the original + delta
            expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
                quantity: 56
            }));
        }, { timeout: 200 }); // Wait for 50ms debounce + buffer
    });
});
