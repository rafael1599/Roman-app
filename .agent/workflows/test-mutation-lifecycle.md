---
description: How to test Mutation Durability and Sync Lifecycle
---

# Mutation Durability Testing Workflow

This workflow describes how to verify that mutations survive and resume correctly across app reloads while offline.

### 1. Logic Verification (Unit Tests)
Use **Vitest** to test the registry and cleanup heuristics without a browser.
- **Target**: `src/lib/mutationRegistry.ts` and `src/lib/query-client.ts`.
- **Method**: 
  1. Mock the `queryClient`.
  2. Call `registerMutationDefaults`.
  3. Verify `queryClient.setMutationDefaults` was called for each key.
  4. Manually trigger `cleanupCorruptedMutations` with mock mutations of different ages/states.

### 2. Durability Verification (E2E Tests)
Use **Playwright** to simulate the "Zombie" scenario.
- **Target**: `tests/e2e/offline-sync.spec.ts` (adapted).
- **Steps**:
  1. **Go Offline**: `await context.setOffline(true)`.
  2. **Trigger Mutation**: Perform an inventory adjustment.
  3. **Verify Optimistic UI**: Check that the count changed locally.
  4. **RELOAD APP**: `await page.reload()` (This is the critical step that previously caused zombies).
  5. **Verify Persistence**: Check that the item still shows the optimistic value + "Pending to Sync".
  6. **Go Online**: `await context.setOffline(false)`.
  7. **Verify Sync**: Wait for the RPC call and check that the "Pending to Sync" label disappears.

### 3. Inspection Verification
Verify that `_ctx` is correctly serialized.
- **Method**: Use the browser's IndexedDB inspector (via Playwright or manual) to check the mutation variables in the `tanstack-query` store.
- **Goal**: Ensure `_ctx` contains `performed_by`, `user_id`, and `user_role`.
