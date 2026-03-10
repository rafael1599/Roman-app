---
name: sync-db
description: "Sincronización de base de datos local ↔ producción con Supabase. Usa este skill cuando el usuario mencione sincronizar bases de datos, revisar si está sincronizado, check de BD, comparar local con producción, schema drift, migraciones pendientes, o cualquier variante en español o inglés sobre el estado de su base de datos local vs producción. También se activa cuando el usuario dice 'revisa mis bases de datos', 'estoy sincronizado?', 'check db', 'cómo está la BD', 'sync prod→local', 'sincroniza local→prod'."
---

# /sync-db — Sincronización de base de datos local ↔ producción

## Modos de uso

### Modo revisión (solo diagnóstico, sin ejecutar nada)
Si el usuario dice "revisar", "check", "status", "cómo estoy", "estoy sincronizado" o cualquier variante que implique solo querer saber el estado — **no ejecutes ninguna acción**. Solo corre el Paso 1 y el Paso 2 y presenta el resultado. Termina ahí.

Esto consume ~500 tokens. Úsalo para chequeos frecuentes.

### Modo sincronización (ejecuta cambios)
El usuario debe especificar la dirección:
- `local→prod` / `local→produccion` / `local to prod`
- `prod→local` / `produccion→local` / `prod to local`

Si no se especifica la dirección y el usuario claramente quiere sincronizar (no solo revisar), pregunta antes de continuar.

---

## Protocolo de ejecución

### PASO 1 — Diagnóstico de schema

Corre el script de comparación:
```
node scripts/compare-schemas.js
```

Si falla por PROD_DB_URL faltante, detente y explica al usuario que debe tener `PROD_DB_URL` en su `.env`.

Si el Docker local no está corriendo (`supabase status` da error), avisa al usuario que corra `npx supabase start` primero.

### PASO 2 — Historial de migraciones

Corre:
```
npx supabase migration list
```

Identifica migraciones con estado `LOCAL ONLY` (existen localmente pero no en prod) o `REMOTE ONLY` (existen en prod pero no localmente). Estas son banderas rojas que debes reportar.

### PASO 3 — Frontend check (grep)

Ejecuta estos greps sobre `src/` para mapear qué usa realmente el frontend:

```bash
# RPCs llamadas desde el frontend
grep -r "\.rpc(" src/ --include="*.ts" --include="*.tsx" -h | grep -oP "(?<=\.rpc\()['\"][^'\"]+['\"]" | sort -u

# Tablas usadas
grep -r "\.from(" src/ --include="*.ts" --include="*.tsx" -h | grep -oP "(?<=\.from\()['\"][^'\"]+['\"]" | sort -u

# Columnas seleccionadas explícitamente
grep -r "\.select(" src/ --include="*.ts" --include="*.tsx" -h | grep -oP "(?<=\.select\()['\"][^'\"]+['\"]" | sort -u
```

### PASO 4 — Leer el health map

Lee `scripts/db-health-map.json` si existe. Úsalo para:
- Comparar firmas RPC actuales del frontend vs las registradas previamente
- Identificar columnas/funciones "calientes" (que han cambiado antes)
- Mostrar si un drift actual ya ocurrió antes y cómo se resolvió

### PASO 5 — Clasificar cambios encontrados

Clasifica cada diferencia detectada:

**SEGUROS (ejecutar sin preguntar):**
- `ADD COLUMN` con `IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `ADD INDEX`
- `ADD CONSTRAINT` (foreign keys, checks)
- `CREATE TABLE` nueva

**PELIGROSOS (pausar y explicar antes de continuar):**
- `DROP COLUMN` o `DROP TABLE`
- `RENAME COLUMN` o `RENAME TABLE`
- Cambio de tipo de dato (`ALTER COLUMN TYPE`)
- `DROP FUNCTION`
- `TRUNCATE`
- Cualquier operación que pueda perder datos

Si hay cambios peligrosos, describe exactamente qué impacto tendría y pide confirmación explícita antes de proceder.

Si hay cambios peligrosos Y el usuario tiene datos en la dirección destino que podrían perderse, bloquea y exige confirmación con doble advertencia.

### PASO 6 — Ejecutar según dirección

#### Si `local→prod`:
1. Para cada diferencia segura: crea un archivo de migración con `npx supabase migration new [nombre_descriptivo]` y escribe el SQL correspondiente
2. Corre `npx supabase db push` para aplicar a producción
3. Verifica con `npx supabase migration list` que quedó aplicada

#### Si `prod→local`:
1. Corre `npx supabase db pull` para capturar el schema de prod
2. Corre `npx supabase db reset` para aplicar todas las migraciones al Docker local
3. Si el usuario aprobó sincronizar datos: corre `npx supabase db dump --data-only -f /tmp/prod_data_dump.sql` y aplícalo al local con `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres < /tmp/prod_data_dump.sql`

### PASO 7 — Actualizar el health map

Actualiza `scripts/db-health-map.json` con la estructura:

```json
{
  "last_sync": "ISO timestamp",
  "rpc_signatures": {
    "nombre_funcion": {
      "frontend_calls_with": ["param1", "param2"],
      "last_seen": "ISO timestamp"
    }
  },
  "hot_columns": {
    "tabla.columna": {
      "change_count": N,
      "last_changed": "ISO timestamp"
    }
  },
  "drift_history": [
    {
      "date": "ISO timestamp",
      "direction": "local→prod | prod→local",
      "diffs_found": ["descripción de cada diff"],
      "diffs_resolved": ["descripción de lo que se hizo"],
      "migration_created": "nombre del archivo si aplica"
    }
  ]
}
```

Reglas de actualización:
- Si una columna o función ya tenía entrada en `hot_columns` o `rpc_signatures`, incrementa el contador
- Si el mismo drift ya aparece en `drift_history`, referencia la entrada anterior en el resumen
- Si una RPC tiene parámetros diferentes a los registrados en `rpc_signatures`, márcalo como advertencia

### PASO 8 — Actualizar el diagnóstico específico en compare-schemas.js

Al final del archivo `scripts/compare-schemas.js`, existe un array `knownProblems`. Reemplázalo con las columnas que realmente usa el frontend según el grep del Paso 3, en formato:
```js
const knownProblems = [
  { table: 'tabla', column: 'columna' },
  // ... una entrada por cada columna que el frontend selecciona explícitamente
];
```

Limita a las 15 columnas más relevantes (las que más aparecen en el grep).

### PASO 9 — Resumen final

Presenta un resumen estructurado:

```
## Resumen de sincronización [dirección] — [fecha]

### Diferencias encontradas
- [lista]

### Acciones ejecutadas
- [lista]

### Advertencias
- [si las hay]

### Estado final
✅ Local y producción sincronizados / ⚠️ Requiere atención manual en: [X]
```

---

## Reglas generales

- **Nunca** ejecutes un DROP sin confirmación explícita del usuario
- **Nunca** hagas `supabase db push` si hay migraciones con conflictos de historial sin resolver primero con `supabase migration repair`
- Si `compare-schemas.js` ya muestra todo verde y el historial está limpio, termina inmediatamente con "Todo sincronizado. No hay acciones necesarias."
- Siempre haz commit de los archivos de migración nuevos al git antes de reportar éxito
