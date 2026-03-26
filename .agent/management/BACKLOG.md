# PickD — Backlog de Mejoras

> Mejoras pendientes ordenadas por impacto en el usuario final.
> Actualizado: 2026-03-26
>
> **Formato:** cada item incluye `[fecha hora]` de creación para trazabilidad y `<!-- id: xxx -->` para tracking.
> **Single source of truth** — no editar BACKLOG.md en la raíz del proyecto (es un puntero a este archivo).

---

## Prioridad 1 — Impacto Alto (operación diaria / integridad de datos)

### ~~1. Combinar órdenes del mismo shop~~ — COMPLETADO <!-- id: task-007 -->

- **Creado:** `[2026-03-11 10:00]` · **Desarrollado:** `[2026-03-18 09:00]` · **Verificado:** `[2026-03-20]`
- **Estado:** En producción. Migración aplicada, auto-combine en watchdog, SplitOrderModal, OrderChip con 🔗.
- **Archivos:** `watchdog-pickd/supabase_client.py`, `watchdog-pickd/watcher.py`, `SplitOrderModal.tsx`, `OrderChip.tsx`, `OrderSidebar.tsx`, migración `20260317000001_add_combine_meta.sql`

### ~~2. Agrupación visual de órdenes FedEx/General (drag-and-drop)~~ — COMPLETADO <!-- id: idea-010b -->

- **Creado:** `[2026-03-18 16:00]` · **Completado:** `[2026-03-25]`
- **Estado:** En producción. Drag-and-drop con @dnd-kit en la verification queue.
- Agrupación visual (no merge de items): cada orden mantiene independencia pero se asocian para completarse juntas. Long-press (300ms) inicia drag, drop sobre otra orden abre GroupOrderModal para seleccionar tipo (FedEx/General). Batch completion: completar una orden del grupo completa todas. Group-aware returnToPicker y deleteList para lifecycle limpio.
- **Archivos:** migración `20260325000003_order_groups.sql`, `GroupOrderModal.tsx`, `useOrderGroups.ts`, `DoubleCheckHeader.tsx`, `PickingCartDrawer.tsx`, `usePickingActions.ts`, `useDoubleCheckList.ts`, `usePickingSync.ts`

### ~~3. 📦 Distribución física inteligente~~ — COMPLETADO <!-- id: idea-015 -->

- **Creado:** `[2026-03-18 17:00]` · **Completado:** `[2026-03-25]`
- **Estado:** Implementado — auto-distribución inteligente para SKUs de bicicleta.
- SKUs de bicicleta (formato `NN-NNNNWW+`, ej: `03-4703GY`) se distribuyen automáticamente: TOWER×30, LINE×5, LINE×residuo. Non-bike SKUs mantienen el default anterior (1 TOWER×qty).
- **Triggers:** INSERT (trigger DB), move sin merge (trigger DB), move con merge (recálculo en `move_inventory_stock`). Frontend auto-fill en InventoryModal (add mode) y preview en MovementModal.
- **Archivos:** migración `20260325000002_smart_bike_distribution.sql`, `src/utils/distributionCalculator.ts`, `InventoryModal.tsx`, `MovementModal.tsx`

### ~~4. Prevenir reserva duplicada de items en el watcher~~ — COMPLETADO <!-- id: idea-021 -->

- **Creado:** `[2026-03-26 10:00]` · **Completado:** `[2026-03-26]`
- **Estado:** Implementado — `_to_cart_items()` ahora consulta picking_lists activas y resta stock reservado antes de asignar locations.
- **Problema:** `_to_cart_items()` en `watchdog-pickd/supabase_client.py` lee un snapshot del inventario al importar el PDF pero nunca consulta las `picking_lists` activas. Si dos PDFs llegan con segundos de diferencia y ambos necesitan el mismo SKU en la misma location (ej: D17), ambos ven el stock completo y ambos asignan esa location — aunque combinados excedan el stock real. La reserva "soft" que existe solo vive en el frontend (`usePickingActions.ts`) y se ejecuta cuando el picker marca "ready", no cuando el watcher crea la orden.
- **Escenario de falla:** PDF Order A llega, lee D17=30 units, asigna 20. PDF Order B llega 500ms después, lee D17=30 (no se dedujo nada), asigna 25. Total asignado=45, stock real=30.
- **Solución:**
  1. Query adicional en `_to_cart_items()`: consultar `picking_lists` con status `IN ('active', 'needs_correction', 'ready_to_double_check', 'double_checking')` y sumar qty reservada por SKU+location.
  2. Calcular `available = inventory.quantity - sum(pickingQty de órdenes activas para ese SKU+location)`.
  3. Si available < pickingQty para una location → saltar a la siguiente location con stock suficiente.
  4. Si ninguna location tiene suficiente → marcar `insufficient_stock=True` y agregar `available_qty` al item. La orden **se crea igualmente** con advertencia — el frontend muestra alerta: _"Needs X, only Y available"_. No bloquea el envío.
