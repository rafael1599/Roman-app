# 🎯 Plan de Implementación: Sistema de Integridad de Inventario

> **Objetivo:** Migrar de un modelo basado en SKUs (volátil) a uno de **Identidad Persistente (item_id)** para garantizar que el historial y las acciones de "Deshacer" sean infalibles.

---

## 📊 Estado del Proyecto
**Progreso Global:** [▓▓▓▓▓▓▓▓▓▓] 100%

- **Fase 1: Estabilización** — ██████████ 100% ✅
- **Fase 2: Identidad & Historial** — ██████████ 100% ✅
- **Fase 3: Refinamiento & UX** — ██████████ 100% ✅

---

## 🏗️ Arquitectura de Robustez

### 🛸 El Modelo "Anti-Zombie"
Para evitar registros huérfanos o duplicados:
1. **Identidad Única**: Cada item tiene un `item_id` permanente. El SKU es solo un nombre que puede cambiar.
2. **Historial Inteligente**: El log de actividad rastrea el `item_id`. Si renombras un SKU, el historial sigue al objeto, no al nombre.
3. **Fusión Automática (Merge)**: Si intentas mover o renombrar un item a una ubicación donde ya existe ese SKU, el sistema **suma las cantidades** en lugar de crear un conflicto.

---

## 📑 Fases de Ejecución

### 🟢 Fase 1: Cimientos & Estabilidad (Completada)
- ✅ Corrección de tipos de datos en esquemas Zod (Fechas e IDs).
- ✅ Tolerancia a valores históricos (cantidades negativas en logs de corrección).
- ✅ Migración de lógica crítica a TypeScript.

### 🔵 Fase 2: Identidad Persistente (Completada)
- ✅ Inyección de `item_id` en cada operación de inventario.
- ✅ Implementación de lógica de *Merge* para evitar SKUs duplicados en la misma ubicación.
- ✅ Rediseño de `undoAction` para usar `item_id` como ancla principal.

### 🟡 Fase 3: Refinamiento & UX (Actual)
- 🚧 **Restauración Real**: Permitir que "Deshacer Eliminar" recree el item con su ID original.
- 🚧 **Feedback Visual**: Notificar al usuario cuando ocurre una fusión de items (Toasts).
- 🚧 **Validaciones Defensivas**: Manejo de "Ubicaciones Fantasma" durante el Undo.
- 🚧 **Limpieza de Tipos**: Eliminar `any` persistentes en la lógica de logs.

