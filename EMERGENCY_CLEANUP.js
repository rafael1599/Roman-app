/**
 * EMERGENCY CLEANUP - Ejecuta esto desde la consola del navegador
 * 
 * Copia y pega en DevTools Console (F12):
 */

// Opción 1: Eliminar todas las mutaciones de inventario
(async () => {
    const { queryClient } = await import('./src/lib/query-client.ts');
    const mutations = queryClient.getMutationCache().getAll();
    let removed = 0;

    mutations.forEach((m) => {
        if (Array.isArray(m.options.mutationKey) && m.options.mutationKey[0] === 'inventory') {
            queryClient.getMutationCache().remove(m);
            removed++;
        }
    });

    console.log(`✅ Removed ${removed} inventory mutations`);
    location.reload();
})();

// Opción 2: Nuclear - Eliminar toda la base de datos de caché
indexedDB.deleteDatabase('REACT_QUERY_OFFLINE_CACHE');
console.log('✅ Database deleted');
location.reload();

// Opción 3: Ejecutar la limpieza mejorada
(async () => {
    const { cleanupCorruptedMutations } = await import('./src/lib/query-client.ts');
    const count = await cleanupCorruptedMutations();
    console.log(`✅ Cleaned ${count} corrupted mutations`);
    if (count > 0) location.reload();
})();
