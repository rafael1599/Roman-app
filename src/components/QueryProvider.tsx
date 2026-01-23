import { ReactNode } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient, persister } from '../lib/query-client';

interface QueryProviderProps {
    children: ReactNode;
}

/**
 * Enhanced Query Provider with IndexedDB persistence.
 * Ensures the app works offline and preserves cache across sessions.
 */
export function QueryProvider({ children }: QueryProviderProps) {
    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister,
                // Optional: you can define which parts of the cache to persist here
                maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
            }}
        >
            {children}
            {/* Devtools will only be visible in development mode */}
            {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
        </PersistQueryClientProvider>
    );
}
