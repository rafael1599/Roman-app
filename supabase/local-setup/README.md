# 🔧 Setup Local de Supabase — Guía Rápida

## Archivos en esta carpeta

| Archivo | Descripción | Sensible |
|---------|-------------|:--------:|
| `fix_migration.py` | Aplica las 3 correcciones al dump de producción automáticamente | ❌ |
| `create_users.sql` | Registra usuarios en Auth usando los perfiles existentes | ❌ |
| `fix_auth_nulls.sql` | Repara NULLs en `auth.users` si el login da error 500 | ❌ |

## Archivos que DEBES tener listos (NO incluidos aquí por seguridad)

| Archivo | Ubicación | Cómo generarlo |
|---------|-----------|----------------|
| `seed.sql` | `supabase/seed.sql` | `$env:SUPABASE_DB_PASSWORD="TU_PASS"; npx supabase db dump --data-only --schema public -f supabase/seed.sql` |
| `.env` | Raíz del proyecto | Contiene `SUPABASE_URL`, `SUPABASE_ANON_KEY`, etc. |

---

## Proceso completo (de 0 a login funcionando)

### 1. Jalar esquema de producción
```powershell
npx supabase link --project-ref xexkttehzpxtviebglei
npx supabase db pull
```

### 2. Aplicar correcciones al dump automáticamente
```powershell
python supabase/local-setup/fix_migration.py
```
> Esto corrige search_path, agrega schemas, y comenta FK constraints a `auth.users`.

### 3. Descargar datos de producción
```powershell
$env:SUPABASE_DB_PASSWORD="TU_PASS"; npx supabase db dump --data-only --schema public -f supabase/seed.sql
```

### 4. Reset completo
```powershell
npx supabase stop --no-backup
npx supabase start
```
> Si falla por contenedores duplicados:
> ```powershell
> powershell -Command "docker ps -a --filter name=Roman-app -q | ForEach-Object { docker rm -f $_ }"
> npx supabase start
> ```

### 5. Crear usuarios para Auth local
Abrir SQL Editor (`http://localhost:54323`) y pegar contenido de `create_users.sql`.

O vía Docker:
```powershell
docker exec -e PGPASSWORD=postgres -i supabase_db_Roman-app psql -U supabase_admin -d postgres < supabase/local-setup/create_users.sql
```

### 6. Si el login da error "Database error querying schema"
```powershell
docker exec -e PGPASSWORD=postgres -i supabase_db_Roman-app psql -U supabase_admin -d postgres < supabase/local-setup/fix_auth_nulls.sql
```

### 7. Verificar
- URL: `http://localhost:3000`
- Login: cualquier email de producción
- Password: `1111`

---

## Referencia de roles de la DB local

| Rol | Superusuario | Uso |
|-----|:---:|-----|
| `supabase_admin` | ✅ | Modificar `auth.users`, constraints, etc. |
| `postgres` | ❌ | Operaciones normales en `public` |
| `supabase_auth_admin` | ❌ | Dueño de tablas `auth` (sin login directo) |

Comando para ejecutar SQL como superusuario:
```powershell
docker exec -e PGPASSWORD=postgres -i supabase_db_Roman-app psql -U supabase_admin -d postgres -c "TU SQL"
```
