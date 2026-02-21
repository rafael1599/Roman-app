# 🧪 Production Readiness Testing Scenarios

Este documento define los escenarios de prueba críticos para validar la migración a producción y las nuevas funcionalidades del sistema Roman App.

## 🟢 1. Verificación Post-Migración (Sanity Checks)
**Objetivo:** Asegurar que los datos migrados son íntegros y el sistema es accesible.

### Escenario 1.1: Visibilidad de Inventario Migrado
*   **Precondición:** Usuario logueado como Administrador.
*   **Pasos:**
    1.  Navegar a la pantalla principal de Inventario.
    2.  Verificar que el contador total de productos coincide con los ~631 registros migrados.
    3.  Buscar un SKU conocido (ej: `07-3641RD`).
*   **Resultado Esperado:** El SKU aparece con su cantidad correcta y ubicación. No hay errores de carga.

### Escenario 1.2: Integridad de Metadatos
*   **Precondición:** Inventario cargado.
*   **Pasos:**
    1.  Seleccionar un producto cualquiera.
    2.  Verificar que los detalles (Capacity, Warehouse, Notes) estén presentes.
*   **Resultado Esperado:** Datos consistentes. Ningún campo crítico aparece como `null` o indefinido.

---

## 📦 2. Gestión de Inventario (Atomicidad)
**Objetivo:** Validar que las operaciones de stock son precisas y previenen condiciones de carrera.

### Escenario 2.1: Ajuste de Stock en Tiempo Real
*   **Precondición:** Usuario 'A' y Usuario 'B' viendo el mismo SKU.
*   **Pasos:**
    1.  Usuario 'A' aumenta el stock de 10 a 15.
    2.  Inmediatamente después, Usuario 'B' intenta disminuir el stock de 10 a 5 (basado en dato viejo).
*   **Resultado Esperado:**
    *   El sistema procesa ambas transacciones secuencialmente gracias a RPC.
    *   Inventario final correcto: 15 (tras A) -> B intenta restar 5. Si B envía "restar 5", el final es 10. Si B envía "fijar en 5", el sistema debería manejar el conflicto o ganar el último (depende de la implementación RPC: `adjust` vs `set`). *Nuestra RPC es `adjust` (deltas)*, por lo tanto el resultado final debería ser matemático (10 + 5 - 5 = 10).

### Escenario 2.2: Prevención de Stock Negativo
*   **Precondición:** SKU con cantidad 5.
*   **Pasos:**
    1.  Intentar realizar una salida (picking) de 10 unidades.
*   **Resultado Esperado:** El sistema rechaza la operación con un error claro (o permite negativo solo si la configuración lo avala, pero la restricción DB lo prohíbe). El UI no debe permitir enviar la orden.

---

## 📡 3. Resiliencia Offline (Offline-First)
**Objetivo:** Garantizar que los operarios no pierden trabajo si falla la red.

### Escenario 3.1: Picking sin Conexión
*   **Precondición:** Dispositivo en "Modo Avión" (sin internet).
*   **Pasos:**
    1.  Iniciar una sesión de Picking.
    2.  Escanear/Seleccionar 3 productos y confirmar su recolección.
    3.  Finalizar la orden (botón "Complete").
    4.  Navegar a otra pantalla.
*   **Resultado Esperado:**
    *   La UI responde inmediatamente (`Optimistic UI`).
    *   La cola de sincronización (`OfflineQueue`) muestra 1 item pendiente.
    *   No hay errores de red bloqueantes.

### Escenario 3.2: Sincronización Automática
*   **Precondición:** Pasos del Escenario 3.1 completados.
*   **Pasos:**
    1.  Reactivar internet ("Modo Avión" OFF).
    2.  Observar el indicador de estado de red.
*   **Resultado Esperado:**
    *   El sistema detecta la conexión.
    *   La cola se procesa automáticamente.
    *   El inventario en el servidor se actualiza correctamente.
    *   El indicador vuelve a "Online/Synced".

---

## 📊 4. Reportes y Notificaciones (Daily Snapshot)
**Objetivo:** Validar la generación automática de reportes y envío de correos.

### Escenario 4.1: Generación Manual de Snapshot (Trigger)
*   **Precondición:** Acceso a Dashboard o URL de Edge Function.
*   **Pasos:**
    1.  Invocar la función `daily-snapshot` (vía curl o UI de admin si existe).
*   **Resultado Esperado:**
    *   Respuesta HTTP 200 OK.
    *   Nuevo registro en tabla `daily_inventory_snapshots`.
    *   Archivo JSON guardado en Cloudflare R2 bucket.

### Escenario 4.2: Recepción de Correo
*   **Precondición:** Snapshot generado exitosamente.
*   **Pasos:**
    1.  Revisar la bandeja de entrada de `rcordova@jamisbikes.com` (o el email configurado para pruebas).
*   **Resultado Esperado:**
    *   Correo recibido con asunto "Daily Inventory Report".
    *   Cuerpo del correo contiene resumen de movimientos.
    *   Enlace "SEE FULL INVENTORY" funcional y descarga el reporte correcto.

---

## 🛒 5. Flujo de Picking Optimizado
**Objetivo:** Verificar la eficiencia y limpieza del flujo de trabajo del operario.

### Escenario 5.1: Smart Reset Post-Picking
*   **Precondición:** Carrito de picking con items.
*   **Pasos:**
    1.  Completar el flujo de verificación ("Slide to Deduct").
    2.  Observar la pantalla inmediatamente después del éxito.
*   **Resultado Esperado:**
    *   Mensaje de éxito "Order Completed".
    *   **CRÍTICO:** La lista de picking se vacía automáticamente.
    *   El sistema está listo para la siguiente orden en < 1 segundo.
    *   No quedan "fantasmas" de la orden anterior.

### Escenario 5.2: Undo (Deshacer) Acción
*   **Precondición:** Item movido o pickeado por error.
*   **Pasos:**
    1.  Presionar el botón "Undo" en la notificación toast.
*   **Resultado Esperado:**
    *   La cantidad del inventario se revierte inmediatamente.
    *   El log de auditoría registra la reversión correctamente.
