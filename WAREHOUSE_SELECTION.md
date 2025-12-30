# Selección de Almacén para SKUs Duplicados

## 🎯 Funcionalidad Implementada

Cuando un SKU está disponible en **ambos almacenes** (Ludlow y ATS), el sistema ahora pregunta al usuario de dónde quiere recogerlo.

---

## 🔄 Flujo de Trabajo

### **1. Escaneo de Orden**

```
Usuario escanea orden con Gemini AI
↓
Sistema extrae SKUs y cantidades
↓
Sistema valida contra inventario
```

### **2. Detección de Duplicados**

```
Para cada SKU:
├─ ¿Está en Ludlow? → Sí
├─ ¿Está en ATS? → Sí
└─ Marcar como "needs_warehouse_selection"
```

### **3. Modal de Selección**

```
Sistema muestra modal con:
├─ SKU y cantidad necesaria
├─ Opción Ludlow (stock, ubicación)
├─ Opción ATS (stock, ubicación)
└─ Usuario selecciona almacén
```

### **4. Procesamiento**

```
Usuario confirma selección
↓
Sistema aplica lógica del almacén elegido
↓
Continúa con picking normal
```

---

## 🎨 Interfaz del Modal

### **Diseño:**

```
┌─────────────────────────────────────────┐
│ ⚠️ Choose Warehouse                     │
├─────────────────────────────────────────┤
│ The following items are available in    │
│ both warehouses. Select where you want  │
│ to pick them from:                      │
├─────────────────────────────────────────┤
│                                         │
│ 03-3978BL                               │
│ Quantity needed: 50                     │
│                                         │
│ ┌─────────────┐  ┌─────────────┐      │
│ │ 🏭 Ludlow   │  │ 🏭 ATS Grid │      │
│ │             │  │             │      │
│ │ Available:  │  │ Available:  │      │
│ │ 319         │  │ 319         │      │
│ │             │  │             │      │
│ │ Location:   │  │ Location:   │      │
│ │ Row 21      │  │ C2-C6       │      │
│ └─────────────┘  └─────────────┘      │
│                                         │
├─────────────────────────────────────────┤
│ [Cancel]         [Confirm Selection]    │
└─────────────────────────────────────────┘
```

### **Características:**

- 🟢 **Ludlow** - Verde cuando seleccionado
- 🔵 **ATS** - Azul cuando seleccionado
- ⚠️ **Advertencia** - Si no hay stock suficiente
- 📊 **Información** - Stock disponible y ubicación

---

## 💻 Implementación Técnica

### **1. Detección en `useOrderProcessing.js`**

```javascript
const findInventoryItem = (sku) => {
  const ludlowItem = ludlowInventory.find(i => i.SKU === sku);
  const atsItem = atsInventory.find(i => i.SKU === sku);

  // Found in BOTH warehouses
  if (ludlowItem && atsItem) {
    return {
      inBothWarehouses: true,
      ludlow: { ...ludlowItem, warehouse: 'ludlow' },
      ats: { ...atsItem, warehouse: 'ats' },
    };
  }

  // Found in only ONE warehouse
  if (ludlowItem) return { ...ludlowItem, warehouse: 'ludlow' };
  if (atsItem) return { ...atsItem, warehouse: 'ats' };

  return null;
};
```

### **2. Validación en `validateOrder`**

```javascript
const validateOrder = (orderItems) => {
  return orderItems.map(orderItem => {
    const inventoryItem = findInventoryItem(orderItem.sku);

    // Item in BOTH warehouses
    if (inventoryItem.inBothWarehouses) {
      return {
        ...orderItem,
        status: 'needs_warehouse_selection',
        ludlow: {
          available: inventoryItem.ludlow.Quantity,
          hasStock: inventoryItem.ludlow.Quantity >= orderItem.qty,
          location: inventoryItem.ludlow.Location,
        },
        ats: {
          available: inventoryItem.ats.Quantity,
          hasStock: inventoryItem.ats.Quantity >= orderItem.qty,
          location: inventoryItem.ats.Location,
        },
      };
    }

    // Item in only ONE warehouse
    // ... normal processing
  });
};
```

### **3. Modal en `WarehouseSelectionModal.jsx`**

