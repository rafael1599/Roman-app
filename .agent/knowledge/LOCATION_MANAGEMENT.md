# Location Management Knowledge

This file documents the logic, business rules, and patterns for warehouse locations in Roman-app.

## 🏛 Architecture

- **Hook**: `useLocationManagement.ts` (centralized CRUD).
- **Validation**: `locationValidations.js` (complex client-side checks for capacity and impact).
- **Storage**: Supabase `locations` table.

## ⚖️ Business Rules

1. **Dynamic Creation**: Admins can create locations on-the-fly if they don't exist during stock movement.
2. **Soft Delete**: Locations are never fully deleted if they have history; they are marked `is_active: false`.
3. **Capacity Warnings**:
   - Blocking error if `capacity < 1` or `> 10,000`.
   - Overridable warning if `new_capacity < current_inventory`.
4. **Optimization Invalidation**: Changing a location's zone or capacity invalidates existing `optimization_reports`.

## ⚠️ Gotchas & Edge Cases

- **Naming Ambiguitiy**: Be careful with numeric-only names (e.g., "9"). Always ensure the UI distinguishes between "Row 9" and simply "9" to avoid "Location not found" errors when fetching by ID.
- **Case Sensitivity**: DB locations should be treated case-insensitively for search but case-preserved for display.
- **Warehouse Context**: Every location check **must** include the `warehouse` field (Ludlow vs ATS), as names can overlap between warehouses.

## 🔧 Utility Functions

- `getLocation(warehouse, locationName)`: Returns the first match.
- `calculateLocationChangeImpact()`: Essential before `UPDATE` to show user warnings.
