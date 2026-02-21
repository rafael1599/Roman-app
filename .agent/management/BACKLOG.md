# 📋 Project Backlog - Roman-app

Centralized management for features, bugs, and ideas.

---

## 🎯 Active Phase: Project Organization & Refinement
*Focused on cleaning up the workspace and refining existing features.*

- [x] Implement local Management System (.agent/management) <!-- id: task-001 -->
- [x] Migrate root MD files to `.agent/roadmap/` <!-- id: task-002 -->
- [x] Create `/todo` capture workflow <!-- id: task-003 -->
- [x] Configure `.cursorrules` for automatic backlog awareness <!-- id: task-004 -->
- [ ] **Warehouse Selection Refinement**: Update `processOrder` to apply selected warehouse preferences. <!-- id: task-005 -->
- [ ] **Optimistic UI Fixes**: Address flashes in quantity updates. <!-- id: task-006 -->

---

## 💡 Future Features & Ideas
*Long-term improvements or new functionality.*

- [ ] **Barcode/QR Integration**: Scan items directly. <!-- id: idea-001 -->
- [ ] **Order List View**: When reviewing orders, show the picking list first with an option to print (leading to the current screen). <!-- id: idea-006 -->
- [ ] **Automatic Inventory Email**: Automatically send the full inventory table to Jamis's email. **Crucial**: Plain list only, NO links like current reports. <!-- id: idea-007 -->
- [ ] **Stock Printing**: Allow printing the filtered SKU list in Stock view, opening in a new tab (consistent with Orders print view) instead of direct PDF download. <!-- id: idea-009 -->
- [ ] **Order Merging**: Ability to combine 2 separate orders into one picking session. <!-- id: idea-010 -->
- [ ] **iOS Pull-to-Refresh**: Implement a native-feel refresh behavior for iOS (similar to Android's default) to allow updating the app state via top-scroll. <!-- id: idea-011 -->
- [ ] **Multi-Address Customers**: Update database schema and UI to handle multiple shipping/billing addresses for a single client. <!-- id: idea-012 -->
- [ ] **Clean Up Double Check**: Remove the "Save Note Only" button next to the checklist in the Double Check view. <!-- id: idea-013 -->
- [x] **Stock View Enhancements & History Fix**: Implement SKU count summary, PDF export, and consolidated history logs. <!-- id: idea-014 -->
- [ ] **Automatic Watchdog Startup**: Ensure the python watchdog script executes automatically whenever the PC starts. <!-- id: idea-008 -->
- [ ] **Inventory Heatmaps**: Visualize picking frequency. <!-- id: idea-002 -->
- [ ] **Advanced Analytics**: Dashboard for warehouse efficiency. <!-- id: idea-003 -->
- [ ] **Smart Rebalancing**: Suggestions to move stock between warehouses. <!-- id: idea-004 -->
- [ ] **Persistent Preferences**: Remember user warehouse choices. <!-- id: idea-005 -->

---

## 🐛 Bug Tracker
*Identified issues that need fixing.*

- [ ] **Offline Sync Edge Cases**: Handle complex rollback scenarios in InventoryProvider. <!-- id: bug-001 -->

---

## ✅ Completed Tasks
*Log of achievements.*

- [x] **Multi-user Support**: Realtime takeover and picking session locking.
- [x] **TypeScript Core Migration**: Smart Picking, types, and hooks moved to TS.
- [x] **Robust Realtime System**: Fixed connection stability and zombie cleanups.
- [x] **Dual-Provider AI**: Gemini with OpenAI fallback for order scanning.
- [x] **Full English Localization**: Application is now fully in English.
- [x] **Management Setup**: Organized `.agent/` structure and backlog.
- [x] **Warehouse Selection Basic**: Detect duplicate SKUs and show selection modal.
