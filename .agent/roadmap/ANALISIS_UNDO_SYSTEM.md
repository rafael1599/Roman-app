# Sistema de Undo/Redo: Análisis de Fallos y Propuesta de Refactorización

## 1. Diagnóstico del Problema Actual

Basado en la evidencia visual (Foto) y tu descripción ("se muestra el restock pero la cantidad no cambia"), hemos identificado la causa raíz más probable: **Fragmentación de Inventario (Ghost Inventory)**.

### El Incidente "Row 1" vs "Unassigned"
1.  **La Acción Original (Pick/Deduct):**
    *   Se restaron 5 unidades.
    *   El sistema registró correctamente que salieron de **Row 1**.
2.  **El Intento de Undo:**
    *   El sistema intentó devolver las 5 unidades.
    *   **El Fallo:** En lugar de devolverlas a **Row 1**, el sistema las envió a **UNASSIGNED**.
    *   **Consecuencia:** Tu inventario es matemáticamente correcto en el total global, pero **incorrecto en la ubicación física**. Tienes 5 unidades "fantasma" en UNASSIGNED que no ves en el estante físico (Row 1), y Row 1 sigue teniendo 5 unidades menos.

### ¿Por qué sucedió?
En `useInventoryLogs.ts`, la lógica de undo para `DEDUCT` tiene este código:
```typescript
Location: log.from_location || 'UNASSIGNED'
```
Si por alguna razón el campo `from_location` llega vacío, `null`, o el servicio de inventario no logra resolver el *match* exacto del nombre de la ubicación, el sistema activa el mecanismo de seguridad y lo envía a 'UNASSIGNED'. Esto evita perder el stock, pero rompe la integridad de la ubicación.

---

## 2. Análisis Arquitectónico: ¿Por qué es frágil el código actual?

Actualmente, aplicamos un patrón de **"Reconstrucción Optimista basada en Strings"**.

### Los 3 Grandes Problemas (Pros y Contras)

#### A. Dependencia de Strings (Nombres de Ubicación)
*   **Problema:** Dependemos de que el texto "Row 1" sea idéntico en el log y en la tabla de ubicaciones. Si alguien edita el nombre de una ubicación o hay un espacio en blanco extra, el sistema de Undo pierde el rastro y tira el inventario a Unassigned.
*   **Contra:** Extremadamente frágil ante cambios.
*   **Pro:** Fácil de leer para humanos en la base de datos cruda.

#### B. Lógica de Negocio en el Cliente (React Hooks)
*   **Problema:** `useInventoryLogs.ts` contiene lógica crítica de decisión (`if DEDUCT then addItem...`). Si el navegador se cierra a mitad de proceso, o si la red falla después de crear el log pero antes de actualizar el stock, los datos quedan corruptos.
*   **Contra:** No hay garantía de atomicidad (ACID). El log puede decir "Reversed" sin que el stock real haya cambiado.
*   **Pro:** Rápido de implementar inicialmente.

#### C. Falta de Identidad Persistente
*   **Problema:** Los logs no saben *a qué ID de fila de inventario* afectaron. Solo saben que afectaron al SKU "X" en la ubicación "Y". Al intentar deshacer, el sistema tiene que "adivinar" cuál es la fila de inventario correcta buscando por SKU+Ubicación.

---

## 3. Propuesta de Refactorización: "Command Pattern & Transactions"

Para solucionar esto de raíz y profesionalizar el código, sugiero migrar hacia un sistema transaccional robusto.

### La Nueva Estrategia: "Atomic Command History"

En lugar de reconstruir la lógica inversa manualmente en el frontend, definiremos las acciones como comandos atómicos que contienen toda la información necesaria para revertirse a sí mismos usando IDs, no nombres.

#### Paso 1: Endurecer los Logs (Database Level)
Necesitamos agregar columnas de **IDs inmutables** a la tabla `inventory_logs`. No confíes en el nombre "Row 1", confía en `location_id: abc-123`.

