# Warehouse Selection for Duplicate SKUs

## 🎯 Implemented Functionality

When a SKU is available in **both warehouses** (Ludlow and ATS), the system now asks the user where they want to pick it from.

---

## 🔄 Workflow

### **1. Order Scanning**

```
User scans order with Gemini AI
↓
System extracts SKUs and quantities
↓
System validates against inventory
```

### **2. Duplicate Detection**

```
For each SKU:
├─ Is it in Ludlow? → Yes
├─ Is it in ATS? → Yes
└─ Mark as "needs_warehouse_selection"
```

### **3. Selection Modal**

```
System displays modal with:
├─ SKU and required quantity
├─ Ludlow option (stock, location)
├─ ATS option (stock, location)
└─ User selects warehouse
```

### **4. Processing**

```
User confirms selection
↓
System applies logic for the chosen warehouse
↓
Continues with normal picking
```

---

## 🎨 Modal Interface

### **Design:**

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

### **Features:**

- 🟢 **Ludlow** - Green when selected
- 🔵 **ATS** - Blue when selected
- ⚠️ **Warning** - If there is not enough stock
- 📊 **Information** - Available stock and location

---

## 💻 Technical Implementation

### **1. Detection in `useOrderProcessing.js`**

```javascript
const findInventoryItem = (sku) => {
  const ludlowItem = ludlowInventory.find((i) => i.SKU === sku);
  const atsItem = atsInventory.find((i) => i.SKU === sku);

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

### **2. Validation in `validateOrder`**

```javascript
const validateOrder = (orderItems) => {
  return orderItems.map((orderItem) => {
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

### **3. Modal in `WarehouseSelectionModal.jsx`**

```javascript
export default function WarehouseSelectionModal({ items, onConfirm, onCancel }) {
  const [selections, setSelections] = useState({});

  const handleSelect = (sku, warehouse) => {
    setSelections((prev) => ({
      ...prev,
      [sku]: warehouse,
    }));
  };

  const handleConfirm = () => {
    // Validate all items selected
    const allSelected = items.every((item) => selections[item.sku]);
    if (!allSelected) {
      alert('Please select a warehouse for all items');
      return;
    }

    onConfirm(selections);
  };

  // ... render UI
}
```

### **4. Integration in `SmartPicking.jsx`**

```javascript
const handleScanComplete = (scannedItems) => {
  const order = processOrder(scannedItems);

  // Check for items needing selection
  const needsSelection = order.validatedItems.filter(
    (item) => item.status === 'needs_warehouse_selection'
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

## 📊 Full Example

### **Scenario:**

```
Scanned Order:
├─ 03-3978BL x 50
├─ 03-4070BK x 100
└─ 06-4432BK x 20
```

### **Validation:**

```
03-3978BL:
├─ Ludlow: 319 available ✓
├─ ATS: 319 available ✓
└─ Status: needs_warehouse_selection

03-4070BK:
├─ Ludlow: 54 available ✗
├─ ATS: 209 available ✓
└─ Status: needs_warehouse_selection

06-4432BK:
├─ Ludlow: 50 available ✓
├─ ATS: Not found
└─ Status: available (Ludlow)
```

### **Modal Shows:**

```
2 items need warehouse selection:
1. 03-3978BL (qty: 50)
2. 03-4070BK (qty: 100)
```

### **User Selects:**

```
03-3978BL → Ludlow (closer)
03-4070BK → ATS (more stock)
```

### **Result:**

```
Picking List:
├─ 03-3978BL x 50 from Ludlow (Row 21)
├─ 03-4070BK x 100 from ATS (M1, N2-N7)
└─ 06-4432BK x 20 from Ludlow (Row 1)
```

---

## ✅ Advantages

### **1. Flexibility**

- User decides based on convenience
- Can choose the nearest warehouse
- Can balance stock between warehouses

### **2. Transparency**

- Shows available stock in both
- Shows locations
- Warns if there is a shortage

### **3. Optimization**

- Minimize distances
- Balance workload
- Avoid depleting one warehouse

### **4. Control**

- User has full control
- Can change strategy as needed
- Can prioritize based on urgency

---

## 🎯 Item Statuses

| Status                      | Description                                | Action           |
| --------------------------- | ------------------------------------------ | ---------------- |
| `available`                 | In a single warehouse with stock           | Process normally |
| `shortage`                  | In a single warehouse without enough stock | Warn             |
| `not_found`                 | Not in any warehouse                       | Show suggestions |
| `needs_warehouse_selection` | In both warehouses                         | Show modal       |

---

## 🔄 Next Steps

### **TODO:**

1. **Apply selections to processing**
   - Update `processOrder` to accept preferences
   - Deduct from the selected warehouse

2. **Remember preferences**
   - Save user selections
   - Suggest the same warehouse in future orders

3. **Automatic optimization**
   - Suggest the nearest warehouse
   - Suggest the warehouse with more stock
   - Balance automatically

4. **Reports**
   - Track which warehouse is used more
   - Efficiency analysis
   - Rebalancing recommendations

---

## 📚 Modified Files

1. **`useOrderProcessing.js`**
   - `findInventoryItem()` - Detects duplicates
   - `validateOrder()` - Marks items for selection

2. **`WarehouseSelectionModal.jsx`** (new)
   - Selection modal
   - UI for choosing warehouse

3. **`SmartPicking.jsx`**
   - Modal integration
   - Handling selections

---

**The system now allows choosing which warehouse to pick from when there are duplicates!** 🎉
