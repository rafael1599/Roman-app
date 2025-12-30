# CRUD de Locations - Warehouse Map Builder

## 🎯 Nueva Funcionalidad

El Map Builder ahora incluye un **CRUD completo** para gestionar ubicaciones del almacén.

---

## ✨ Características

### **1. 📍 Agregar Ubicaciones Personalizadas**

Puedes crear ubicaciones que no existen en tu inventario:

**Casos de uso:**
- Ubicaciones nuevas que aún no tienen productos
- Áreas especiales (DOCK-1, STAGING, QC-AREA)
- Zonas temporales
- Ubicaciones de preparación

**Cómo agregar:**
1. Click en **"Add Location"** (botón azul)
2. Ingresa el nombre (ej: "A-01", "DOCK-1", "STAGING")
3. Click en **"Add"**
4. La ubicación se agrega al final de la lista
5. Arrástrala a la posición correcta
6. Click en **"Save Map"**

### **2. ✏️ Editar Ubicaciones**

Solo puedes editar ubicaciones **personalizadas** (no las del inventario):

**Cómo editar:**
1. Encuentra la ubicación con etiqueta **(Custom)**
2. Click en el ícono de **lápiz** (Edit)
3. Modifica el nombre
4. Click en **"Update"**

**Nota:** Las ubicaciones del inventario no se pueden editar directamente.

### **3. 🗑️ Eliminar Ubicaciones**

Solo puedes eliminar ubicaciones **personalizadas**:

**Cómo eliminar:**
1. Encuentra la ubicación con etiqueta **(Custom)**
2. Click en el ícono de **basura** (Delete)
3. Confirma la eliminación
4. La ubicación se elimina permanentemente

**Advertencia:** Esta acción no se puede deshacer.

### **4. 🔄 Reordenar Ubicaciones**

Todas las ubicaciones (inventario + personalizadas) se pueden reordenar:

**Cómo reordenar:**
1. Click y arrastra el ícono de **grip** (≡)
2. Suelta en la nueva posición
3. Click en **"Save Map"**

---

## 🎨 Interfaz Visual

### **Ubicaciones del Inventario**
```
┌─────────────────────────────┐
│ ≡  A-01                     │
│    Position: 1              │
└─────────────────────────────┘
```

### **Ubicaciones Personalizadas**
```
┌─────────────────────────────┐
│ ≡  DOCK-1              ✏️ 🗑️│
│    Position: 5 (Custom)     │
└─────────────────────────────┘
```

**Diferencias visuales:**
- 🟢 **Verde** = Ubicación del inventario
- 🔵 **Azul** = Ubicación personalizada (en route preview)
- ✏️ **Edit** = Solo en ubicaciones personalizadas
- 🗑️ **Delete** = Solo en ubicaciones personalizadas

---

## 💾 Persistencia de Datos

### **Almacenamiento**

Dos tipos de datos se guardan en `localStorage`:

1. **`custom_locations`** - Array de ubicaciones personalizadas
   ```json
   ["DOCK-1", "STAGING", "QC-AREA"]
   ```

2. **`warehouse_map`** - Configuración del mapa con posiciones
   ```json
   {
     "A-01": { "position": 0, "x": 100, "y": 1000 },
     "DOCK-1": { "position": 5, "x": 100, "y": 500 }
   }
   ```

### **Sincronización**

- ✅ Ubicaciones del inventario se actualizan automáticamente
- ✅ Ubicaciones personalizadas persisten entre sesiones
- ✅ El orden se mantiene al recargar la página
- ✅ Ediciones y eliminaciones se reflejan inmediatamente

---

## 🔧 Operaciones Disponibles

### **CREATE (Agregar)**

```javascript
// Click en "Add Location"
// Ingresa: "DOCK-1"
// Resultado: Nueva ubicación agregada
```

**Validaciones:**
- ❌ No puede estar vacío
- ❌ No puede duplicar ubicaciones existentes
- ✅ Acepta cualquier formato (letras, números, guiones)

### **READ (Ver)**

```javascript
// Todas las ubicaciones se muestran automáticamente
// Inventario + Personalizadas
// Ordenadas según configuración guardada
```

### **UPDATE (Editar)**

```javascript
// Solo ubicaciones personalizadas
// Click en ✏️ → Edita → "Update"
// Se actualiza en todas partes (lista, mapa, route)
```

**Validaciones:**
- ❌ No puede duplicar ubicaciones existentes
- ✅ Actualiza referencias en el mapa guardado

### **DELETE (Eliminar)**

```javascript
// Solo ubicaciones personalizadas
// Click en 🗑️ → Confirma → Eliminada
```

