# 🛠️ Tareas de Ejecución

> Rastreo detallado de pasos técnicos. Basado en `implementation_plan.md`.

---

## 📍 Foco Actual
**Fase 3: Refinamiento & UX**

---

## 🟢 Fase 1: Estabilización
- [x] **Fix Date Parsing**: `log.schema.ts` (Zod coerce date).
- [x] **Fix Negative Quantity**: Permitir negativos en logs históricos.
- [x] **Fix ID Type Crash**: Soportar IDs numéricos y UUIDs.
- [x] **Migración TS**: Hooks base migrados a `.ts`.

## 🔵 Fase 2: Gestión de Identidad (Anti-Zombie)
- [x] **Sanitization**: `.trim()` en SKU y Ubicación.
- [x] **DB Update**: Columnas `item_id` y `previous_sku` en Supabase.
- [x] **Injection**: Inyectar `item_id` en todas las llamadas a `trackLog`.
- [x] **Merge Logic**: Implementar suma de cantidades si el destino existe.
- [x] **Smart Undo**: Prioridad de reversión por `item_id`.

## 🟡 Fase 3: Refinamiento & UX (Completada ✅)

### 🏗️ Integridad de Datos
- [x] **Restauración Real (Undo Delete)**: Modificar `addItem` para aceptar `force_id` y mantener el hilo histórico tras un borrado accidental.
- [x] **Ghost Location Handling**: Validar existencia de ubicación antes de ejecutar un Undo para evitar crashes.

### 🎨 Experiencia de Usuario (UI)
- [x] **Toast Feedback**: Notificaciones al realizar un *Merge* automático ("Item fusionado").
- [x] **Activity Description**: Detallar warehouse en descripciones de logs y UI del historial.

### 🧹 Deuda Técnica
- [x] **Stricter Types**: Eliminar `any` en `useInventoryLogs` y definir interfaces para cada tipo de `UndoAction`.
- [x] **Verification**: Lógica verificada; el sistema ahora inyecta `item_id` en todas las operaciones críticas.


