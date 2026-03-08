-- ============================================================
-- FIX: Reparar NULLs en auth.users
-- ============================================================
-- Usar cuando el login da "Database error querying schema" (500)
--
-- Ejecutar vía Docker (OBLIGATORIO usar supabase_admin):
--   docker exec -e PGPASSWORD=postgres -i supabase_db_Roman-app psql -U supabase_admin -d postgres < supabase/local-setup/fix_auth_nulls.sql
--
-- O pegar en SQL Editor (http://localhost:54323)
-- ============================================================

-- Eliminar constraint problemático
ALTER TABLE auth.users DROP CONSTRAINT IF EXISTS users_phone_key;

-- Convertir todos los NULLs a strings vacíos
UPDATE auth.users SET
    phone                      = COALESCE(phone, ''),
    phone_change               = COALESCE(phone_change, ''),
    phone_change_token         = COALESCE(phone_change_token, ''),
    confirmation_token         = COALESCE(confirmation_token, ''),
    recovery_token             = COALESCE(recovery_token, ''),
    email_change               = COALESCE(email_change, ''),
    email_change_token_new     = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token     = COALESCE(reauthentication_token, '');

-- Asegurar que todos tengan email confirmado
UPDATE auth.users SET
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    last_sign_in_at    = COALESCE(last_sign_in_at, now());

NOTIFY pgrst, 'reload schema';