**Efectos:**
- ✅ Se elimina de `custom_locations`
- ✅ Se elimina de `warehouse_map`
- ✅ Se elimina de la lista visual
- ⚠️ **No se puede deshacer**

---

## 📋 Casos de Uso

### **1. Nueva Área de Almacén**

```
Situación: Acabas de crear una nueva zona "C-ZONE"
Solución:
1. Add Location → "C-ZONE"
2. Arrastra a la posición correcta en la ruta
3. Save Map
```

### **2. Área Temporal**

```
Situación: Necesitas una zona temporal "STAGING"
Solución:
1. Add Location → "STAGING"
2. Coloca al inicio de la ruta (primera posición)
3. Save Map
4. Cuando termines, Delete → "STAGING"
```

### **3. Reorganizar Almacén**

```
Situación: Cambiaste el layout físico
Solución:
1. Arrastra ubicaciones al nuevo orden
2. Save Map
3. El picking seguirá el nuevo orden
```

### **4. Renombrar Ubicación**

```
Situación: "TEMP-1" ahora es "C-15"
Solución:
1. Edit "TEMP-1" → "C-15"
2. Update
3. Todas las referencias se actualizan
```

---

## 🎯 Mejores Prácticas

### **Nomenclatura**

✅ **Recomendado:**
- `A-01`, `B-15`, `C-20` (Formato consistente)
- `DOCK-1`, `DOCK-2` (Áreas especiales)
- `STAGING`, `QC`, `RETURNS` (Zonas funcionales)

❌ **Evitar:**
- Nombres muy largos (dificulta visualización)
- Caracteres especiales raros
- Duplicados con diferentes mayúsculas

### **Organización**

1. **Agrupa por zona**
   ```
   A-01, A-02, A-03
   B-01, B-02, B-03
   DOCK-1, DOCK-2
   ```

2. **Ordena por flujo de trabajo**
   ```
   RECEIVING → STAGING → A-ZONE → B-ZONE → SHIPPING
   ```

3. **Mantén actualizado**
   - Elimina ubicaciones obsoletas
   - Actualiza nombres cuando cambien
   - Reorganiza cuando cambies el layout

---

## 🔍 Debugging

### **Ubicación no aparece**

**Problema:** Agregué una ubicación pero no la veo

**Solución:**
1. Verifica que clickeaste "Add" (no Cancel)
2. Revisa la consola del navegador
3. Recarga la página
4. Verifica `localStorage` en DevTools

### **No puedo editar/eliminar**

**Problema:** Los botones Edit/Delete no aparecen

**Razón:** Solo ubicaciones **personalizadas** tienen estos botones

**Solución:** Las ubicaciones del inventario no se pueden editar/eliminar

### **Cambios no se guardan**

**Problema:** Reordené pero al recargar vuelve al orden anterior

**Solución:** Debes clickear **"Save Map"** después de reordenar

---

## 💡 Tips

1. **Usa prefijos** para agrupar ubicaciones
   - `A-*` para zona A
   - `DOCK-*` para docks
   - `TEMP-*` para temporales

2. **Planifica antes de agregar**
   - Piensa en el flujo de picking
   - Considera expansiones futuras
   - Mantén consistencia

3. **Documenta ubicaciones especiales**
   - Anota qué representa cada zona
   - Comunica cambios al equipo
   - Actualiza mapas físicos

4. **Limpia regularmente**
   - Elimina ubicaciones no usadas
   - Consolida zonas similares
   - Mantén el mapa simple

---

## 🚀 Flujo de Trabajo Recomendado

### **Setup Inicial**

1. ✅ Revisa ubicaciones del inventario
2. ✅ Agrega ubicaciones faltantes
3. ✅ Organiza por flujo de picking
4. ✅ Guarda el mapa
5. ✅ Prueba con una orden real

### **Mantenimiento**

1. 🔄 Revisa mensualmente
2. 🗑️ Elimina obsoletas
3. ➕ Agrega nuevas según necesidad
4. 📊 Optimiza basado en métricas
5. 💾 Guarda cambios

---

## 📚 Referencia Rápida

| Acción | Botón/Ícono | Disponible para |
|--------|-------------|-----------------|
| **Agregar** | `+ Add Location` | Todos |
| **Editar** | ✏️ | Solo Custom |
| **Eliminar** | 🗑️ | Solo Custom |
| **Reordenar** | ≡ (Grip) | Todos |
| **Guardar** | `Save Map` | Todos |
| **Resetear** | `Reset` | Todos |

---

**¡Ahora tienes control total sobre las ubicaciones de tu almacén!** 🎉
