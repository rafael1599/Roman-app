# Memory — PickD

## Stack

- React 19 + TypeScript + Supabase (PostgreSQL)
- Local: Docker en `127.0.0.1:54322`, Studio en `localhost:54323`
- Producción: proyecto `xexkttehzpxtviebglei` en Supabase
- `PROD_DB_URL` debe estar en `.env` en la raíz del proyecto (no en `/scripts/`)

## Migraciones

- Siempre crear archivo en `supabase/migrations/` antes de cualquier cambio de BD
- Usar `npx supabase migration new [nombre]` para generar con timestamp
- Cambios manuales en Supabase Dashboard → correr `supabase migration repair` después
- Migraciones deben ser idempotentes: `IF NOT EXISTS`, `CREATE OR REPLACE`, `DO $$ IF EXISTS $$`
