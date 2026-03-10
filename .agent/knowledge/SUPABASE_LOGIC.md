# Supabase & Data Logic

Documentation of database patterns, RLS, and client-side optimization.

## 🗄 Table Patterns

- **`locations`**: Primary source for warehouse geometry.
- **`inventory_logs`**: Source for History. Needs coalescing for efficiency.
- **`optimization_reports`**: Can be marked as `obsolete` when metadata changes.

## 🏷️ Columnas críticas de `inventory` (post 2026-03-09)

| Columna | Tipo | Descripción |
|---|---|---|
| `item_name` | text | Nombre/nota del SKU. **Era `sku_note` antes de la migración.** |
| `internal_note` | text | Nota interna de operación (no visible al picker). |
| `capacity` | integer | Capacidad máxima de la ubicación (default 550). |
| `stowage_type` | text | `TOWER`, `LINE` o `PALLET`. |
| `stowage_index` | integer | Posición dentro del stowage. |
| `stowage_qty` | numeric | Cantidad por unidad de stowage. |
| `location_hint` | text | Pista visual de ubicación. |

> `daily_inventory_snapshots` mantiene `sku_note` como nombre histórico. Las RPCs la alimentan desde `inventory.item_name`.

## ⚙️ RPCs críticas y sus columnas

| RPC | Lee de `inventory` | Escribe en |
|---|---|---|
| `adjust_inventory_quantity` | `item_name` | `inventory.item_name` |
| `move_inventory_stock` | `item_name` | `inventory.item_name` |
| `create_daily_snapshot` | `item_name` | `daily_inventory_snapshots.sku_note` |
| `undo_inventory_action` | `COALESCE(item_name, sku_note)` del snapshot | `inventory.item_name` |

## 🔍 Cómo auditar drift de schema

```bash
# Detectar funciones que referencian una columna específica
docker exec -e PGPASSWORD=postgres supabase_db_Roman-app psql -U supabase_admin -d postgres -c \
  "SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND pg_get_functiondef(oid) LIKE '%COLUMN_NAME%';"

# Comparar schemas local vs producción
PROD_DB_URL="postgresql://postgres:PASS@db.xexkttehzpxtviebglei.supabase.co:5432/postgres" node scripts/compare-schemas.js
```

## 🔐 Authentication & RLS

- User profiles are linked to `auth.users` via `id`.
- Role-based access is managed through the `profiles` table (Check for `role` field).

## 🚀 Performance Tips

- **Selective Selects**: Use `.select('field1, field2')` instead of `*` in high-frequency hooks.
- **Pagination**: Use `range()` for logs to prevent huge payload transfers.
- **Upserts**: Use `upsert()` with `onConflict` for atomic inventory updates where possible.
