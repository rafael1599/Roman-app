# Audit de Optimizacion — PickD

Documento generado tras la investigacion del bug "Maximum update depth exceeded".
Cada seccion describe un problema, su impacto, los archivos afectados y la estrategia de correccion.

---

## OPT-1: `useLocationManagement()` instanciado 10+ veces independientemente

### Problema

`useLocationManagement()` es un hook con su propio `useState` + `useEffect` que hace `fetch` a la tabla `locations` de Supabase. Cada componente que lo llama crea una instancia completamente independiente: su propio state, su propio fetch, su propia copia de los datos.

### Archivo fuente

`src/features/inventory/hooks/useLocationManagement.ts`

### Consumidores (10 archivos)

| Archivo                     | Destructura                                                               |
| --------------------------- | ------------------------------------------------------------------------- |
| `InventoryModal.tsx`        | `locations`                                                               |
| `useLocationSuggestions.ts` | `locations`                                                               |
| `useInventoryMutations.ts`  | `locations`                                                               |
| `LocationList.tsx`          | `locations`, `loading`, `updateLocation`, `refresh`, `deactivateLocation` |
| `PickingSessionView.tsx`    | `locations`                                                               |
| `MovementModal.tsx`         | `locations`                                                               |
| `StockCountScreen.tsx`      | `locations` (alias `allMappedLocations`)                                  |
| `InventoryScreen.tsx`       | `locations`, `createLocation`, `updateLocation`, `deactivateLocation`     |
| `PickingContext.tsx`        | `locations`                                                               |
| `PickingSummaryModal.tsx`   | `locations`                                                               |

### Cadena de multiplicacion

Algunos consumidores se llaman dentro de hooks que a su vez son llamados por otros:

- `useInventory()` llama `useInventoryMutations()` que llama `useLocationManagement()`
- `useInventory()` se llama en 16 archivos
- Resultado: **cada `useInventory()` dispara un fetch adicional** a `locations`

### Impacto

- **~10-16 fetches identicos** a la tabla `locations` en cada page load
- Cada instancia mantiene su propia copia en memoria (no comparten state)
- Cada instancia re-renderiza su componente host cuando su fetch completa

### Estrategia propuesta

Migrar a `useQuery` de TanStack Query (igual que inventory). Beneficios:

- Cache global automatica: un solo fetch real, N consumidores comparten el resultado
- `staleTime` configurable para evitar refetches innecesarios
- Las funciones de mutacion (`createLocation`, `updateLocation`, `deactivateLocation`) se mantienen con `useMutation` + invalidacion del query

### Riesgos

- `LocationList.tsx` usa `refresh` para forzar un refetch manual — debe mapearse a `queryClient.invalidateQueries()`
- `InventoryScreen.tsx` y `LocationList.tsx` usan `createLocation`/`updateLocation`/`deactivateLocation` — deben ser `useMutation` con `onSuccess: invalidate`
- Ambos hacen `window.location.reload()` despues de guardar (esto es independiente del hook, no se rompe)
- Ningun consumidor depende del `loading` initial del hook para mostrar un spinner (excepto `LocationList.tsx`)

---

## OPT-2: `AuthContext` value no memoizado

### Problema

En `src/context/AuthContext.tsx` linea 275-286:

```tsx
const value = {
  user,
  role,
  profile,
  isAdmin: role === 'admin' && !viewAsUser,
  isSystemAdmin: role === 'admin',
  viewAsUser,
  loading,
  signOut,
  updateProfileName,
  toggleAdminView,
};
return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
```

`value` es un objeto nuevo en cada render del AuthProvider. Esto causa que **TODOS los 16 consumidores de `useAuth()`** se re-rendericen cada vez que AuthProvider re-renderiza, aunque ninguna propiedad haya cambiado.

### Consumidores (16 archivos)

| Archivo                          | Destructura                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `useInventoryData.ts`            | `isAdmin`, `user`, `profile`                                                                           |
| `useInventoryLogs.ts`            | `isAdmin`                                                                                              |
| `useInventoryMutations.ts`       | `user`, `profile`                                                                                      |
| `usePresence.ts`                 | `user`                                                                                                 |
| `IntegratedMapManager.tsx`       | `isAdmin`                                                                                              |
| `PickingSessionView.tsx`         | `user`                                                                                                 |
| `SessionInitializationModal.tsx` | `user`                                                                                                 |
| `PickingCartDrawer.tsx`          | `user`                                                                                                 |
| `OrdersScreen.tsx`               | `user`                                                                                                 |
| `StockCountScreen.tsx`           | `profile`                                                                                              |
| `HistoryScreen.tsx`              | `isAdmin`, `profile`, `user`                                                                           |
| `InventoryScreen.tsx`            | `isAdmin`, `user`, `profile`                                                                           |
| `PickingContext.tsx`             | `user`                                                                                                 |
| `LayoutMain.tsx`                 | `isAdmin`, `profile`                                                                                   |
| `UserMenu.tsx`                   | `profile`, `signOut`, `updateProfileName`, `isAdmin`, `isSystemAdmin`, `viewAsUser`, `toggleAdminView` |
| `App.tsx`                        | `user`, `loading`                                                                                      |