#### Paso 2: Centralizar la Lógica (Service Layer)
Mover la lógica de `useInventoryLogs` y `InventoryProvider` a un servicio unificado o Edge Function. El frontend solo debe decir `undo(log_id)`, y el servidor se encarga de todo en una sola transacción.

### Ejemplo de Refactorización Propuesta

#### A. Estructura de Datos (Schema)
```typescript
// En lugar de guardar solo nombres, guardamos las referencias exactas a los IDs en el momento de la acción
interface RobustLog {
  id: string;
  action_type: 'MOVE' | 'ADD' | 'DEDUCT';
  // Referencias inmutables
  target_inventory_id: Nullable<number>; // ID exacto de la fila de inventario afectada
  location_id: Nullable<string>;        // ID exacto de la ubicación física
  // Snapshots para rollback perfecto
  quantity_change: number;
  snapshot_before: jsonb; // { quantity: 10, location_id: '...' }
}
```

#### B. Implementación del Servicio (Pseudo-código)

**El gran cambio:** En lugar de `if (DEDUCT) addItem(...)`, usamos una lógica de inversión matemática agnóstica.

```typescript
// inventory.service.ts

async function undoLog(logId: string) {
  // 1. Iniciar Transacción SQL (RPC en Supabase)
  return await supabase.rpc('execute_undo', { target_log_id: logId });
}
```

**Función SQL (Postgres RPC) - La verdadera solución robusta:**
Al mover esto a la base de datos (o a un servicio backend muy controlado), garantizamos que nunca haya desincronización.

```sql
-- Ejemplo conceptual de la función en base de datos
CREATE FUNCTION execute_undo(target_log_id UUID) RETURNS VOID AS $$
DECLARE
  v_log inventory_logs%ROWTYPE;
BEGIN
  -- Obtener el log
  SELECT * INTO v_log FROM inventory_logs WHERE id = target_log_id;

  -- Validar estado
  IF v_log.is_reversed THEN RAISE EXCEPTION 'Already undone'; END IF;

  -- REVERTIR EFECTO
  -- Gracias a tener location_id y inventory_id, no hay ambigüedad.
  -- No importa si la ubicación se llama "Row 1" o "Fila Uno", el ID es el mismo.
  
  UPDATE inventory 
  SET quantity = quantity - v_log.quantity_change -- Invertir matemática simple
  WHERE id = v_log.target_inventory_id;
  
  -- Marcar como revertido
  UPDATE inventory_logs SET is_reversed = TRUE WHERE id = target_log_id;
  
  -- Si algo falla, todo se cancela (ROLLBACK automático)
END;
$$ LANGUAGE plpgsql;
```

---

## 4. Plan de Acción Recomendado

Dado que necesitas solucionar esto ahora pero quieres un sistema mejor en el futuro:

### Fase 1: Solución Inmediata (Parche Seguro)
Corregir el bug de "Row 1 vs Unassigned" en el código actual.
*   **Acción:** Modificar `undoAction` en `useInventoryLogs.ts`.
*   **Lógica:** Si `log.from_location` existe, forzar al sistema a buscar *esa* ubicación específica por nombre antes de hacer el `addItem`. Si no la encuentra, lanzar error en lugar de crear un item en "UNASSIGNED". Es preferible que le diga al usuario "No encuentro la ubicación original" a que cree stock fantasma.

### Fase 2: Implementación de Mejores Prácticas (La Refactorización)
1.  **Migrar a IDs:** Asegurar que todos los logs guarden `location_id` y `inventory_id`.
2.  **Snapshotting:** Guardar el estado previo de la fila afectada en el log (`prev_state`).
3.  **Transacciones:** Implementar el RPC en Supabase para el Undo. Esto elimina el 90% del código en el frontend y hace el sistema a prueba de balas contra fallos de red.

### Aspectos Adicionales a Considerar
*   **Concurrencia:** ¿Qué pasa si dos admins intentan hacer Undo al mismo tiempo? (El sistema RPC lo soluciona con bloqueos de fila).
*   **Items Eliminados:** Si un undo intenta restaurar un item en una ubicación que fue borrada físicamente, el sistema actual falla. El nuevo sistema debería verificar si `location_id` aún existe.