- **Archivos:** `watchdog-pickd/supabase_client.py` (`_to_cart_items()`, `combine_into_order()`)
- **Criterios de aceptación:**
  - Dos órdenes con el mismo SKU nunca asignan más stock del disponible en una misma location
  - Items con stock insuficiente llegan al frontend con `insufficient_stock=True` + `available_qty` y alerta visual
  - La orden se procesa normalmente (no se bloquea)
  - El query adicional no agrega >200ms de latencia al procesamiento de PDFs

### ~~5. Filtro de bike bins en Stock View~~ — COMPLETADO <!-- id: idea-022 -->

- **Creado:** `[2026-03-26 10:00]` · **Completado:** `[2026-03-26]`
- **Estado:** Implementado — checkbox "Show bike bins" en Stock View, desactivado por defecto.
- **Archivos:** `src/features/inventory/InventoryScreen.tsx`

### ~~6. Fotos de items (SKU metadata)~~ — COMPLETADO (Fase 1+2) <!-- id: idea-023 -->

- **Creado:** `[2026-03-26 10:00]` · **Completado:** `[2026-03-26]`
- **Estado:** Implementado — Fases 1 (captura) y 2 (visualización) en producción. Fase 3 (bulk upload) en P2.
- **Infraestructura:** Cloudflare R2 bucket `inventory-jamisbikes`, path `photos/{sku}.webp`. Edge function `upload-photo` maneja POST (upload) y DELETE. Compresión client-side: max 1200px, WebP 80%.
- **Archivos:**
  - Migración `20260326000001_add_image_url_to_sku_metadata.sql` — columna `image_url` en `sku_metadata`
  - `supabase/functions/upload-photo/index.ts` — edge function (auth JWT, R2 upload/delete, upsert DB)
  - `src/services/photoUpload.service.ts` — compresión + upload/delete desde frontend
  - `src/features/inventory/components/InventoryModal.tsx` — botón cámara, preview, upload en add/edit
  - `src/features/inventory/components/InventoryCard.tsx` — thumbnail 32x32 en Stock View

### ~~7. Warehouse Selection Refinement~~ <!-- id: task-005 --> — COMPLETADO

- **Estado:** Completado. `processOrder()` ya acepta `warehousePreferences` como segundo parámetro.

### 8. Sub-locations alfabéticas por ROW <!-- id: idea-024 -->

- **Creado:** `[2026-03-26 17:00]`
- **Estado:** Por hacer.
- **Problema:** Las ROWs son un espacio largo sin subdivisiones. Un picker que busca un SKU en "ROW 5" tiene que recorrer toda la fila. Con 30+ bikes por ROW, encontrar un item específico es lento e impreciso.
- **Solución:** Nueva columna `sublocation` (varchar, nullable) en la tabla `inventory`. Representa una sección alfabética dentro del ROW: A, B, C, etc.
  - `inventory.location = "ROW 5"` (no cambia)
  - `inventory.sublocation = "A"` (nuevo campo)
  - Display combinado en UI: `ROW 5A`
  - Items sin sublocation (`NULL`) siguen funcionando — backward compatible
- **Diseño técnico:**
  1. Migración: `ALTER TABLE inventory ADD COLUMN sublocation varchar(2)` — nullable, sin default
  2. Schema Zod: agregar `sublocation: z.string().max(2).optional()` a `inventory.schema.ts`
  3. Frontend display: concatenar `{location}{sublocation}` en InventoryCard, PickingSessionView, DoubleCheckView
  4. InventoryModal: nuevo campo input para sublocation (1-2 chars uppercase, validación client-side)
  5. AutocompleteInput: al seleccionar location "ROW 5", ofrecer sub-locations existentes (A, B, C...)
  6. Picking path: ordenar por location (ROW number) → sublocation (A, B, C) para ruta óptima
  7. `locationUtils.ts`: smart mapping `"5A"` → location=`"ROW 5"`, sublocation=`"A"`
  8. Realtime: `useInventoryRealtime.ts` ya escucha `inventory.*` — sublocation se propaga automáticamente
  9. Watcher: `_to_cart_items()` ya lee `location` de inventory — agregar `sublocation` al cart item
