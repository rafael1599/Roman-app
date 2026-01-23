# Phase 1: Foundation (TypeScript & Zod) - ENHANCED

## Context & Purpose

After analyzing the current codebase structure, this phase establishes a **strict data validation boundary** to eliminate the root cause of 90% of runtime errors: unvalidated data from external sources (Supabase DB, AI APIs, user input).

---

## Critical Findings from Code Analysis

### 🔴 High-Risk Areas Identified:

1.  **Manual Type Coercion (33+ instances)**: `parseInt(item.Quantity || 0)` scattered across 15+ files creates inconsistency. If DB returns `null`, some fail silently, others crash.
2.  **AI Response Validation (Weak)**: `aiScanner.js` validates item structure BUT only after parsing. A malformed JSON from AI crashes the app before validation runs.
3.  **DB Schema Mismatch**: `inventory_logs.quantity` is `INTEGER` in SQL, but frontend sometimes sends `string` or `undefined`.
4.  **Context Pollution**: `useInventoryData.jsx` (750 lines) mixes business logic, DB queries, and UI state. TS won't help if we don't first **separate concerns**.

### 📊 Data Flow Audit:

```
External Sources → Frontend (NO VALIDATION) → DB/State
    ↓
  💥 Crash or Silent Corruption
```

**Target Architecture:**

```
External → Zod Guard → Typed State → Components
              ↓
         Fail Fast (User sees error, app doesn't crash)
```

---

## Phase 1 Tasks (REVISED & ENRICHED)

### 1. Environment & Tooling Setup

- [ ] **Install Core Dependencies**:
  ```bash
  npm install -D typescript @types/react @types/react-dom @types/node
  npm install zod
  ```
- [ ] **TypeScript Configuration** (`tsconfig.json`):
  ```json
  {
    "compilerOptions": {
      "target": "ES2020",
      "useDefineForClassFields": true,
      "lib": ["ES2020", "DOM", "DOM.Iterable"],
      "module": "ESNext",
      "skipLibCheck": true,
      "moduleResolution": "bundler",
      "allowImportingTsExtensions": true,
      "resolveJsonModule": true,
      "isolatedModules": true,
      "noEmit": true,
      "jsx": "react-jsx",
      "strict": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noFallthroughCasesInSwitch": true,
      "noImplicitAny": true,
      "strictNullChecks": true
    },
    "include": ["src"],
    "references": [{ "path": "./tsconfig.node.json" }]
  }
  ```
- [ ] **Vite Config Update** (Ensure `.ts`/`.tsx` are processed):
  - Verify `@vitejs/plugin-react` handles TS correctly.
  - Add path aliases for cleaner imports: `@/schemas`, `@/hooks`, etc.

### 2. Data Schemas (The "Single Source of Truth")

**Why we need this BEFORE converting files:**
Without schemas, converting `.jsx` → `.tsx` just adds `any` types everywhere, which is useless.

#### 2.1 Core Domain Schemas (`src/schemas/`)

Create these files in order:

**A. `src/schemas/inventory.schema.ts`**

```typescript
import { z } from 'zod';

// Raw DB Shape (what Supabase returns)
export const InventoryItemDBSchema = z.object({
  id: z.string().uuid(),
  SKU: z.string().min(1, 'SKU cannot be empty'),
  Quantity: z.number().int().nonnegative(), // CRITICAL: Force number
  Location: z.string().nullable(),
  Warehouse: z.enum(['LUDLOW', 'ATS']),
  Capacity: z.number().int().positive().optional(),
  created_at: z.string().datetime(),
});

// Frontend Shape (what components use)
export const InventoryItemSchema = InventoryItemDBSchema.extend({
  // Add computed fields if needed
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type InventoryItemDB = z.infer<typeof InventoryItemDBSchema>;
```

**B. `src/schemas/log.schema.ts`**

```typescript
import { z } from 'zod';

export const LogActionType = z.enum(['MOVE', 'ADD', 'EDIT', 'DEDUCT', 'DELETE']);

export const InventoryLogSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  from_warehouse: z.string().nullable(),
  from_location: z.string().nullable(),
  to_warehouse: z.string().nullable(),
  to_location: z.string().nullable(),
  quantity: z.number().int().positive(),
  prev_quantity: z.number().int().nonnegative().nullable(),
  new_quantity: z.number().int().nonnegative().nullable(),
  is_reversed: z.boolean(),
  action_type: LogActionType,
  performed_by: z.string(),
  created_at: z.string().datetime(),
});

export type InventoryLog = z.infer<typeof InventoryLogSchema>;
```

**C. `src/schemas/ai.schema.ts`** (High Priority - AI is unreliable!)

```typescript
import { z } from 'zod';

export const AIOrderItemSchema = z.object({
  sku: z.string().min(1, 'SKU cannot be empty'),
  qty: z.number().int().positive('Quantity must be positive'),
});

export const AIOrderResponseSchema = z.object({
  items: z.array(AIOrderItemSchema),
});

export const AIPalletVerificationSchema = z.object({
  matched: z.array(
    z.object({
      sku: z.string(),
      expected: z.number(),
      detected: z.number(),
      match: z.boolean(),
    })
  ),
  missing: z.array(AIOrderItemSchema),
  extra: z.array(AIOrderItemSchema),
});

export type AIOrderItem = z.infer<typeof AIOrderItemSchema>;
```

