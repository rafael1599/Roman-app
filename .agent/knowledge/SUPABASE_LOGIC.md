# Supabase & Data Logic

Documentation of database patterns, RLS, and client-side optimization.

## 🗄 Table Patterns

- **`locations`**: Primary source for warehouse geometry.
- **`inventory_logs`**: Source for History. Needs coalescing for efficiency.
- **`optimization_reports`**: Can be marked as `obsolete` when metadata changes.

## 🔐 Authentication & RLS

- User profiles are linked to `auth.users` via `id`.
- Role-based access is managed through the `profiles` table (Check for `role` field).

## 🚀 Performance Tips

- **Selective Selects**: Use `.select('field1, field2')` instead of `*` in high-frequency hooks.
- **Pagination**: Use `range()` for logs to prevent huge payload transfers.
- **Upserts**: Use `upsert()` with `onConflict` for atomic inventory updates where possible.