- **No requiere cambios en:**
  - Tabla `locations` (master config) — zone/capacity son por ROW, no por sublocation
  - Bike bins filter — regex `^ROW \d+$` matchea el `location` field que no cambia
  - Optimistic updates — sublocation es solo un campo más en el spread
- **Archivos:**
  - Migración SQL: `ALTER TABLE inventory ADD COLUMN sublocation varchar(2)`
  - `src/schemas/inventory.schema.ts` — agregar campo
  - `src/features/inventory/components/InventoryCard.tsx` — display `{location}{sublocation}`
  - `src/features/inventory/components/InventoryModal.tsx` — input sublocation
  - `src/features/inventory/InventoryScreen.tsx` — sorting por sublocation dentro de ROW
  - `src/utils/locationUtils.ts` — smart mapping
  - `src/features/picking/components/PickingSessionView.tsx` — display sublocation
  - `src/features/picking/components/DoubleCheckView.tsx` — display sublocation
  - `watchdog-pickd/supabase_client.py` — incluir sublocation en cart items
- **Criterios de aceptación:**
  - Se puede asignar sublocation A-Z a cualquier item en un ROW
  - Display muestra `ROW 5A` en todos los contextos (Stock View, Picking, Double Check, Labels)
  - Items sin sublocation muestran solo `ROW 5` — no se rompe nada existente
  - Picking path ordena por ROW → sublocation (A antes que B)
  - AutocompleteInput sugiere sub-locations existentes del ROW seleccionado
  - El watcher propaga sublocation al asignar locations

### 9. Multi-Address Customers <!-- id: idea-012 -->

- **Creado:** `[2026-03-26 17:00]` (promovido de P2)
- **Estado:** Por hacer.
- **Problema:** Cada customer tiene una sola dirección en la tabla `customers`. Si un cliente envía a Miami y después a NYC, hay que editar la dirección o crear un duplicado "Cliente (NYC)". No hay historial de direcciones anteriores.
- **Solución:** Nueva tabla `customer_addresses` con FK a `customers`. Cada customer puede tener N direcciones con un label descriptivo.
- **Diseño técnico:**
  1. Nueva tabla `customer_addresses`:
     - `id` (uuid PK), `customer_id` (FK → customers), `label` (text — "Main Warehouse", "Miami Office")
     - `street`, `city`, `state`, `zip_code` (text)
     - `is_default` (boolean — una sola default por customer)
     - `created_at` (timestamp)
  2. Migración de datos: copiar direcciones de `customers` → `customer_addresses` con `is_default = true`
  3. Nueva columna `shipping_address_id` en `picking_lists` (FK → `customer_addresses`)
  4. Columnas legacy en `customers` (street, city, state, zip_code) se mantienen temporalmente como fallback
- **Impacto en frontend:**
  - CustomerAutocomplete: al seleccionar customer con >1 dirección → selector de dirección
  - OrderSidebar: dropdown de direcciones del customer + botón "New address"
  - OrdersScreen save flow: guardar `shipping_address_id` en picking_list
  - Crear nueva dirección inline sin salir del flujo de orden
- **Impacto en watcher:**
  - `_resolve_customer()` usa la dirección `is_default` al crear órdenes desde PDF
  - No requiere cambios si el PDF no trae dirección (la default se usa)
- **Archivos:**
  - Migración SQL: crear `customer_addresses`, migrar datos, agregar `shipping_address_id`
  - `src/schemas/` — nuevo schema Zod para `customer_addresses`
  - `src/features/picking/components/CustomerAutocomplete.tsx` — address selector
  - `src/components/orders/OrderSidebar.tsx` — address dropdown + "New address"
  - `src/features/picking/OrdersScreen.tsx` — save flow con `shipping_address_id`
  - `watchdog-pickd/supabase_client.py` — usar default address
- **Criterios de aceptación:**
  - Un customer puede tener múltiples direcciones con labels
  - Al seleccionar customer en una orden, se puede elegir qué dirección usar
  - Hay una dirección default (`is_default`)
  - Direcciones existentes se migran automáticamente como default
  - Editar dirección en OrderSidebar actualiza `customer_addresses`, no `customers`
  - El watcher usa la dirección default al crear órdenes automáticamente
  - El label aparece en el dropdown para diferenciar direcciones

