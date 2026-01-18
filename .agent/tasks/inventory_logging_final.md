# Task: Smart Inventory Logging - Final Checklist & Future Refinements

## Context
We have implemented a dual-layer logging system:
1. **Client Layer**: Buffers rapid clicks (1.0s window) to prevent race conditions and unnecessary network traffic.
2. **Server Layer**: Coalesces logs within a 5-minute window per SKU/User/Location and handles "Inverse Merging" (cancellation).

## 1. Current Implementation Verified
- [x] **User Identity**: Logs now use `profile.full_name` or `user.email`.
- [x] **Action Correctness**: `+` button = `ADD`, `-` button = `DEDUCT`.
- [x] **Client Buffering**: Burst clicking results in a single, accumulated server request.
- [x] **Real-time Deletion**: `HistoryScreen` removes logs instantly when they "cancel out" to 0.
- [x] **Tab-Close Safety**: Buffers attempt to flush on `beforeunload`.
- [x] **Session Persistence**: Subsequent bursts still merge if within the 5-minute window.

## 2. Pending Refinements (New Tasks)
- [ ] **Modal Buffering**: Consider if `addItem` (InventoryModal) or `moveItem` (MovementModal) should also use the buffer. (Currently they are direct).
- [ ] **Visual Feedback**: Add a subtle "Synchronizing..." indicator in the App Header or a pulse effect on the `InventoryCard` while the 1-second buffer is active.
- [ ] **Audit Detail**: When a log is merged, should we keep a history of "sub-actions" in a JSON column? (Currently we only keep the net quantity).
- [ ] **Performance Monitor**: Log network latency for `trackLog` requests to see if 1000ms is enough for most users.

## 3. Maintenance
- [ ] **Log Cleanup**: Periodically archive or delete logs older than 30 days (Supabase Edge Function / PG Cron).
