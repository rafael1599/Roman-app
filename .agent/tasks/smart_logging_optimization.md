# Optimization Task: Smart Inventory Logging & User Attribution

## Context
The user wants to optimize the inventory history (`HistoryScreen`) to avoid clutter when performing repetitive actions (like clicking "+" or "-" multiple times). Instead of 10 logs for 10 clicks, it should show 1 consolidated log. Additionally, actions canceling each other out (e.g., +1 then -1) should result in the removal of the log. Finally, the generic 'Warehouse Team' user should be replaced with the actual logged-in user.

## Task Breakdown

### 1. Refactor `useInventoryData.jsx` (Data Source)
**Goal:** Ensure correct data (`action_type`, `user`) is sent to the logging hook.
- [ ] **Inject User Context**: Use `useAuth` to retrieve `user` and `profile`.
- [ ] **Fix Action Types**: In `updateQuantity`, ensure `delta > 0` is logged as `'ADD'` (currently `'EDIT'`) and `delta < 0` as `'DEDUCT'`. Manual edits via modal should remain `'EDIT'`.
- [ ] **Pass Metadata**: Update all `trackLog` calls (`addItem`, `updateQuantity`, `moveItem`, `deleteItem`, `updateItem`) to pass an options object containing:
  - `performed_by`: `profile.full_name` or `user.email`.
  - `user_id`: `user.id`.

### 2. Implement Smart Coalescing in `useInventoryLogs.js` (Logic Core)
**Goal:** Implement the "Write-Time Coalescing" logic to group or cancel sequential actions.
- [ ] **Update Function Signature**: Modify `trackLog` to accept the `userInfo` object.
- [ ] **Fetch Logic**: Before inserting, query the last log entry for the same `SKU`, `Location`, and `User` created within the last **5 minutes**.
- [ ] **Merge/Cancel Logic**:
  - **Same Action (e.g., ADD + ADD)**: Sum the `quantity` and update the existing log. Update `new_quantity` to the latest stock level.
  - **Inverse Action (e.g., ADD + DEDUCT)**: Subtract the new quantity from the existing log.
    - **If Result == 0**: **Delete** the existing log (clean history).
    - **If Sign Flips**: Update the log's `action_type` to match the dominant direction and update the quantity.
    - **If Partial Reduction**: Update the quantity.
  - **Different Context**: If location or user differs, force a new `INSERT`.
- [ ] **Legacy Support**: Ensure the function works (defaults to 'Unknown') if no user info is provided.

## Outcome
- Cleaner history: 50 clicks = 1 log.
- Accurate attribution: "Rafael Lopez" instead of "Warehouse Team".
- correct labels: "+" button shows as "Restock/Add", "-" as "Pick/Deduct".
