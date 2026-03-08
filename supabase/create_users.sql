-- ============================================================
-- SCRIPT DE CREACIÓN DE USUARIOS PARA SUPABASE LOCAL
-- ============================================================
-- Este script sincroniza los perfiles existentes en public.profiles
-- con el motor de autenticación local (auth.users + auth.identities).
--
-- IMPORTANTE: Ejecutar con supabase_admin (superusuario) via Docker:
--   docker exec -e PGPASSWORD=postgres -i supabase_db_Roman-app psql -U supabase_admin -d postgres -f /dev/stdin < supabase/create_users.sql
--
-- O pegar directamente en el SQL Editor de Supabase Studio (http://localhost:54323)
--
-- Password por defecto para TODOS los usuarios: 1111
-- ============================================================

-- 1. Eliminar constraint problemático de phone (causa duplicados con '')
ALTER TABLE auth.users DROP CONSTRAINT IF EXISTS users_phone_key;

-- 2. Registrar todos los perfiles existentes en el motor de Auth
DO $$
DECLARE
    p RECORD;
BEGIN
    FOR p IN SELECT * FROM public.profiles WHERE email IS NOT NULL LOOP
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p.id) THEN
            -- Crear usuario en auth.users
            -- CRÍTICO: Todos los campos de tipo string deben ser '' (no NULL)
            -- porque GoTrue (el motor de login) crashea con "converting NULL to string"
            INSERT INTO auth.users (
                id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user,
                confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
                phone_change_token, reauthentication_token, email_change, phone, phone_change
            ) VALUES (
                p.id,
                '00000000-0000-0000-0000-000000000000',
                'authenticated',
                'authenticated',
                p.email,
                crypt('1111', gen_salt('bf')),
                now(),
                '{"provider":"email","providers":["email"]}',
                jsonb_build_object('full_name', COALESCE(p.full_name, 'Staff'), 'is_active', true),
                now(), now(), false,
                '', '', '', '',   -- confirmation_token, recovery_token, email_change_token_new, email_change_token_current
                '', '',           -- phone_change_token, reauthentication_token
                '',               -- email_change (DEBE ser '' no NULL)
                '',               -- phone (DEBE ser '' pero necesita constraint eliminado primero)
                ''                -- phone_change (DEBE ser '' no NULL - causa principal del bug)
            );

            -- Crear identidad (necesaria para que el login funcione)
            INSERT INTO auth.identities (
                id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
            ) VALUES (
                gen_random_uuid(), p.id,
                jsonb_build_object('sub', p.id, 'email', p.email),
                'email', now(), now(), now(), p.id
            );
        END IF;
    END LOOP;

    -- Activar todos los perfiles como admin para desarrollo local
    UPDATE public.profiles SET is_active = true, role = 'admin';
END $$;

-- 3. Reparar cualquier usuario existente que tenga NULLs (por si se crearon antes)
UPDATE auth.users SET
    phone            = COALESCE(phone, ''),
    phone_change     = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token   = COALESCE(recovery_token, ''),
    email_change     = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token = COALESCE(reauthentication_token, '');

-- 4. Limpiar caché de la API
NOTIFY pgrst, 'reload schema';
