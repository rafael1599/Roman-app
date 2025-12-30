# Estructura del Inventario ATS - Múltiples Ubicaciones

## 🎯 Problema Resuelto

El inventario ATS tiene SKUs que están distribuidos en **múltiples ubicaciones físicas**. La estructura anterior no permitía calcular correctamente las deducciones por ubicación.

---

## 📊 Nueva Estructura

### **Formato CSV:**

```csv
Location,SKU,Quantity,Location_Detail,Status
```

**Campos:**
- **Location**: Ubicación física (A1, B2, M1, N2, PALLET, etc.)
- **SKU**: Código del producto
- **Quantity**: Cantidad en esa ubicación específica
- **Location_Detail**: Descripción adicional
- **Status**: Active o Palletized

---

## 💡 Ejemplo: SKU 03-4070BK

### **Distribución:**

```
SKU: 03-4070BK
Total: 209 unidades

Ubicaciones:
├─ M1: 30 unidades (Active)
├─ N2: 150 unidades (Active, 6 pallets)
└─ PALLET: 29 unidades (Palletized)
    Total: 209 ✓
```

### **En el CSV:**

```csv
Location,SKU,Quantity,Location_Detail,Status
M1,03-4070BK,30,M1,Active
N2,03-4070BK,150,N2 (6 pallets),Active
PALLET,03-4070BK,29,Palletized (from M1/N2),Palletized
```

---

## 🔄 Cómo Funciona la Deducción

### **Escenario 1: Orden de 25 unidades**

```
Pedido: 03-4070BK x 25

Proceso:
1. Buscar ubicaciones con stock activo
   ├─ M1: 30 disponibles ✓
   └─ N2: 150 disponibles ✓

2. Deducir de la primera ubicación (M1)
   M1: 30 - 25 = 5 restantes ✓

Resultado:
├─ M1: 5 unidades
├─ N2: 150 unidades
└─ PALLET: 29 unidades
    Total: 184 unidades
```

### **Escenario 2: Orden de 40 unidades**

```
Pedido: 03-4070BK x 40

Proceso:
1. Deducir de M1 (30 disponibles)
   M1: 30 - 30 = 0 (agotado)
   Faltan: 40 - 30 = 10

2. Deducir de N2 (150 disponibles)
   N2: 150 - 10 = 140

Resultado:
├─ M1: 0 unidades (agotado)
├─ N2: 140 unidades
└─ PALLET: 29 unidades
    Total: 169 unidades
```

### **Escenario 3: Orden de 200 unidades**

```
Pedido: 03-4070BK x 200

Proceso:
1. Deducir de M1 (30)
   M1: 0, Faltan: 170

2. Deducir de N2 (150)
   N2: 0, Faltan: 20

3. Deducir de PALLET (29)
   PALLET: 29 - 20 = 9

Resultado:
├─ M1: 0 unidades
├─ N2: 0 unidades
└─ PALLET: 9 unidades
    Total: 9 unidades
```

---

## 📋 Todos los SKUs con Múltiples Ubicaciones

### **1. 03-3985GY (49 total)**
```
A6: 19 unidades
B6: 30 unidades
```

### **2. 03-3936MN (42 total)**
```
A5: 19 unidades
B5: 23 unidades
```

### **3. 03-3931BK (42 total)**
```
A4: 12 unidades
B4: 30 unidades
```

### **4. 03-4085BK (43 total)**
```
A3: 13 unidades
B3: 30 unidades
```

### **5. 03-3978BL (319 total)**
```
C2: 147 unidades (6 pallets)
D1: 172 unidades (6 pallets)
```

### **6. 03-3982BL (306 total)**
```
E1: 2 unidades
E2: 154 unidades (6 pallets)
F2: 150 unidades (6 pallets)
```

### **7. 03-3980BL (168 total)**
```
E1: 10 unidades
G2: 150 unidades (6 pallets)
PALLET: 8 unidades (palletized)
```

### **8. 03-3981GY (309 total)**
```
H1: 159 unidades (6 pallets)
I2: 150 unidades (6 pallets)
```

### **9. 03-3983GY (270 total)**
```
J2: 150 unidades (6 pallets)
K2: 120 unidades (6 pallets)
```

### **10. 03-3979GY (246 total)**
```
L2: 145 unidades (6 pallets)
M2: 101 unidades (6 pallets)
```

### **11. 03-4070BK (209 total)**
```
M1: 30 unidades
N2: 150 unidades (6 pallets)
PALLET: 29 unidades (palletized)
```

### **12. 03-4035BL (188 total)**
```
O2: 150 unidades (6 pallets)
PALLET: 38 unidades (palletized)
```