### ~~10. Preservar `internal_note` al mover item entre locations (Stock View)~~ — COMPLETADO <!-- id: idea-017 -->

- **Creado:** `[2026-03-24 10:00]` · **Completado:** `[2026-03-25]`
- **Estado:** Implementado — nota interna se preserva en moves y se restaura en undo.
- **Archivos:** migración `20260325000001_preserve_internal_note_on_move.sql`, `MovementModal.tsx`, `InventoryScreen.tsx`, `useInventoryData.ts`, `useInventoryMutations.ts`, `inventory.service.ts`, `supabase/types.ts`

### ~~11. Override de cantidad de items por pallet (Double Check View)~~ — COMPLETADO <!-- id: idea-018 -->

- **Creado:** `[2026-03-24 10:00]` · **Completado:** `[2026-03-24]`
- **Estado:** En producción.

### ~~12. Sumar peso de pallets al peso total de la orden en label (Orders View)~~ — COMPLETADO <!-- id: idea-019 -->

- **Creado:** `[2026-03-24 10:00]` · **Completado:** `[2026-03-24]`
- **Estado:** En producción.

### ~~13. Auto-parse de dirección completa en campo address (Orders View)~~ — COMPLETADO <!-- id: idea-020 -->

- **Creado:** `[2026-03-24 10:00]` · **Completado:** `[2026-03-24]`
- **Estado:** En producción.

---

## Prioridad 2 — Impacto Medio (mejoras de conveniencia)

- [ ] **Order List View**: When reviewing orders, show the picking list first with an option to print. <!-- id: idea-006 -->
- [ ] **Automatic Inventory Email**: Send full inventory table to Jamis's email. Plain list only, NO links. Edge function `send-daily-report` ya existe — falta query + formato + cron. <!-- id: idea-007 -->
- [ ] **Fotos Fase 3 — Bulk Upload**: Multi-file picker con batching concurrency (3-5), progress bar, mapeo SKU↔archivo por nombre o CSV. Reusar `uploadPhoto()` existente. <!-- id: idea-023-p3 -->
- [x] ~~**Order Merging**: Combine 2 separate orders into one picking session.~~ — Cubierto por task-007 + idea-010b. <!-- id: idea-010 -->

---

## 🐛 Bug Tracker

### Bugs confirmados en producción (actualizado 2026-03-26)

- [x] **[bug-002] Undo borra en vez de mover** — `[2026-03-21]` · **Fix:** `[2026-03-23]`
      Dos bugs encadenados: (1) `move_inventory_stock` construía el snapshot manualmente con `jsonb_build_object` usando qty post-move (=0) y sin distribution/item_name/is_active/location_id. (2) `undo_inventory_action` no restauraba la columna `distribution`. Fix: snapshot ahora usa `row_to_json(inventory.*)` pre-move, y undo restaura distribution con fallback para logs legacy.
      **Archivos:** migración `20260323000001_fix_undo_move_restore_distribution.sql` — redefine ambos RPCs.

- [x] **[bug-003] Watcher envía items con qty=0** — `[2026-03-21]` · **Fix:** `[2026-03-23]`
      El watchdog-pickd elegía locations por prioridad (PALLET>LINE>TOWER) sin verificar stock. Ahora filtra candidatos con qty=0 antes de ordenar: si hay stock en otra location, salta a esa; si qty=0 en todas, deja `location=None` + `insufficient_stock=True` para que el frontend muestre la alerta.
      **Archivos:** `watchdog-pickd/supabase_client.py` → `_to_cart_items()` (líneas 500-523).

- [x] **[bug-004] Órdenes duplicadas al retroceder de double-check a building** — `[2026-03-21]` · **Fix:** `[2026-03-23]`
      `returnToBuilding()` nulleaba `activeListId`, perdiendo la referencia al registro DB. Al generar path de nuevo, `generatePickingPath()` siempre hacía INSERT creando un duplicado. Fix: preservar `activeListId` al volver de double-check, y hacer UPDATE del registro existente en vez de INSERT. También se excluye la lista actual del cálculo de reservaciones para evitar falsos conflictos de stock.
      **Archivos:** `PickingContext.tsx` → `returnToBuilding()`, `usePickingActions.ts` → `generatePickingPath()`.

- [x] **[bug-005] Items con qty=0 aparecen en double-check sin advertencia** — `[2026-03-21]` · **Fix:** `[2026-03-23]`
      La causa raíz era bug-003. Resuelto con el fix de bug-003.