```javascript
export default function WarehouseSelectionModal({ items, onConfirm, onCancel }) {
  const [selections, setSelections] = useState({});

  const handleSelect = (sku, warehouse) => {
    setSelections(prev => ({
      ...prev,
      [sku]: warehouse
    }));
  };

  const handleConfirm = () => {
    // Validate all items selected
    const allSelected = items.every(item => selections[item.sku]);
    if (!allSelected) {
      alert('Please select a warehouse for all items');
      return;
    }

    onConfirm(selections);
  };

  // ... render UI
}
```

### **4. Integración en `SmartPicking.jsx`**

```javascript
const handleScanComplete = (scannedItems) => {
  const order = processOrder(scannedItems);

  // Check for items needing selection
  const needsSelection = order.validatedItems.filter(
    item => item.status === 'needs_warehouse_selection'
  );

  if (needsSelection.length > 0) {
    setItemsNeedingSelection(needsSelection);
    setShowWarehouseSelection(true);
  }
};

const handleWarehouseSelectionConfirm = (selections) => {
  // Apply warehouse selections to order
  // TODO: Update processOrder to accept warehouse preferences
};
```

---

## 📊 Ejemplo Completo

### **Escenario:**

```
Orden escaneada:
├─ 03-3978BL x 50
├─ 03-4070BK x 100
└─ 06-4432BK x 20
```

### **Validación:**

```
03-3978BL:
├─ Ludlow: 319 disponibles ✓
├─ ATS: 319 disponibles ✓
└─ Status: needs_warehouse_selection

03-4070BK:
├─ Ludlow: 54 disponibles ✗
├─ ATS: 209 disponibles ✓
└─ Status: needs_warehouse_selection

06-4432BK:
├─ Ludlow: 50 disponibles ✓
├─ ATS: No encontrado
└─ Status: available (Ludlow)
```

### **Modal Muestra:**

```
2 items need warehouse selection:
1. 03-3978BL (qty: 50)
2. 03-4070BK (qty: 100)
```

### **Usuario Selecciona:**

```
03-3978BL → Ludlow (más cercano)
03-4070BK → ATS (más stock)
```

### **Resultado:**

```
Picking List:
├─ 03-3978BL x 50 from Ludlow (Row 21)
├─ 03-4070BK x 100 from ATS (M1, N2-N7)
└─ 06-4432BK x 20 from Ludlow (Row 1)
```

---

## ✅ Ventajas

### **1. Flexibilidad**
- Usuario decide según conveniencia
- Puede elegir almacén más cercano
- Puede balancear stock entre almacenes

### **2. Transparencia**
- Muestra stock disponible en ambos
- Muestra ubicaciones
- Advierte si hay shortage

### **3. Optimización**
- Minimizar distancias
- Balancear carga de trabajo
- Evitar agotamiento de un almacén

### **4. Control**
- Usuario tiene control total
- Puede cambiar estrategia según necesidad
- Puede priorizar según urgencia

---

## 🎯 Estados de Items

| Status | Descripción | Acción |
|--------|-------------|--------|
| `available` | En un solo almacén con stock | Procesar normal |
| `shortage` | En un solo almacén sin stock suficiente | Advertir |
| `not_found` | No está en ningún almacén | Mostrar sugerencias |
| `needs_warehouse_selection` | En ambos almacenes | Mostrar modal |

---

## 🔄 Próximos Pasos

### **TODO:**

1. **Aplicar selecciones al procesamiento**
   - Actualizar `processOrder` para aceptar preferencias
   - Deducir del almacén seleccionado

2. **Recordar preferencias**
   - Guardar selecciones del usuario
   - Sugerir mismo almacén en futuras órdenes

3. **Optimización automática**
   - Sugerir almacén más cercano
   - Sugerir almacén con más stock
   - Balancear automáticamente

4. **Reportes**
   - Tracking de qué almacén se usa más
   - Análisis de eficiencia
   - Recomendaciones de rebalanceo

---

## 📚 Archivos Modificados

1. **`useOrderProcessing.js`**
   - `findInventoryItem()` - Detecta duplicados
   - `validateOrder()` - Marca items para selección

2. **`WarehouseSelectionModal.jsx`** (nuevo)
   - Modal de selección
   - UI para elegir almacén

3. **`SmartPicking.jsx`**
   - Integración del modal
   - Manejo de selecciones

---

**¡El sistema ahora permite elegir de qué almacén recoger cuando hay duplicados!** 🎉
