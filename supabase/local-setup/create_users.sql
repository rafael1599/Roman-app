-- ============================================================
-- CREAR USUARIOS LOCALES EN AUTH
-- ============================================================
-- Sincroniza public.profiles → auth.users + auth.identities
-- Password para todos: 1111
--
-- Ejecutar en SQL Editor (http://localhost:54323)
-- O vía Docker:
--   docker exec -e PGPASSWORD=postgres -i supabase_db_Roman-app psql -U supabase_admin -d postgres < supabase/local-setup/create_users.sql
-- ============================================================

-- 1. Eliminar constraint que impide múltiples usuarios sin teléfono
ALTER TABLE auth.users DROP CONSTRAINT IF EXISTS users_phone_key;

-- 2. Registrar perfiles como usuarios de Auth
DO $$
DECLARE
    p RECORD;
BEGIN
    FOR p IN SELECT * FROM public.profiles WHERE email IS NOT NULL LOOP
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p.id) THEN
            INSERT INTO auth.users (
                id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user,
                confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
                phone_change_token, reauthentication_token, email_change, phone, phone_change
            ) VALUES (
                p.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                p.email, crypt('1111', gen_salt('bf')), now(),
                '{"provider":"email","providers":["email"]}',
                jsonb_build_object('full_name', COALESCE(p.full_name, 'Staff'), 'is_active', true),
                now(), now(), false,
                '', '', '', '', '', '', '', '', ''
                -- CRÍTICO: Todos '' (no NULL). GoTrue crashea con NULLs.
            );

            INSERT INTO auth.identities (
                id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
            ) VALUES (
                gen_random_uuid(), p.id,
                jsonb_build_object('sub', p.id, 'email', p.email),
                'email', now(), now(), now(), p.id
            );
        END IF;
    END LOOP;

    UPDATE public.profiles SET is_active = true, role = 'admin';
END $$;

-- 3. Reparar NULLs residuales
UPDATE auth.users SET
    phone = COALESCE(phone, ''), phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token = COALESCE(reauthentication_token, '');

NOTIFY pgrst, 'reload schema';
