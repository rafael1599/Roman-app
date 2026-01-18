# Optimization Task: Client-Side Log Buffering

## Context
User reports inconsistent log coalescing due to race conditions when clicking fast. Server-side logic handles merging, but network latency causes out-of-sync requests.
Solution: Implement client-side buffering (debouncing) to verify "bursts" of clicks into single log requests.

## Implementation Steps

### 1. Update `useInventoryData.jsx`
- [ ] **Add Buffer Ref**: `const logBuffersRef = useRef({})`. Store pending logs keyed by SKU+Loc.
- [ ] **Create `executeBufferedLog`**: Helper to flush a specific buffer key key to `trackLog`.
- [ ] **Create `requestLog`**: The new entry point.
    - If entry exists for key: cancel timeout, update accumulated quantity.
    - If no entry: create new buffer entry.
    - Set timeout (2000ms).
- [ ] **Update `updateQuantity`**: Replace `trackLog` call with `requestLog`.

## Logic Details
- **Key Generation**: `${sku}|${warehouse}|${location}`.
- **Inverse Handling**: Buffer handles +1, +1, -1 locally. If result is 0, we simply *don't send anything* (or check if we need to clean up DB). 
    - Wait, if DB has +5, and I do -1 locally. Buffer sends -1. DB merges to +4. Correct.
    - If I start fresh (no buffer), do +1, then -1. Buffer result = 0. Timer fires. We send 0? No, we simply abort. No log created. Perfect optimization!

## Outcome
- Rapid clicking results in 1 Log Request.
- Race conditions eliminated.
- Network usage minimized.