### **13. 03-4068BK (168 total)**
```
P2: 136 unidades (6 pallets)
PALLET: 32 unidades (palletized)
```

### **14. 03-4034BK (134 total)**
```
S2: 120 unidades (6 pallets)
PALLET: 14 unidades (palletized)
```

### **15. 03-4038BL (124 total)**
```
T2: 120 unidades (6 pallets)
PALLET: 4 unidades (palletized)
```

### **16. 03-3976BL (130 total)**
```
U2: 120 unidades (6 pallets)
PALLET: 10 unidades (palletized)
```

### **17. 03-3977GY (66 total)**
```
Y5: 50 unidades (6 pallets)
PALLET: 16 unidades (palletized)
```

---

## 🎯 Ventajas de Esta Estructura

### **1. Deducción Precisa**
```javascript
// Antes (imposible calcular)
Location: "M1- 30 N2:6- 150 (Pallet: 29)"
Quantity: 209
// ¿De dónde deduzco?

// Ahora (fácil y preciso)
[
  { Location: "M1", Quantity: 30 },
  { Location: "N2", Quantity: 150 },
  { Location: "PALLET", Quantity: 29 }
]
// Deduzco en orden: M1 → N2 → PALLET
```

### **2. Trazabilidad**
- ✅ Sabes exactamente de qué ubicación se tomó
- ✅ Puedes rastrear movimientos
- ✅ Auditoría completa

### **3. Optimización de Picking**
- ✅ Puedes priorizar ubicaciones
- ✅ Minimizar distancias
- ✅ Evitar ubicaciones paletizadas si hay stock activo

### **4. Reportes Precisos**
- ✅ Stock por ubicación
- ✅ Ubicaciones agotadas
- ✅ Necesidad de reabastecimiento

---

## 🔧 Implementación en el Sistema

### **Lógica de Deducción:**

```javascript
function deductFromATS(sku, quantity) {
  // 1. Obtener todas las ubicaciones del SKU
  const locations = atsInventory.filter(item => 
    item.SKU === sku && item.Status === 'Active'
  ).sort((a, b) => {
    // Priorizar ubicaciones no paletizadas
    if (a.Location === 'PALLET') return 1;
    if (b.Location === 'PALLET') return -1;
    return a.Location.localeCompare(b.Location);
  });

  let remaining = quantity;
  const deductions = [];

  // 2. Deducir de cada ubicación en orden
  for (const location of locations) {
    if (remaining <= 0) break;

    const available = location.Quantity;
    const toDeduct = Math.min(available, remaining);

    deductions.push({
      location: location.Location,
      quantity: toDeduct,
      newQuantity: available - toDeduct
    });

    remaining -= toDeduct;
  }

  // 3. Si aún falta, usar paletizadas
  if (remaining > 0) {
    const palletized = atsInventory.find(item => 
      item.SKU === sku && item.Location === 'PALLET'
    );
    
    if (palletized && palletized.Quantity >= remaining) {
      deductions.push({
        location: 'PALLET',
        quantity: remaining,
        newQuantity: palletized.Quantity - remaining
      });
      remaining = 0;
    }
  }

  return {
    success: remaining === 0,
    deductions,
    shortage: remaining
  };
}
```

---

## 📊 Ejemplo Completo

### **Orden:**
```
SKU: 03-4070BK
Cantidad: 185
```

### **Proceso:**

```
Estado Inicial:
├─ M1: 30 unidades
├─ N2: 150 unidades
└─ PALLET: 29 unidades
    Total: 209

Deducción:
1. M1: 30 - 30 = 0 (agotado)
   Faltan: 185 - 30 = 155

2. N2: 150 - 150 = 0 (agotado)
   Faltan: 155 - 150 = 5

3. PALLET: 29 - 5 = 24
   Faltan: 0 ✓

Estado Final:
├─ M1: 0 unidades (agotado)
├─ N2: 0 unidades (agotado)
└─ PALLET: 24 unidades
    Total: 24 unidades

Transacciones:
[
  { location: "M1", deducted: 30, remaining: 0 },
  { location: "N2", deducted: 150, remaining: 0 },
  { location: "PALLET", deducted: 5, remaining: 24 }
]
```

---

## 🎯 Próximos Pasos

1. **Actualizar el backend** para manejar múltiples filas por SKU
2. **Modificar la UI** para mostrar subtotales por ubicación
3. **Implementar lógica de deducción** en orden de prioridad
4. **Agregar reportes** de stock por ubicación

---

**¡Ahora el inventario ATS está estructurado para cálculos precisos!** 🎉