### Impacto

- Cada setState dentro de AuthProvider (incluso los que no cambian nada visible) fuerza re-render en cascada de 16 archivos
- `updateLastSeen` useEffect (linea 161-171) se ejecuta cuando `user?.id` cambia — esto re-renderiza AuthProvider, lo cual re-renderiza todos los consumers

### Estrategia propuesta

Envolver `value` en `useMemo`:

```tsx
const value = useMemo(
  () => ({
    user,
    role,
    profile,
    isAdmin: role === 'admin' && !viewAsUser,
    isSystemAdmin: role === 'admin',
    viewAsUser,
    loading,
    signOut,
    updateProfileName,
    toggleAdminView,
  }),
  [user, role, profile, viewAsUser, loading, signOut, updateProfileName, toggleAdminView]
);
```

### Riesgos

- `signOut`, `updateProfileName`, `toggleAdminView` son funciones definidas inline o con `useCallback`. Si no son estables, el useMemo se invalidara frecuentemente.
  - `signOut`: async function inline → **necesita `useCallback`**
  - `updateProfileName`: async function inline → **necesita `useCallback`**
  - `toggleAdminView`: ya usa `setViewAsUser` funcional, pero no esta envuelto en `useCallback` → **necesita `useCallback`**
- Si alguna de estas funciones captura variables del closure que cambian, envolver en useCallback puede causar stale closures. Hay que verificar cada una.

---

## OPT-3: `useInventory()` retorna objeto nuevo con funciones nuevas cada render

### Problema

En `src/features/inventory/hooks/useInventoryData.ts` lineas 125-163, el hook retorna un objeto plano con funciones `async` inline que se recrean en cada render:

```tsx
return {
  inventoryData,
  ludlowData,
  atsData, // useMemo'd - estables
  updateQuantity, // inline async - NUEVO cada render
  addItem, // inline async - NUEVO cada render
  updateItem, // inline async - NUEVO cada render
  moveItem, // inline async - NUEVO cada render
  deleteItem, // inline async - NUEVO cada render
  syncFilters, // inline arrow - NUEVO cada render
  // ... mas funciones
};
```

### Consumidores (16 archivos)

Los datos (`inventoryData`, `ludlowData`, `atsData`) son estables (useMemo).
Las funciones (`updateQuantity`, `addItem`, etc.) son inestables.

Archivos que usan **funciones inestables**:
| Archivo | Funciones usadas |
|---------|-----------------|
| `InventoryScreen.tsx` | `updateQuantity`, `addItem`, `updateItem`, `moveItem`, `deleteItem`, `syncFilters`, `setShowInactive` |
| `StockCountScreen.tsx` | `updateItem`, `deleteItem` |
| `HistoryScreen.tsx` | `undoAction` |
| `PickingCartDrawer.tsx` | `processPickingList` |
| `OptimizationReportCard.tsx` | `moveItem` |
| `InventoryModal.tsx` | `updateSKUMetadata` |
| `useLocationSuggestions.ts` | `fetchLogs` |
| `useOrderProcessing.ts` | `updateLudlowInventory`, `updateAtsInventory` |

### Impacto

- Cada componente que usa estas funciones como dep en `useCallback`, `useMemo`, o `useEffect` se invalida cada render
- Ejemplo directo: `InventoryScreen.tsx` linea 76-78 tiene `syncFilters` en deps de useEffect — se ejecuta cada render (es no-op, pero desperdicia ciclos)

### Estrategia propuesta

Envolver las funciones wrapper en `useCallback` y el return completo en `useMemo`:

```tsx
const updateQuantity = useCallback(async (sku, delta, warehouse, location, isReversal) => {
  await mutUpdateQuantity.mutateAsync({ ... });
}, [mutUpdateQuantity]);

// ... similar para las demas

return useMemo(() => ({ inventoryData, updateQuantity, ... }), [deps]);
```

### Riesgos

- Las funciones wrapper acceden a `mutUpdateQuantity.mutateAsync`, `mutAddItem.mutateAsync`, etc. Estos son estables (React Query garantiza estabilidad de mutation handles).
- `updateSKUMetadata` llama `inventoryApi.upsertMetadata` directamente — no depende de state, es seguro.
- `syncFilters` y `exportData` son no-ops — se pueden convertir a referencias de modulo constantes.
- Las funciones `updateInventory`, `updateLudlowInventory`, `updateAtsInventory` son no-ops tambien.
- `getAvailableStock` accede a `globalData` — necesita `globalData` como dep del useCallback.

---

## OPT-4: `ViewModeContext` value no memoizado

### Problema

En `src/context/ViewModeContext.tsx` lineas 28-43, el value del provider no esta memoizado:

```tsx
return (
  <ViewModeContext.Provider value={{
    viewMode, setViewMode, externalDoubleCheckId, setExternalDoubleCheckId,
    externalOrderId, setExternalOrderId, isNavHidden, setIsNavHidden,
    isSearching, setIsSearching,
  }}>
```

### Consumidores (10 archivos)

