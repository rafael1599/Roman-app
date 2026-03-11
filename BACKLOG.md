# Roman-app — Backlog de Mejoras

> Mejoras pendientes ordenadas por impacto en el usuario final.
> Actualizado: 2026-03-11

---

## Prioridad 1 — Impacto Alto (operación diaria / integridad de datos)

### 1. Combinar órdenes del mismo shop
- **Estado:** Por hacer.
- Permitir **combinar varias órdenes** cuando pertenecen al mismo shop, consolidando sus items en una sola orden.
- **Impacto:** reduce trabajo duplicado de picking y verificación; ahorra tiempo significativo en el día a día.

### 2. Order number en label de pallets (vista de órdenes) — COMPLETADO
- **Estado:** Completado.
- `ORDER #:` agregado en Page A del PDF de la vista de órdenes, debajo de la dirección y encima de PALLETS/UNITS/LOAD.
- **Archivo:** `OrdersScreen.tsx:413`

### 3. Barra de capacidad de locations no refleja correctamente el uso
- **Estado:** Regresión — funcionaba correctamente hace ~4 semanas.
- La barra de progreso de capacidad (actual vs total) **no se actualiza correctamente en ninguna location** (no solo row 18, aplica a todas).
- **Impacto:** el equipo no puede confiar en la capacidad reportada; decisiones de almacenamiento se toman a ciegas.

### 4. Sesión de warehouse: inactividad 5min + selector de perfil
- **Estado:** Por hacer.
- La cuenta de warehouse debe bloquearse tras **5 minutos de inactividad**.
- Al reactivarse, mostrar un **selector de perfil sin contraseña**.
- **Impacto:** actualmente cualquiera puede operar bajo la sesión de otro usuario sin que se registre quién hizo qué.

---

## Prioridad 2 — Impacto Bajo (mejoras de conveniencia)

### 5. Auto-inicio del script al reiniciar laptop
- **Estado:** Por hacer.
- Configurar el script de sincronización para que se ejecute automáticamente al encender/reiniciar (launchd plist en macOS).
- **Impacto:** evita olvido manual; solo afecta al admin.

---

## Ya Implementado (verificado en código)

| Mejora | Evidencia |
|--------|-----------|
| Orden completada no regresa a double-check | Guards `.neq('status', 'completed')` + botón X oculto en `DoubleCheckView.tsx:306` |
| Order number en label de impresión | `PalletLabelsPrinter.tsx:111-116` |
| Jalar medidas al seleccionar item del buscador | `InventoryModal.tsx:471-475` auto-fill desde `sku_metadata` |
| Buscador de locations mantiene opciones visibles | `AutocompleteInput.tsx` con modal mobile y dropdown desktop |
| Persistencia de nueva location al agregar item | `useLocationManagement.ts` con auto-creación |
| Order number clickeable en History → preview picking | `HistoryScreen.tsx:570-580`, commit `55926d1` |
| Validación de items con 0 unidades | `InventoryModal.tsx:291-298` — traducido a inglés |
| Textos de la app en inglés | `InventoryModal.tsx:296`, `HistoryScreen.tsx:1099` |
| Consolidation: desglose multi-tipo de picking | Backend: `adjust_distribution()` migración `20260310000001`. Frontend: `pickPlanMap` en `DoubleCheckView.tsx` |
| Limpieza distribution stale (qty=0) | Migración `20260311000001` + frontend ignora entries con qty=0 |
| Picked by / Checked by en Double Check y Summary | `DoubleCheckHeader.tsx`, `PickingSummaryModal.tsx`, `OrdersScreen.tsx` |
| Long-press → modal detalle + Edit Item | `DoubleCheckView.tsx` con `InventoryModal` integrado |
| Color Total Units en pallets | `DoubleCheckView.tsx` — `text-blue-400` |

---