**D. `src/schemas/location.schema.ts`**

```typescript
import { z } from 'zod';

export const LocationSchema = z.object({
  id: z.string().uuid(),
  location: z.string(),
  warehouse: z.enum(['LUDLOW', 'ATS']),
  zone_type: z.string().nullable(),
  max_capacity: z.number().int().positive().nullable(),
  picking_order: z.number().int().nonnegative().nullable(),
  created_at: z.string().datetime(),
});

export type Location = z.infer<typeof LocationSchema>;
```

#### 2.2 Validation Utility (`src/utils/validate.ts`)

```typescript
import { ZodSchema, ZodError } from 'zod';

export function validateData<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('❌ Validation failed:', error.errors);
      throw new Error(`Data validation error: ${error.errors.map((e) => e.message).join(', ')}`);
    }
    throw error;
  }
}

export function validateArray<T>(schema: ZodSchema<T>, data: unknown[]): T[] {
  return data.map((item, index) => {
    try {
      return schema.parse(item);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(`Item ${index} validation failed: ${error.errors[0].message}`);
      }
      throw error;
    }
  });
}
```

### 3. Strategic Incremental Migration

**CRITICAL: Do NOT convert all files at once. This order minimizes breakage:**

#### 3.1 Phase 1A: Type-Only Files (No logic, just definitions)

- [ ] Convert `src/schemas/*.ts` (already TS-first)
- [ ] Convert `src/utils/validate.ts`

#### 3.2 Phase 1B: Services Layer (External data boundary)

- [ ] **`src/services/aiScanner.ts`**: Wrap all AI responses with Zod validation

  ```typescript
  // BEFORE (line 109):
  const data = JSON.parse(text);
  return data.items || [];

  // AFTER:
  const rawData = JSON.parse(text);
  const validated = validateData(AIOrderResponseSchema, rawData);
  return validated.items;
  ```

- [ ] **`src/hooks/useInventoryLogs.ts`**: Add types to `trackLog`, `fetchLogs`
- [ ] **`src/hooks/useInventoryData.tsx`**: This is the BIG ONE. Break into steps:
  1. Add type annotations to function signatures
  2. Replace `parseInt` with schema validation
  3. Add explicit return types

#### 3.3 Phase 1C: Context Providers

- [ ] `src/context/AuthContext.tsx`
- [ ] `src/context/ThemeContext.tsx`
- [ ] `src/context/ViewModeContext.tsx`

#### 3.4 Phase 1D: Components (Last, because they depend on typed hooks)

- [ ] Modals: `InventoryModal.tsx`, `MovementModal.tsx`
- [ ] Screens: `InventoryScreen.tsx`, `HistoryScreen.tsx`

### 4. Code Principles & Standards

**Enforce these rules strictly:**

1.  **No `any` Types**: Use `unknown` if genuinely unknown, then validate.
2.  **Fail Fast**: Validate at the boundary (DB fetch, AI response), not in components.
3.  **Explicit > Implicit**: Always define function return types.
4.  **Defensive Parsing**: Never trust external data. Always `schema.parse()` before use.
5.  **Type Guards for Legacy**: If a `.jsx` file calls a `.ts` file, add type guards:

```typescript
export function isInventoryItem(data: unknown): data is InventoryItem {
  return InventoryItemSchema.safeParse(data).success;
}
```

### 5. Testing & Validation Gates

- [ ] **Pre-Commit Hook**: Add `tsc --noEmit` to ensure no type errors slip through
- [ ] **Runtime Validation Test**: Create a test file that sends malformed data to schemas and ensures they throw
- [ ] **AI Response Mock Test**: Feed `aiScanner` a broken JSON and verify it catches the error

---

## What This Phase Does NOT Cover (Phase 2+)

- Zustand migration (requires stable types first)
- Component virtualization
- PWA setup
- RxDB integration

---

## Success Metrics

✅ **Phase 1 Complete When:**

1.  All `.js`/`.jsx` hooks and services are `.ts`/`.tsx`
2.  No `parseInt` without schema validation remains
3.  AI responses are validated before reaching state
4.  `tsc --noEmit` runs without errors
5.  `useInventoryData` has explicit types for all functions

---

## Risk Mitigation

**Biggest Risk**: Breaking existing functionality during migration.

**Mitigation**:

- Keep old `.jsx` and new `.tsx` side-by-side temporarily
- Use `// @ts-ignore` ONLY for third-party libs without types (mark with TODO)
- Test each conversion with manual UI testing (critical flows: add item, move item, log verification)

---

## Time Estimate (Based on Codebase Size)

- **Setup & Schema Definition**: 2-3 hours
- **Service Layer Migration**: 3-4 hours
- **Hook Migration** (especially `useInventoryData`): 5-6 hours
- **Context Migration**: 2 hours
- **Component Migration**: 6-8 hours (15+ components)
- **Testing & Debugging**: 4-5 hours

**Total: ~25-30 hours of focused work**

Can be split into 5-6 work sessions.
