import { get, set, del } from 'idb-keyval';
import { QueryClient } from '@tanstack/react-query';
import {
    PersistedClient,
    Persister,
} from '@tanstack/react-query-persist-client';

/**
 * Cache Versioning - increment this to force-invalidate all client caches.
 */
const CACHE_VERSION = 'v1.0.0';
const BASE_CACHE_KEY = 'roman-inventory-cache';
const VERSIONED_KEY = `${BASE_CACHE_KEY}-${CACHE_VERSION}`;

/**
 * Creates an IndexedDB persister using idb-keyval.
 * Includes versioning logic to prevent loading stale "zombie" data.
 */
export function createIDBPersister(idbValidKey: IDBValidKey = VERSIONED_KEY): Persister {
    return {
        persistClient: async (client: PersistedClient) => {
            await set(idbValidKey, client);
        },
        restoreClient: async () => {
            return await get<PersistedClient>(idbValidKey);
        },
        removeClient: async () => {
            await del(idbValidKey);
        },
    };
}

/**
 * Global QueryClient configuration.
 * Aggressive caching and offline-first policies for warehouse operations.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Data is considered fresh for 5 minutes
            staleTime: 1000 * 60 * 5,
            // Keep unused data in cache for 7 days (crucial for offline)
            gcTime: 1000 * 60 * 60 * 24 * 7,
            // If no network, don't fail, return cached data
            networkMode: 'offlineFirst',
            // Minimal retries to avoid wasting battery/bandwidth on bad connections
            retry: 1,
            // Refetch on window focus but only if data is stale
            refetchOnWindowFocus: true,
        },
        mutations: {
            // Mutations also favor offline queueing if implemented later
            networkMode: 'offlineFirst',
        },
    },
});

export const persister = createIDBPersister();
