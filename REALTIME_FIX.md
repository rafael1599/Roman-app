# Fix Realtime - Instrucciones de Configuración

## 🔴 Problema Actual

El sistema de alertas de takeover **no está funcionando** porque:
1. ✅ Código implementado correctamente
2. ❌ Supabase Realtime NO está habilitado para la tabla `picking_lists`
3. ❌ Posibles issues con Vercel + WebSockets

---

## 📡 Paso 1: Habilitar Realtime en Supabase (CRÍTICO)

### Opción A: Desde Supabase Dashboard

1. Ve a https://supabase.com/dashboard/project/xexkttehzpxtviebglei
2. Click en **Database** → **Replication**
3. Busca la tabla `picking_lists`
4. **Habilita** Realtime para esta tabla (toggle ON)
5. Guarda cambios

### Opción B: Con SQL (MÁS RÁPIDO)

Ejecuta este comando en el SQL Editor de Supabase:

```sql
-- Habilitar Realtime para picking_lists
ALTER PUBLICATION supabase_realtime ADD TABLE picking_lists;

-- Verificar que se habilitó correctamente
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'picking_lists';
```

**Esperado**: Debe retornar 1 fila que confirme que `picking_lists` está en la publicación.

---

## 🔍 Paso 2: Verificar Configuración de RLS

Ejecuta en SQL Editor:

```sql
-- Verificar políticas RLS para picking_lists
SELECT * FROM pg_policies 
WHERE tablename = 'picking_lists';
```

**Importante**: Las políticas RLS pueden bloquear Realtime. Asegúrate de que:
- `SELECT` está permitido para todos los usuarios autenticados
- No hay políticas que bloqueen cambios de otros usuarios

---

## 🧪 Paso 3: Testing con Console Logs

He agregado logs detallados. Abre DevTools Console y busca:

### Usuario A (víctima del takeover):
```
📡 [Realtime] Estado de suscripción: { status: "SUBSCRIBED", ... }
```

### Usuario B (quien hace takeover):
Cuando hace takeover, debería disparar en Usuario A:
```
🔔 [Realtime] Recibido UPDATE para picking_lists: { ... }
🚨 [Takeover] Detectado takeover en picking: [user-b-id]
⚠️ [Takeover] Mostrando alerta y reseteando sesión...
🔄 [Takeover] Ejecutando reset de sesión...
✅ [Takeover] Sesión reseteada completamente
```

---

## 🌐 Paso 4: Verificar WebSockets (Vercel Issue)

### Check 1: Ver conexión WebSocket

1. Abrir DevTools → **Network** → **WS** (WebSocket)
2. Debería aparecer una conexión a `wss://xexkttehzpxtviebglei.supabase.co/realtime/v1/websocket`
3. Estado: **101 Switching Protocols** (OK)

### Check 2: Mensajes en WebSocket

Filtra por `picking_lists` - deberías ver mensajes tipo:
```json
{
  "event": "postgres_changes",
  "payload": {
    "data": { "user_id": "...", ... }
  }
}
```

### Si NO hay conexión WebSocket:

**Problema con Vercel**: Vercel puede bloquear WebSockets en ciertas regiones o planes.

**Solución temporal**: Test en localhost primero:
```bash
pnpm run dev
```

Abre 2 navegadores distintos (Chrome + Firefox) y prueba el takeover.

---

## 🚨 Diagnóstico Rápido

### Test 1: Usuario A crea orden

Console de A:
```
📡 [Realtime] Estado de suscripción: { status: "SUBSCRIBED", listId: "abc123" }
```

✅ **Si ves esto**: Realtime conectado
❌ **Si no**: Revisar Step 1 (habilitar Realtime)

### Test 2: Usuario B hace takeover

1. B edita orderNumber a mismo valor que A
2. B confirma el takeover
3. Console de A debería mostrar:
```
🔔 [Realtime] Recibido UPDATE para picking_lists
🚨 [Takeover] Detectado takeover...
```

✅ **Si ves esto**: Sistema funcionando
❌ **Si no**: Problema con RLS o Realtime no configurado

---

## 🔧 Troubleshooting

### Problema: "Doble confirmación"

**Causa**: Confirmación de takeover + Modal de ErrorContext

**Status**: ✅ Ya arreglado - ahora usa solo 1 modal

### Problema: "No aparece alerta al usuario original"

**Causas posibles**:
1. ❌ Realtime no habilitado (Step 1)
2. ❌ RLS bloqueando SELECT (Step 2)
3. ❌ WebSocket no conectado (Step 4)
4. ❌ Usuarios en diferentes sesiones/dispositivos pero mismo navegador (usa Incognito)

### Problema: "WebSocket disconnected"

**En Vercel**: WebSockets pueden tener timeouts. Si pasa:
1. Usuario debe refrescar página para reconectar
2. Considerar polling alternativo si es frecuente

---

## ✅ Checklist de Verificación

- [ ] Realtime habilitado para `picking_lists` en Supabase
- [ ] RLS permite SELECT para usuarios autenticados
- [ ] WebSocket aparece en DevTools Network
- [ ] Console muestra "📡 Estado de suscripción: SUBSCRIBED"
- [ ] Test con 2 navegadores distintos (no tabs)
- [ ] Console muestra logs de takeover cuando ocurre

---

## 📝 Test Manual Completo

1. **Usuario A** (Chrome):
   - Login
   - Crea orden #TEST123
   - Abre Console → debería ver "📡 SUBSCRIBED"

2. **Usuario B** (Firefox):
   - Login
   - Intenta usar #TEST123
   - Ve confirmación "Orden en Uso"
   - Acepta "Tomar Control"

3. **Esperado en Usuario A**:
   - Console: "🔔 Recibido UPDATE"
   - Console: "🚨 Detectado takeover"
   - Modal: "Sesión Tomada - [Nombre de B] tomó control..."
   - Después de 1.5s: Pantalla limpia, sin orden

4. **Esperado en Usuario B**:
   - Toast: "Tomaste control de la orden"
   - Puede continuar con #TEST123

---

## 🆘 Si Nada Funciona

1. Verifica en Supabase Logs:
   - Dashboard → Logs → Realtime
   - Busca errores relacionados con `picking_lists`

2. Ejecuta test directo de Realtime:
   ```javascript
   // En Console del navegador
   const { data, error } = await supabase
     .from('picking_lists')
     .select('*')
     .limit(1);
   console.log('Test query:', data, error);
   ```

3. Si falla: Problema de autenticación/RLS
4. Si funciona: Problema específico de Realtime/WebSocket
