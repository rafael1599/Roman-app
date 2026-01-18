# ATS Inventory Structure - Multiple Locations

## 🎯 Problem Solved

The ATS inventory has SKUs that are distributed in **multiple physical locations**. The previous structure did not allow for correct calculation of deductions by location.

---

## 📊 New Structure

### **CSV Format:**

```csv
Location,SKU,Quantity,Location_Detail,Status
```

**Fields:**
- **Location**: Physical location (A1, B2, M1, N2, PALLET, etc.)
- **SKU**: Product code
- **Quantity**: Quantity in that specific location
- **Location_Detail**: Additional description
- **Status**: Active or Palletized

---

## 💡 Example: SKU 03-4070BK

### **Distribution:**

```
SKU: 03-4070BK
Total: 209 units

Locations:
├─ M1: 30 units (Active)
├─ N2: 150 units (Active, 6 pallets)
└─ PALLET: 29 units (Palletized)
    Total: 209 ✓
```

### **In the CSV:**

```csv
Location,SKU,Quantity,Location_Detail,Status
M1,03-4070BK,30,M1,Active
N2,03-4070BK,150,N2 (6 pallets),Active
PALLET,03-4070BK,29,Palletized (from M1/N2),Palletized
```

---

## 🔄 How Deduction Works

### **Scenario 1: Order of 25 units**

```
Order: 03-4070BK x 25

Process:
1. Search for locations with active stock
   ├─ M1: 30 available ✓
   └─ N2: 150 available ✓

2. Deduct from the first location (M1)
   M1: 30 - 25 = 5 remaining ✓

Result:
├─ M1: 5 units
├─ N2: 150 units
└─ PALLET: 29 units
    Total: 184 units
```

### **Scenario 2: Order of 40 units**

```
Order: 03-4070BK x 40

Process:
1. Deduct from M1 (30 available)
   M1: 30 - 30 = 0 (out of stock)
   Needed: 40 - 30 = 10

2. Deduct from N2 (150 available)
   N2: 150 - 10 = 140

Result:
├─ M1: 0 units (out of stock)
├─ N2: 140 units
└─ PALLET: 29 units
    Total: 169 units
```

### **Scenario 3: Order of 200 units**

```
Order: 03-4070BK x 200

Process:
1. Deduct from M1 (30)
   M1: 0, Needed: 170

2. Deduct from N2 (150)
   N2: 0, Needed: 20

3. Deduct from PALLET (29)
   PALLET: 29 - 20 = 9

Result:
├─ M1: 0 units
├─ N2: 0 units
└─ PALLET: 9 units
    Total: 9 units
```

---

## 📋 All SKUs with Multiple Locations

### **1. 03-3985GY (49 total)**
```
A6: 19 units
B6: 30 units
```

### **2. 03-3936MN (42 total)**
```
A5: 19 units
B5: 23 units
```

### **3. 03-3931BK (42 total)**
```
A4: 12 units
B4: 30 units
```

### **4. 03-4085BK (43 total)**
```
A3: 13 units
B3: 30 units
```

### **5. 03-3978BL (319 total)**
```
C2: 147 units (6 pallets)
D1: 172 units (6 pallets)
```

### **6. 03-3982BL (306 total)**
```
E1: 2 units
E2: 154 units (6 pallets)
F2: 150 units (6 pallets)
```

### **7. 03-3980BL (168 total)**
```
E1: 10 units
G2: 150 units (6 pallets)
PALLET: 8 units (palletized)
```

### **8. 03-3981GY (309 total)**
```
H1: 159 units (6 pallets)
I2: 150 units (6 pallets)
```

### **9. 03-3983GY (270 total)**
```
J2: 150 units (6 pallets)
K2: 120 units (6 pallets)
```

### **10. 03-3979GY (246 total)**
```
L2: 145 units (6 pallets)
M2: 101 units (6 pallets)
```

### **11. 03-4070BK (209 total)**
```
M1: 30 units
N2: 150 units (6 pallets)
PALLET: 29 units (palletized)
```

### **12. 03-4035BL (188 total)**
```
O2: 150 units (6 pallets)
PALLET: 38 units (palletized)
```

### **13. 03-4068BK (168 total)**
```
P2: 136 units (6 pallets)
PALLET: 32 units (palletized)
```

### **14. 03-4034BK (134 total)**
```
S2: 120 units (6 pallets)
PALLET: 14 units (palletized)
```

### **15. 03-4038BL (124 total)**
```
T2: 120 units (6 pallets)
PALLET: 4 units (palletized)
```

### **16. 03-3976BL (130 total)**
```
U2: 120 units (6 pallets)
PALLET: 10 units (palletized)
```

### **17. 03-3977GY (66 total)**
```
Y5: 50 units (6 pallets)
PALLET: 16 units (palletized)
```

---

## 🎯 Advantages of This Structure

### **1. Accurate Deduction**
```javascript
// Before (impossible to calculate)
Location: "M1- 30 N2:6- 150 (Pallet: 29)"
Quantity: 209
// Where do I deduct from?

// Now (easy and accurate)
[
  { Location: "M1", Quantity: 30 },
  { Location: "N2", Quantity: 150 },
  { Location: "PALLET", Quantity: 29 }
]
// I deduct in order: M1 → N2 → PALLET
```

### **2. Traceability**
- ✅ You know exactly which location it was taken from
- ✅ You can track movements
- ✅ Full audit

### **3. Picking Optimization**
- ✅ You can prioritize locations
- ✅ Minimize distances
- ✅ Avoid palletized locations if there is active stock

### **4. Accurate Reports**
- ✅ Stock by location
- ✅ Out-of-stock locations
- ✅ Need for restocking

---

## 🔧 System Implementation

### **Deduction Logic:**

```javascript
function deductFromATS(sku, quantity) {
  // 1. Get all locations for the SKU
  const locations = atsInventory.filter(item => 
    item.SKU === sku && item.Status === 'Active'
  ).sort((a, b) => {
    // Prioritize non-palletized locations
    if (a.Location === 'PALLET') return 1;
    if (b.Location === 'PALLET') return -1;
    return a.Location.localeCompare(b.Location);
  });

  let remaining = quantity;
  const deductions = [];

  // 2. Deduct from each location in order
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

  // 3. If still needed, use palletized
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

## 📊 Full Example

### **Order:**
```
SKU: 03-4070BK
Quantity: 185
```

### **Process:**

```
Initial State:
├─ M1: 30 units
├─ N2: 150 units
└─ PALLET: 29 units
    Total: 209

Deduction:
1. M1: 30 - 30 = 0 (out of stock)
   Needed: 185 - 30 = 155

2. N2: 150 - 150 = 0 (out of stock)
   Needed: 155 - 150 = 5

3. PALLET: 29 - 5 = 24
   Needed: 0 ✓

Final State:
├─ M1: 0 units (out of stock)
├─ N2: 0 units (out of stock)
└─ PALLET: 24 units
    Total: 24 units

Transactions:
[
  { location: "M1", deducted: 30, remaining: 0 },
  { location: "N2", deducted: 150, remaining: 0 },
  { location: "PALLET", deducted: 5, remaining: 24 }
]
```

---

## 🎯 Next Steps

1. **Update the backend** to handle multiple rows per SKU
2. **Modify the UI** to show subtotals by location
3. **Implement deduction logic** in priority order
4. **Add reports** for stock by location

---

**Now the ATS inventory is structured for accurate calculations!** 🎉