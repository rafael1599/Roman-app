# Análisis de Resiliencia: Antes vs. Ahora

He analizado el historial de Git y el código previo a la gran refactorización para entender cómo el sistema lograba ser una "roca" ante intermitencias de internet.

## El Sistema Antiguo ("The Rock")

### 1. Motor de Persistencia (IndexedDB + TanStack Query)
El sistema utilizaba `idb-keyval` junto con `PersistQueryClient` de TanStack Query.
*   **Mecanismo**: Todo el inventario se descargaba y se guardaba en una base de datos local del navegador (IndexedDB).
*   **Resiliencia**: Si el internet fallaba, el sistema seguía sirviendo los datos desde el dispositivo. No había "loading spinners" bloqueantes.

### 2. Mutaciones en Cola (OfflineFirst Mode)
Las acciones (sumar, restar, mover) no usaban `await supabase` directamente en el componente.
*   **Antes**: Se disparaban mutaciones configuradas con `networkMode: 'offlineFirst'`.
*   **Efecto**: Si no había red, la mutación se quedaba **en pausa** en el cliente y se ejecutaba automáticamente en cuanto el `SyncStatusIndicator` detectaba conexión.

### 3. Reconstrucción de Identidad Local
En el `InventoryProvider.tsx` antiguo (commit `dc7388c`), el sistema gestionaba un `demoMode` y estados locales agresivos. El "Undo" se hacía reconstruyendo el objeto desde los logs que ya estaban en el cliente, sin necesidad de consultar a la base de datos para saber "cómo era el item antes de borrarlo".

## El Sistema Actual ("Server-First RPC")

### 1. El Switch a Direct Calls
En la refactorización reciente (PR de Service Isolation), movimos la lógica a `inventory.service.ts` y cambiamos a llamadas directas:
```typescript
await supabase.from('inventory').update(...)
```
*   **Consecuencia**: Al usar `await`, el hilo de ejecución de la UI se bloquea o espera una respuesta HTTP. Si el internet es lento o hay un micro-corte, la promesa falla y el usuario recibe un error instantáneo.

### 2. El Dilema del RPC
Tu nueva lógica de Undo usa una **Función de Base de Datos (RPC)**. 
*   **Pros**: Garantiza atomicidad absoluta (ACID) y seguridad de datos. No hay "ghost items" porque la base de datos tiene la última palabra.
*   **Contras**: Es **100% dependiente de la conexión**. Un RPC no puede ejecutarse de forma optimista en el cliente porque la lógica vive en el servidor de Postgres.

## Diagnóstico del "Punto de Ruptura"

La resiliencia se perdió principalmente en el commit `0e0ecf8` (Refactor: Centralizar lógica en InventoryService). Al querer centralizar y validar todo con Zod y Servicios, "puenteamos" (bypassed) la capa de gestión de caché y mutaciones de TanStack Query que manejaba la cola offline.

## Propuesta para Recuperar la Resiliencia

Para volver a tener un sistema "tanque" sin perder la seguridad de los RPCs, deberíamos implementar un patrón de **Optimistic UI con Reconciliación Posterior**:

1.  **Actualización Instantánea de UI**: El `InventoryProvider` debe modificar su estado local `setInventoryData` **antes** de llamar a la API.
2.  **Cola de Sincronización**: En lugar de llamar al RPC directamente, deberíamos envolver la llamada en un `useMutation` de TanStack Query con `networkMode: 'offlineFirst'`.
3.  **Snapshotting en Logs**: Para que el Undo funcione offline, el Log debe llevar un "snapshot" (JSONB) del item antes de la acción. Así, si no hay internet para ejecutar el RPC, el cliente puede "reconstruir" el item temporalmente en su memoria basándose en el snapshot del log.

### Resumen Técnico
> "El sistema antiguo lograba la resiliencia usando **TanStack Query Persist Client + IndexedDB** y lo perdimos cuando cambiamos a **Llamadas Imperativas Directas (await) y Lógica en Servidor (RPC)**. Para recuperar la resiliencia offline, debemos restaurar la **Capa de Abstracción de Mutaciones** y habilitar el **Optimistic UI** en el Provider."
