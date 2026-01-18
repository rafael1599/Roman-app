# Task: Advanced Inventory Logging Finalization & Polish

## Context
We have implemented smart log coalescing (server-side) and burst buffering (client-side). This task covers verification, reporting consistency, and user experience polish.

## 1. Quality Assurance & Verification
- [ ] **Burst Verification**: Manually spam the "+" button 10 times and verify in the Supabase Dashboard/HistoryScreen that only **one** log entry is created with quantity 10.
- [ ] **Cancellation Verification**: Press "+" once, wait, then press "-" once within the 5-minute window. Verify the log is either reduced or deleted.
- [ ] **Sequence Interruption**: Press "+" on SKU A, then "+" on SKU B, then "+" on SKU A. Verify that SKU A produces **two separate logs** as requested (the different SKU in between must cut the 5-minute counter).

## 2. Robustness Improvements
- [ ] **Flush on Unload**: Implement a `window.addEventListener('beforeunload', ...)` or a `useEffect` cleanup in `InventoryProvider` to flush any pending buffers in `logBuffersRef` before the browser tab is closed.
- [ ] **Error Handling**: Add a retry mechanism or a "Sync Error" notification if the background `trackLog` call fails after the buffer timeout.

## 3. Reporting & UI Consistency
- [ ] **HistoryScreen Live Refresh**: Ensure `HistoryScreen.jsx` correctly receives updates when a log is **deleted** (counter-merge to 0) via real-time subscriptions. Currently, it might only handle `UPDATE` and `INSERT`.
- [ ] **Real-time Deletion**: Verify `HistoryScreen.jsx` has a listener for `DELETE` events on `inventory_logs`.

## 4. Code Cleanup
- [ ] **Ref Consolidation**: Review `lastLogRef` vs `logBuffersRef`. Ensure `lastLogRef` is updated with the ID returned by the *flushed* buffer so that subsequent bursts (after the 1s window but within 5m) can still merge effectively.
- [ ] **Cleanup Legacy Comments**: Remove debug `console.log` statements used during the implementation of the buffer.

## 5. Performance Monitoring
- [ ] **Debounce Tuning**: Evaluate if 1000ms is the optimal window. High-speed picking might benefit from 1500ms; slow-and-steady might prefer 500ms.
