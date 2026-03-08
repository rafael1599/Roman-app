"""
fix_migration.py — Corrige automáticamente el dump de producción para funcionar en local.

Uso:
    python supabase/local-setup/fix_migration.py

Busca el archivo de migración más reciente en supabase/migrations/ y aplica:
1. Cambia search_path de '' a 'public, auth, extensions'
2. Agrega CREATE SCHEMA IF NOT EXISTS para public, auth, extensions
3. Comenta los ALTER TABLE con FK constraints hacia auth.users
"""

import os
import re
import glob

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'migrations')

def find_latest_migration():
    """Encuentra el archivo de migración más reciente (por nombre, no la custom)."""
    files = glob.glob(os.path.join(MIGRATIONS_DIR, '*_remote_schema.sql'))
    if not files:
        # Si no hay uno con ese nombre, buscar el más reciente que no sea custom
        files = glob.glob(os.path.join(MIGRATIONS_DIR, '*.sql'))
        # Excluir migraciones custom conocidas
        files = [f for f in files if 'add_default_distribution' not in f]
    if not files:
        print("ERROR: No se encontró ningún archivo de migración en supabase/migrations/")
        return None
    files.sort()
    return files[-1]

def fix_migration(filepath):
    print(f"Procesando: {os.path.basename(filepath)}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    fixes_applied = []

    # --- FIX 1: Cambiar search_path ---
    old_search_path = "set_config('search_path', '', false)"
    new_search_path = "set_config('search_path', 'public, auth, extensions', false)"
    if old_search_path in content:
        content = content.replace(old_search_path, new_search_path)
        fixes_applied.append("search_path: '' → 'public, auth, extensions'")

    # --- FIX 2: Agregar CREATE SCHEMA al inicio ---
    schema_block = (
        'CREATE SCHEMA IF NOT EXISTS "public";\n'
        'CREATE SCHEMA IF NOT EXISTS "auth";\n'
        'CREATE SCHEMA IF NOT EXISTS "extensions";\n'
    )
    if 'CREATE SCHEMA IF NOT EXISTS "auth"' not in content:
        # Insertar después de SET row_security = off;
        marker = "SET row_security = off;"
        if marker in content:
            content = content.replace(marker, marker + "\n\n" + schema_block)
            fixes_applied.append("Agregados CREATE SCHEMA IF NOT EXISTS (public, auth, extensions)")

    # --- FIX 3: Comentar FK constraints hacia auth.users ---
    # Patrones de ALTER TABLE que referencian auth.users
    fk_patterns = [
        r'(ALTER TABLE ONLY "public"\."profiles"\s+ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY \("id"\) REFERENCES "auth"\."users"\("id"\)[^;]*;)',
        r'(ALTER TABLE ONLY "public"\."inventory_logs"\s+ADD CONSTRAINT "inventory_logs_user_id_fkey" FOREIGN KEY \("user_id"\) REFERENCES "auth"\."users"\("id"\)[^;]*;)',
        r'(ALTER TABLE ONLY "public"\."user_presence"\s+ADD CONSTRAINT "user_presence_user_id_fkey" FOREIGN KEY \("user_id"\) REFERENCES "auth"\."users"\("id"\)[^;]*;)',
    ]
    
    for pattern in fk_patterns:
        match = re.search(pattern, content, re.DOTALL)
        if match:
            original_stmt = match.group(1)
            # Solo comentar si no está ya comentado
            if not original_stmt.strip().startswith('--'):
                commented = '\n'.join('-- ' + line for line in original_stmt.split('\n'))
                content = content.replace(original_stmt, commented)
                # Extraer nombre del constraint para el log
                name_match = re.search(r'"(\w+_fkey)"', original_stmt)
                constraint_name = name_match.group(1) if name_match else "unknown"
                fixes_applied.append(f"Comentado FK: {constraint_name}")

    if content == original:
        print("✅ No se necesitaron correcciones (ya estaban aplicadas).")
        return

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"\n✅ {len(fixes_applied)} correcciones aplicadas:")
    for fix in fixes_applied:
        print(f"   • {fix}")
    print(f"\nArchivo guardado: {filepath}")

if __name__ == '__main__':
    migration_file = find_latest_migration()
    if migration_file:
        fix_migration(migration_file)