| Archivo                 | Destructura                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `InventoryModal.tsx`    | `setIsNavHidden`                                                |
| `PickingCartDrawer.tsx` | `externalDoubleCheckId`, `setExternalDoubleCheckId`             |
| `DoubleCheckHeader.tsx` | `setExternalDoubleCheckId`, `setExternalOrderId`, `setViewMode` |
| `OrdersScreen.tsx`      | `externalOrderId`, `setExternalOrderId`                         |
| `MovementModal.tsx`     | `setIsNavHidden`                                                |
| `HistoryScreen.tsx`     | `isSearching`, `setIsSearching`                                 |
| `InventoryScreen.tsx`   | `viewMode`, `isSearching`                                       |
| `SearchInput.tsx`       | `isSearching`, `setIsSearching`                                 |
| `BottomNavigation.tsx`  | `viewMode`, `setViewMode`, `isNavHidden`, `isSearching`         |
| `LayoutMain.tsx`        | `isSearching`                                                   |

### Impacto

- Menor que AuthContext porque ViewModeProvider rara vez re-renderiza espontaneamente (solo cuando su parent re-renderiza o cuando alguien llama un setter)
- Sin embargo, esta dentro de `AuthenticatedContent` que podria re-renderizarse por cambios en PickingContext

### Estrategia propuesta

```tsx
const value = useMemo(
  () => ({
    viewMode,
    setViewMode,
    externalDoubleCheckId,
    setExternalDoubleCheckId,
    externalOrderId,
    setExternalOrderId,
    isNavHidden,
    setIsNavHidden,
    isSearching,
    setIsSearching,
  }),
  [viewMode, externalDoubleCheckId, externalOrderId, isNavHidden, isSearching]
);
```

Nota: los `setX` de useState son estables por garantia de React — no necesitan estar en deps.

### Riesgos

- Practicamente cero. Todos los valores son primitivos o setters de useState (estables).
- No hay funciones custom que necesiten useCallback.

---

## OPT-5: `useInventoryLogs` tiene `trackLog` sin memoizar

### Problema

En `src/features/inventory/hooks/useInventoryLogs.ts` lineas 210-216:

```tsx
const trackLog = async (logData, userInfo, candidateLogId) => {
  return trackLogMutation.mutateAsync({ logData, userInfo, candidateLogId });
};
```

Esta funcion se recrea cada render. Se usa en el `useMemo` del return (linea 329):

```tsx
return useMemo(() => ({
  trackLog,       // <-- inestable, invalida el useMemo cada render
  fetchLogs,      // estable (useCallback)
  undoAction,     // estable (mutation handle)
  ...
}), [trackLog, fetchLogs, undoMutation]);
```

### Impacto

- Bajo para usuarios del hook, porque `trackLog` no se destructura directamente en ningun consumidor externo (solo se usa internamente en el inventory service)
- El useMemo se invalida cada render pero las propiedades destructuradas (`fetchLogs`, `undoAction`) son individualmente estables
- Desperdicio menor de ciclos de useMemo

### Estrategia propuesta

```tsx
const trackLog = useCallback(
  async (logData, userInfo, candidateLogId) => {
    return trackLogMutation.mutateAsync({ logData, userInfo, candidateLogId });
  },
  [trackLogMutation.mutateAsync]
);
```

### Riesgos

- `trackLogMutation.mutateAsync` es estable (garantia de TanStack Query) → el useCallback se creara una sola vez
- Cero riesgo de stale closure

---

## OPT-6: `InventoryScreen` syncFilters useEffect innecesario

### Problema

En `src/features/inventory/InventoryScreen.tsx` lineas 76-78:

```tsx
useEffect(() => {
  syncFilters({ search: debouncedSearch, showInactive });
}, [debouncedSearch, showInactive, syncFilters]);
```

`syncFilters` es un no-op definido en `useInventoryData.ts` linea 118:

```tsx
const syncFilters = (_filters?: any) => {};
```

### Impacto

- El useEffect se ejecuta cada vez que `syncFilters` cambia de referencia (cada render, ya que es inline)
- No hace nada util — es un stub de una API anterior que ya no existe

### Estrategia propuesta

Eliminar el useEffect completamente. Si en el futuro se necesita sync de filtros, se puede reimplementar con una referencia estable.

### Riesgos

- Cero. La funcion es literalmente un no-op.
- Si algun otro codigo depende del side-effect de este useEffect... no puede, porque no tiene side-effects.

---

## Orden de ejecucion recomendado

| Prioridad | ID    | Descripcion                        | Estado         |
| --------- | ----- | ---------------------------------- | -------------- |
| 1         | OPT-1 | `useLocationManagement` → useQuery | DONE (40a3827) |
| 2         | OPT-2 | Memoizar AuthContext value         | DONE (0d8a475) |
| 3         | OPT-4 | Memoizar ViewModeContext value     | DONE (0d8a475) |
| 4         | OPT-3 | Memoizar return de useInventory    | DONE (8c3432a) |
| 5         | OPT-6 | Eliminar syncFilters useEffect     | DONE (f79496f) |
| 6         | OPT-5 | useCallback para trackLog          | DONE (f79496f) |