- [x] **[bug-006] Orden completada reaparece desde estado original (watcher vs edición manual)** — `[2026-03-21]` · **Fix:** `[2026-03-23]`
      Causa raíz compartida con bug-004. Watcher ya tenía protección (hash SHA-256, lookup por order_number).

- [x] **[bug-007] Verification list no muestra órdenes ready_to_double_check >24h** — `[2026-03-25]` · **Fix:** `[2026-03-25]`
      Fix: eliminar filtro de 24h, takeover ahora actualiza `updated_at`.
      **Archivos:** `useDoubleCheckList.ts`, `usePickingActions.ts`

---

## ✅ Completado

### Items con detalle

| Item                                                        | Creado         | Completado           | Estado                                                               |
| ----------------------------------------------------------- | -------------- | -------------------- | -------------------------------------------------------------------- |
| Fix: undo move pierde qty y distribution (bug-002)          | `[2026-03-21]` | `[2026-03-23]`       | Completado — snapshot con `row_to_json` + undo restaura distribution |
| Fix: watcher asigna location con qty=0 (bug-003 + bug-005)  | `[2026-03-21]` | `[2026-03-23]`       | Completado — filtro qty>0 en `_to_cart_items()`                      |
| Fix: órdenes duplicadas al volver de double-check (bug-004) | `[2026-03-21]` | `[2026-03-23]`       | Completado — preservar activeListId + UPDATE en vez de INSERT        |
| Fix: orden completada reaparece (bug-006)                   | `[2026-03-21]` | `[2026-03-23]`       | Completado — misma raíz que bug-004, watcher ya tenía protección     |
| Peso de pallets en peso total de label (idea-019)           | `[2026-03-24]` | `[2026-03-24]`       | Completado — +40 lbs por pallet al peso total                        |
| Auto-parse de dirección US (idea-020)                       | `[2026-03-24]` | `[2026-03-24]`       | Completado — pegar dirección completa auto-llena city/state/zip      |
| Override cantidad por pallet en double-check (idea-018)     | `[2026-03-24]` | `[2026-03-24]`       | Completado — override manual + redistribución automática             |
| Preservar internal_note en moves (idea-017)                 | `[2026-03-24]` | `[2026-03-25]`       | Completado — herencia auto, diálogo merge, undo restore              |
| Distribución física inteligente para bikes (idea-015)       | `[2026-03-18]` | `[2026-03-25]`       | Completado — TOWER×30, LINE×5, LINE×residuo; trigger + frontend      |
| Agrupación visual de órdenes FedEx/General (idea-010b)      | `[2026-03-18]` | `[2026-03-25]`       | Completado — DnD grouping, batch completion, group lifecycle         |
| Backfill distribución para items legacy (idea-015b)         | `[2026-03-25]` | `[2026-03-25]`       | Completado — auto-gen para items sin dist, TOWER<16→LINE             |
| 25 errores TypeScript strict-mode corregidos                | `[2026-03-25]` | `[2026-03-25]`       | Completado — AutocompleteInput genérico, casts en tests, etc.        |
| Unidades en vez de SKUs en combined orders (OrderSidebar)   | `[2026-03-25]` | `[2026-03-25]`       | Completado — muestra unit count por orden fuente                     |
| Parser robusto de direcciones US con fuzzy matching         | `[2026-03-25]` | `[2026-03-25]`       | Completado — parseUSAddress.ts con sufijos completos + abreviados    |
| Fix: verification list no mostraba órdenes >24h (bug-007)   | `[2026-03-25]` | `[2026-03-25]`       | Completado — eliminado filtro 24h, takeover actualiza updated_at     |
| Filtro de bike bins en Stock View (idea-022)                | `[2026-03-26]` | `[2026-03-26]`       | Completado — toggle "Show bike bins", búsqueda siempre global        |
| Prevenir reserva duplicada en watcher (idea-021)            | `[2026-03-26]` | `[2026-03-26]`       | Completado — reservation-aware stock en \_to_cart_items()            |
| 39 errores ESLint resueltos en 16 archivos                  | `[2026-03-26]` | `[2026-03-26]`       | Completado — React 19 purity rules, unused imports, proper typing    |
| Order number en label de pallets                            | `[2026-03-11]` | `[2026-03-11 14:28]` | Completado                                                           |
| Barra de capacidad de locations                             | `[2026-03-11]` | `[2026-03-18 10:00]` | Resuelto (fix de performance)                                        |
| Takeover muestra picker real                                | `[2026-03-11]` | `[2026-03-13 13:12]` | Completado                                                           |
| Auto-inicio watchdog-pickd                                  | `[2026-03-11]` | `[2026-03-18 09:30]` | Completado (launchd service)                                         |
| Stock Printing (filtros + nueva tab)                        | —              | —                    | Completado                                                           |
| iOS Pull-to-Refresh                                         | —              | —                    | Completado                                                           |
| Stock View Enhancements & History Fix                       | —              | —                    | Completado                                                           |
| Multi-user Support (Realtime takeover)                      | —              | —                    | Completado                                                           |
| TypeScript Core Migration                                   | —              | —                    | Completado                                                           |
| Robust Realtime System                                      | —              | —                    | Completado                                                           |
| Dual-Provider AI (Gemini + OpenAI)                          | —              | —                    | Completado                                                           |
| Full English Localization                                   | —              | —                    | Completado                                                           |
| Management Setup (.agent/)                                  | —              | —                    | Completado                                                           |
| Warehouse Selection Basic                                   | —              | —                    | Completado                                                           |

