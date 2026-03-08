---
description: Cómo sincronizar la base de datos local de Supabase con producción
---

# Sincronizar Base de Datos Local con Producción

## Prerrequisitos
- Docker Desktop corriendo
- Supabase CLI instalado (`npx supabase`)
- Project ref de producción: `xexkttehzpxtviebglei`
- Contraseña de la base de datos de producción

---

## Paso 1: Linkear proyecto (solo la primera vez)

```bash
npx supabase link --project-ref xexkttehzpxtviebglei
```

Te pedirá la contraseña de la base de datos de producción.

## Paso 2: Reparar historial de migraciones (si hay desajustes)

Si al hacer `db pull` da error de migration history:

```bash
npx supabase migration repair --status applied 20260211000200
# ... (ejecutar todos los que la CLI sugiera)
```

## Paso 3: Jalar el esquema de producción

```bash
npx supabase db pull
```

Cuando pregunte "Update remote migration history table? [Y/n]", responde **Y**.

Esto genera un archivo en `supabase/migrations/` con el esquema actual de producción.

> [!WARNING]
> **Correcciones obligatorias al archivo de migración generado:**
> El dump de producción necesita estas correcciones para funcionar en local.
>
> 1. **Cambiar `search_path`** (línea ~9): Reemplazar `set_config('search_path', '', false)` por `set_config('search_path', 'public, auth, extensions', false)` para evitar el error `"no schema has been selected to create in"`.
>
> 2. **Agregar esquemas al inicio** (después de `SET row_security = off`):
>    ```sql
>    CREATE SCHEMA IF NOT EXISTS "public";
>    CREATE SCHEMA IF NOT EXISTS "auth";
>    CREATE SCHEMA IF NOT EXISTS "extensions";
>    ```
>
> 3. **Comentar FK constraints hacia `auth.users`**: Buscar y comentar las líneas que crean foreign keys apuntando a `"auth"."users"("id")`, como:
>    - `profiles_id_fkey`
>    - `inventory_logs_user_id_fkey`
>    - `user_presence_user_id_fkey`
>
>    Estas fallan durante `db reset` porque `auth.users` está vacía al momento de ejecutar las migraciones.

## Paso 4: Descargar datos de producción

```powershell
$env:SUPABASE_DB_PASSWORD="TU_CONTRASEÑA"; npx supabase db dump --data-only --schema public -f supabase/data_dump.sql
```

> [!WARNING]
> Si no usas comillas dobles en la contraseña dentro de PowerShell, el comando fallará con un error de "ObjectNotFound".

### Mover datos al archivo de semilla

```powershell
Move-Item -Path "supabase\data_dump.sql" -Destination "supabase\seed.sql" -Force
```

## Paso 5: Resetear la base local

```powershell
npx supabase db reset
```

> [!IMPORTANT]
> Si ves errores de **contenedor Docker duplicado** (`container name is already in use`), elimina los contenedores huérfanos:
> ```powershell
> # Ver contenedores problemáticos
> docker ps -a --filter name=Roman-app
>
> # Eliminar todos los contenedores del proyecto
> powershell -Command "docker ps -a --filter name=Roman-app -q | ForEach-Object { docker rm -f $_ }"
>
> # Reintentar
> npx supabase start
> ```

---

## Paso 6: Crear usuarios locales (Auth)

La tabla `auth.users` no se exporta de producción por seguridad. Hay que crear los usuarios manualmente para que el login funcione.

### Opción A: Ejecutar el script SQL (Recomendado)

Abre el SQL Editor en Supabase Studio (`http://localhost:54323`) y pega el contenido de `supabase/create_users.sql`.

Este script:
1. Elimina la constraint `users_phone_key` (causa conflictos de duplicados)
2. Crea usuarios en `auth.users` para cada perfil con email en `public.profiles`
3. Crea las identidades en `auth.identities` (necesarias para login)
4. Repara campos NULL que causan el error `"converting NULL to string"`
5. Activa todos los perfiles como admin

**Password para todos los usuarios:** `1111`

### Opción B: Vía Docker (si el SQL Editor no está disponible)

```powershell
docker exec -e PGPASSWORD=postgres -i supabase_db_Roman-app psql -U supabase_admin -d postgres -f /dev/stdin < supabase/create_users.sql
```

