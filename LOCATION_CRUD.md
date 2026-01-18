# Location CRUD - Warehouse Map Builder

## 🎯 New Functionality

The Map Builder now includes a **full CRUD** to manage warehouse locations.

---

## ✨ Features

### **1. 📍 Add Custom Locations**

You can create locations that do not exist in your inventory:

**Use cases:**
- New locations that do not have products yet
- Special areas (DOCK-1, STAGING, QC-AREA)
- Temporary zones
- Preparation locations

**How to add:**
1. Click on **"Add Location"** (blue button)
2. Enter the name (e.g., "A-01", "DOCK-1", "STAGING")
3. Click on **"Add"**
4. The location is added to the end of the list
5. Drag it to the correct position
6. Click on **"Save Map"**

### **2. ✏️ Edit Locations**

You can only edit **custom** locations (not those from the inventory):

**How to edit:**
1. Find the location with the **(Custom)** label
2. Click on the **pencil** icon (Edit)
3. Modify the name
4. Click on **"Update"**

**Note:** Inventory locations cannot be edited directly.

### **3. 🗑️ Delete Locations**

You can only delete **custom** locations:

**How to delete:**
1. Find the location with the **(Custom)** label
2. Click on the **trash** icon (Delete)
3. Confirm the deletion
4. The location is permanently deleted

**Warning:** This action cannot be undone.

### **4. 🔄 Reorder Locations**

All locations (inventory + custom) can be reordered:

**How to reorder:**
1. Click and drag the **grip** icon (≡)
2. Drop it in the new position
3. Click on **"Save Map"**

---

## 🎨 Visual Interface

### **Inventory Locations**
```
┌─────────────────────────────┐
│ ≡  A-01                     │
│    Position: 1              │
└─────────────────────────────┘
```

### **Custom Locations**
```
┌─────────────────────────────┐
│ ≡  DOCK-1              ✏️ 🗑️│
│    Position: 5 (Custom)     │
└─────────────────────────────┘
```

**Visual differences:**
- 🟢 **Green** = Inventory location
- 🔵 **Blue** = Custom location (in route preview)
- ✏️ **Edit** = Only on custom locations
- 🗑️ **Delete** = Only on custom locations

---

## 💾 Data Persistence

### **Storage**

Two types of data are saved in `localStorage`:

1. **`custom_locations`** - Array of custom locations
   ```json
   ["DOCK-1", "STAGING", "QC-AREA"]
   ```

2. **`warehouse_map`** - Map configuration with positions
   ```json
   {
     "A-01": { "position": 0, "x": 100, "y": 1000 },
     "DOCK-1": { "position": 5, "x": 100, "y": 500 }
   }
   ```

### **Synchronization**

- ✅ Inventory locations are updated automatically
- ✅ Custom locations persist between sessions
- ✅ The order is maintained when reloading the page
- ✅ Edits and deletions are reflected immediately

---

## 🔧 Available Operations

### **CREATE (Add)**

```javascript
// Click on "Add Location"
// Enter: "DOCK-1"
// Result: New location added
```

**Validations:**
- ❌ Cannot be empty
- ❌ Cannot duplicate existing locations
- ✅ Accepts any format (letters, numbers, hyphens)

### **READ (View)**

```javascript
// All locations are displayed automatically
// Inventory + Custom
// Ordered according to saved configuration
```

### **UPDATE (Edit)**

```javascript
// Only custom locations
// Click on ✏️ → Edit → "Update"
// It is updated everywhere (list, map, route)
```

**Validations:**
- ❌ Cannot duplicate existing locations
- ✅ Updates references in the saved map

### **DELETE (Delete)**

```javascript
// Only custom locations
// Click on 🗑️ → Confirm → Deleted
```

**Effects:**
- ✅ It is deleted from `custom_locations`
- ✅ It is deleted from `warehouse_map`
- ✅ It is deleted from the visual list
- ⚠️ **Cannot be undone**

---

## 📋 Use Cases

### **1. New Warehouse Area**

```
Situation: You have just created a new "C-ZONE" area
Solution:
1. Add Location → "C-ZONE"
2. Drag it to the correct position on the route
3. Save Map
```

### **2. Temporary Area**

```
Situation: You need a temporary "STAGING" zone
Solution:
1. Add Location → "STAGING"
2. Place it at the beginning of the route (first position)
3. Save Map
4. When finished, Delete → "STAGING"
```

### **3. Reorganize Warehouse**

```
Situation: You changed the physical layout
Solution:
1. Drag locations to the new order
2. Save Map
3. Picking will follow the new order
```

### **4. Rename Location**

```
Situation: "TEMP-1" is now "C-15"
Solution:
1. Edit "TEMP-1" → "C-15"
2. Update
3. All references are updated
```

---

## 🎯 Best Practices

### **Nomenclature**

✅ **Recommended:**
- `A-01`, `B-15`, `C-20` (Consistent format)
- `DOCK-1`, `DOCK-2` (Special areas)
- `STAGING`, `QC`, `RETURNS` (Functional zones)

❌ **Avoid:**
- Very long names (makes visualization difficult)
- Rare special characters
- Duplicates with different capitalization

### **Organization**

1. **Group by zone**
   ```
   A-01, A-02, A-03
   B-01, B-02, B-03
   DOCK-1, DOCK-2
   ```

2. **Order by workflow**
   ```
   RECEIVING → STAGING → A-ZONE → B-ZONE → SHIPPING
   ```

3. **Keep updated**
   - Delete obsolete locations
   - Update names when they change
   - Reorganize when you change the layout

---

## 🔍 Debugging

### **Location does not appear**

**Problem:** I added a location but I don't see it

**Solution:**
1. Verify that you clicked "Add" (not Cancel)
2. Check the browser console
3. Reload the page
4. Verify `localStorage` in DevTools

### **I can't edit/delete**

**Problem:** The Edit/Delete buttons do not appear

**Reason:** Only **custom** locations have these buttons

**Solution:** Inventory locations cannot be edited/deleted

### **Changes are not saved**

**Problem:** I reordered but when I reload it returns to the previous order

**Solution:** You must click **"Save Map"** after reordering

---

## 💡 Tips

1. **Use prefixes** to group locations
   - `A-*` for zone A
   - `DOCK-*` for docks
   - `TEMP-*` for temporary

2. **Plan before adding**
   - Think about the picking flow
   - Consider future expansions
   - Maintain consistency

3. **Document special locations**
   - Write down what each zone represents
   - Communicate changes to the team
   - Update physical maps

4. **Clean up regularly**
   - Delete unused locations
   - Consolidate similar zones
   - Keep the map simple

---

## 🚀 Recommended Workflow

### **Initial Setup**

1. ✅ Review inventory locations
2. ✅ Add missing locations
3. ✅ Organize by picking flow
4. ✅ Save the map
5. ✅ Test with a real order

### **Maintenance**

1. 🔄 Review monthly
2. 🗑️ Delete obsolete ones
3. ➕ Add new ones as needed
4. 📊 Optimize based on metrics
5. 💾 Save changes

---

## 📚 Quick Reference

| Action | Button/Icon | Available for |
|--------|-------------|-----------------|
| **Add** | `+ Add Location` | All |
| **Edit** | ✏️ | Custom Only |
| **Delete** | 🗑️ | Custom Only |
| **Reorder** | ≡ (Grip) | All |
| **Save** | `Save Map` | All |
| **Reset** | `Reset` | All |

---

**You now have full control over your warehouse locations!** 🎉