### Descartado

| Item                                                       | Razón                                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Sesión de warehouse: inactividad 5min + selector de perfil | No aplica — cada picker usa su propio dispositivo. `[2026-03-18]`                                           |
| Barcode/QR Integration (idea-001)                          | PDFs ya llegan parseados automáticamente, scanning no agrega valor operacional. `[2026-03-26]`              |
| Advanced Analytics Dashboard (idea-003)                    | Sin volumen suficiente para justificar dashboards complejos. `[2026-03-26]`                                 |
| Smart Rebalancing automático (idea-004)                    | Ya existen sugerencias manuales en useOptimizationReports — ejecución auto es riesgosa. `[2026-03-26]`      |
| Persistent Preferences (idea-005)                          | Solo LUDLOW activo, theme ya persiste en localStorage. `[2026-03-26]`                                       |
| Optimistic UI Fixes (task-006)                             | Analizado: flash issue mitigado por staleTime:Infinity + refetchOnWindowFocus:false. `[2026-03-26]`         |
| Offline Sync Edge Cases (bug-001)                          | Arquitectura ya maneja offline (TanStack persist + realtime). Sin reportes de fallos reales. `[2026-03-26]` |

### Verificado en código

| Mejora                                     | Fecha          | Evidencia                                             |
| ------------------------------------------ | -------------- | ----------------------------------------------------- |
| Orden completada no regresa a double-check | `[2026-03-11]` | Guards `.neq('status', 'completed')` + botón X oculto |
| Order number en label de impresión         | `[2026-03-11]` | `PalletLabelsPrinter.tsx:111-116`                     |
| Jalar medidas al seleccionar item          | `[2026-03-11]` | `InventoryModal.tsx:471-475` auto-fill                |
| Buscador de locations mantiene opciones    | `[2026-03-11]` | `AutocompleteInput.tsx`                               |
| Persistencia de nueva location al agregar  | `[2026-03-11]` | `useLocationManagement.ts`                            |
| Order number clickeable en History         | `[2026-03-11]` | `HistoryScreen.tsx:570-580`                           |
| Validación de items con 0 unidades         | `[2026-03-11]` | `InventoryModal.tsx:291-298`                          |
| Consolidation: desglose multi-tipo         | `[2026-03-10]` | `adjust_distribution()` + `pickPlanMap`               |
| Limpieza distribution stale (qty=0)        | `[2026-03-11]` | Migración `20260311000001`                            |
| Picked by / Checked by                     | `[2026-03-11]` | `DoubleCheckHeader.tsx`, `PickingSummaryModal.tsx`    |
| Long-press → modal detalle + Edit          | `[2026-03-11]` | `DoubleCheckView.tsx`                                 |
| Performance: memoize + stabilize refs      | `[2026-03-11]` | `AuthContext`, `ViewModeContext`, etc.                |
| Fix: infinite re-render InventoryModal     | `[2026-03-11]` | `InventoryModal.tsx`                                  |
| Fix: infinite fetch loop distribution      | `[2026-03-10]` | Distribution editing flow                             |
| Test: distribution e2e + realtime          | `[2026-03-10]` | E2E tests                                             |
| Script: prod→local data sync               | `[2026-03-11]` | `scripts/sync-local-db.sh`                            |

---