> [!CAUTION]
> **NUNCA uses el usuario `postgres` para modificar tablas de `auth`.**
> En Supabase local, `postgres` NO es superusuario. El superusuario es `supabase_admin`.
> Y la tabla `auth.users` pertenece a `supabase_auth_admin`.
>
> Para ejecutar comandos admin via Docker:
> ```powershell
> docker exec -e PGPASSWORD=postgres -i supabase_db_Roman-app psql -U supabase_admin -d postgres -c "TU SQL AQUÍ"
> ```

---

## Paso 7: Verificar login

1. Abre la app en `http://localhost:3000`
2. Login con cualquier email de producción (ej: `jsunga@jamisbikes.com`)
3. Password: `1111`

---

## Troubleshooting

### Error: "Database error querying schema" (500 Internal Server Error)

**Causa raíz:** GoTrue (el motor de Auth) no puede leer campos NULL en columnas de tipo string de la tabla `auth.users`. Esto pasa cuando los usuarios se insertan con NULL en campos como `phone`, `phone_change`, `email_change`, etc.

**Diagnóstico:** Ver los logs del contenedor de Auth:
```powershell
docker logs supabase_auth_Roman-app --tail 20
```
Buscar mensajes como: `"converting NULL to string is unsupported"` seguido del nombre de la columna problemática.

**Solución:** Ejecutar como `supabase_admin` (el único superusuario):
```powershell
docker exec -e PGPASSWORD=postgres -i supabase_db_Roman-app psql -U supabase_admin -d postgres -c "ALTER TABLE auth.users DROP CONSTRAINT IF EXISTS users_phone_key; UPDATE auth.users SET phone = COALESCE(phone, ''), phone_change = COALESCE(phone_change, ''), phone_change_token = COALESCE(phone_change_token, ''), confirmation_token = COALESCE(confirmation_token, ''), recovery_token = COALESCE(recovery_token, ''), email_change = COALESCE(email_change, ''), email_change_token_new = COALESCE(email_change_token_new, ''), email_change_token_current = COALESCE(email_change_token_current, ''), reauthentication_token = COALESCE(reauthentication_token, '');"
```

### Error: "must be owner of table users"

**Causa:** Estás usando el usuario `postgres` para modificar tablas de `auth`. En Supabase local, `postgres` NO es superusuario.

**Solución:** Usar `supabase_admin` como se muestra arriba.

### Error: "duplicate key value violates unique constraint users_phone_key"

**Causa:** La constraint `users_phone_key` impide que múltiples usuarios tengan `phone = ''`.

**Solución:** Eliminar la constraint primero:
```sql
ALTER TABLE auth.users DROP CONSTRAINT IF EXISTS users_phone_key;
```

### Error: "container name is already in use"

**Causa:** Contenedores Docker huérfanos del proyecto anterior no se cerraron bien.

**Solución:**
```powershell
powershell -Command "docker ps -a --filter name=Roman-app -q | ForEach-Object { docker rm -f $_ }"
```

### Error: "no schema has been selected to create in" (al hacer db reset)

**Causa:** La migración de producción setea `search_path` a vacío (`''`), lo que impide que el motor de Auth cree sus tablas internas.

**Solución:** En el archivo de migración, cambiar:
```sql
-- ANTES (rompe Auth):
SELECT pg_catalog.set_config('search_path', '', false);

-- DESPUÉS (funciona):
SELECT pg_catalog.set_config('search_path', 'public, auth, extensions', false);
```

### Roles de la base de datos local

| Rol | Superusuario | Uso |
|-----|:---:|-----|
| `supabase_admin` | ✅ | Modificar cualquier tabla, incluida `auth.users` |
| `postgres` | ❌ | Operaciones normales en `public` schema |
| `supabase_auth_admin` | ❌ | Dueño de `auth.users` (no tiene login directo) |

---

## Edge Functions Locales

Si el Dashboard usa funciones (como `manage-users`), estas no corren solas:

```powershell
npx supabase functions serve
```

> [!TIP]
> Si la función `manage-users` da error 404, verificar que la carpeta `supabase/functions/manage-users` existe.
