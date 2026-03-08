# Project Architecture & Documentation

## Overview
Roman Inv is an inventory management PWA built with React 19, TypeScript, and Supabase. It follows a **Feature-Sliced Design (FSD)** inspired architecture to ensure modularity and scalability.

## Directory Structure

### `src/features/`
This is the heart of the application. Each folder represents a distinct business domain.
- **`inventory/`**: Logic for managing stock, editing items, and location Capacity.
  - `hooks/useInventoryData.ts`: Core data fetching using React Query.
  - `hooks/useInventoryMutations.ts`: Inventory operations (Add, Edit, Move, Delete).
- **`picking/`**: Manages the order fulfillment process.
  - `context/PickingContext.tsx`: Manages the active picking session state.
  - `hooks/usePickingActions.ts`: Business logic for transitions (Ready -> Double Check -> Completed).
- **`smart-picking/`**: AI features (Gemini/OpenAI) for invoice processing.
- **`warehouse-management/`**: 3D Visualization of the warehouse and zone configuration.

### `src/context/`
Global contexts that provide shared state across multiple features.
- `AuthContext.tsx`: Supabase authentication session management.
- `PickingContext.tsx`: (Redirects to internal feature context) Manages active order state.

### `src/components/`
Reusable UI components that are agnostic to specific business logic.
- `SearchInput.tsx`: Global search component used across the app.
- `ConfirmationModal.tsx`: Standardized confirmation dialogs.

### `src/schemas/`
Zod validation schemas used for both frontend forms and backend data integrity.
- `inventory.schema.ts`: Unified schema for inventory items and locations.

### `src/utils/`
Stateless utility functions.
- `pickingLogic.ts`: Algorithms for path optimization and palletization.

## Core Workflows

### 1. Inventory Mutation Flow
The system uses **Optimistic Updates** via React Query. When a user adjusts stock:
1. The UI updates immediately (0ms latency).
2. An RPC call (`adjust_inventory_quantity`) is sent to Supabase.
3. If the call fails, the UI rolls back to the previous state automatically.

### 2. Picking & Verification
1. **Building**: User adds items to a cart.
2. **Ready**: Order is locked in the database with status `ready_to_double_check`.
3. **Double Check**: Another user (or the same) verifies the physical items.
4. **Completion**: Inventory is deducted server-side via `process_picking_list` to prevent race conditions.

## Technical Standards
- **Framework**: React 19 (using `useMemo`, `useCallback` for optimization).
- **Styling**: Tailwind CSS with a custom "iOS Glass" design system.
- **Database**: Supabase PostgreSQL with Realtime enabled for all major tables.
- **Types**: 100% TypeScript. Avoid `any` where possible.

## 🧠 Lessons Learned & Critical Solves (Session 2026-03-08)

### 1. The "Completed Order" Regression Bug
**Problem**: Users could accidentally revert finished orders back to "picking" mode by clicking the "Release" (X) button before the UI refreshed.
**Solve**: Implemented **Triple-Layer Protection**:
- **DB Layer**: Every status update (except completion) now includes a `.neq('status', 'completed')` filter in the Supabase query.
- **UI Layer**: The "Release to Queue" button is conditionally hidden once `listStatus === 'completed'`.
- **Sync Layer**: A Realtime effect in `PickingCartDrawer` monitors the order status and triggers `resetSession()` immediately upon server completion.

### 2. RPC Argument Mismatch (400 Bad Request)
**Problem**: The `adjust_inventory_quantity` RPC failed because the frontend was passing parameters (like `sku_note`) that had been removed from the Postgres function.
**Solve**: Updated `useInventoryMutations` to strictly match the Postgres function signature. Always verify the `v_` parameter names in Supabase when a mutation returns a 400 error.

### 3. Z-Index & Overflow in Fixed Headers
**Problem**: On mobile, the order selection dropdown was hidden/cut off by the main form due to `overflow-hidden` on the header and low z-index.
**Solve**: Removed `overflow-hidden` from the global header in `OrdersScreen.tsx` and boosted the dropdown's z-index to `110` to ensure it floats above all other absolute-positioned elements.
