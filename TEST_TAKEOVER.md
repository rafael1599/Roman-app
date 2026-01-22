# Test de Takeover - Paso a Paso

## ✅ Realtime Habilitado

Confirmado que `picking_lists` está en la publicación de Realtime.

---

## 🧪 Test Manual (2 Navegadores)

### Setup

1. **Navegador A** (Chrome): Usuario original
2. **Navegador B** (Firefox/Incognito): Usuario que hace takeover
3. **Ambos**: Abre Console (F12 → Console)

---

## 📝 Pasos del Test

### 1. Usuario A - Crear Orden

**Acciones**:
1. Login en Chrome
2. Ir a modo Picking
3. Agregar items al cart
4. Editar número de orden a `#TEST123`
5. Confirmar

**Esperado en Console**:
```
📡 [Realtime] Estado de suscripción: {
  status: "SUBSCRIBED",
  listId: "[id-de-la-orden]",
  channel: "list_status_sync_[id]"
}
```

✅ **Si ves "SUBSCRIBED"**: Conexión Realtime OK
❌ **Si no aparece**: Refrescar página

---

### 2. Usuario B - Intentar Takeover

**Acciones**:
1. Login en Firefox (otro usuario)
2. Ir a modo Picking
3. Agregar cualquier item al cart
4. Intentar usar el mismo número: `#TEST123`

**Esperado**:
- Se abre modal: "Orden en Uso - [Nombre de Usuario A] está trabajando en la orden #TEST123"
- Botones: "Tomar Control" / "Cancelar"

**Click en "Tomar Control"**

---

### 3. Verificar Logs en Usuario A

**Esperado en Console de Usuario A** (inmediatamente):
```
🔔 [Realtime] Recibido UPDATE para picking_lists: {
  listId: "[id]",
  user: "[user-a-id]",
  sessionMode: "picking",
  newUserId: "[user-b-id]",    ← Este cambió!
  newCheckedBy: null
}

🚨 [Takeover] Detectado takeover en picking: [user-b-id]

⚠️ [Takeover] Mostrando alerta y reseteando sesión...
```

**Esperado en UI de Usuario A**:
- Modal aparece: "Sesión Tomada - [Nombre de B] tomó control de tu orden. Tu sesión se reiniciará automáticamente."
- Después de 1.5 segundos:
  - Modal desaparece
  - Cart se vacía
  - Vuelve a pantalla inicial

**Más logs en Console de A**:
```
🔄 [Takeover] Ejecutando reset de sesión...
✅ [Takeover] Sesión reseteada completamente
🔌 [Realtime] Desconectando canal: list_status_sync_[id]
```

---

### 4. Verificar Usuario B

**Esperado en Usuario B**:
- Toast verde: "Tomaste control de la orden"
- Tiene la orden #TEST123 activa
- Puede continuar trabajando normalmente

---

## 🔍 Diagnóstico de Problemas

### A. Si no aparece "SUBSCRIBED" en Console

**Causa**: WebSocket no conectado

**Solución**:
1. Refresh página completa (Ctrl+Shift+R)
2. Verificar en Network → WS si hay conexión
3. Si sigue fallando: Problema con Vercel/WebSocket

### B. Si Usuario A no recibe alerta

**Posibles causas**:

**1. Mismo navegador/tabs**: 
- ✅ Usa 2 navegadores DISTINTOS (Chrome + Firefox)
- ❌ No uses tabs del mismo navegador

**2. No hay UPDATE en Realtime**:
- Verificar que aparece "🔔 Recibido UPDATE" en Console A
- Si NO aparece: Problema con RLS o Realtime

**3. UPDATE aparece pero sin takeover**:
- Verificar que `newUserId` en el log es diferente de `user`
- Si son iguales: B no hizo takeover correctamente

### C. Si aparece "🔔 Recibido UPDATE" pero no "🚨 Detectado takeover"

**Causa**: Lógica de detección no ejecutándose

**Debug**:
En Console de A, ejecuta:
```javascript
// Ver estado actual
console.log({
  sessionMode: '[modo actual]',
  userId: '[tu user id]'
});
```

Compara con el `newUserId` del log.

---

## 📊 Checklist de Éxito

- [x] Realtime habilitado en Supabase ✅
- [ ] Usuario A ve "📡 SUBSCRIBED" en Console
- [ ] Usuario B ve confirmación "Orden en Uso"
- [ ] Usuario B hace takeover
- [ ] Usuario A ve "🔔 Recibido UPDATE" en Console
- [ ] Usuario A ve "🚨 Detectado takeover" en Console
- [ ] Usuario A recibe modal "Sesión Tomada"
- [ ] Usuario A: Sesión se resetea después de 1.5s
- [ ] Usuario B: Puede continuar con la orden

---

## 🚨 Si Todo Falla

### Último recurso: Verificar RLS

Ejecuta en SQL Editor:
```sql
-- Ver políticas actuales
SELECT * FROM pg_policies 
WHERE tablename = 'picking_lists';

-- Si hay problemas, crear política permisiva temporal
CREATE POLICY "temp_allow_all_picking" 
ON picking_lists 
FOR ALL 
USING (true);
```

⚠️ **SOLO PARA DEBUG** - Eliminar después:
```sql
DROP POLICY "temp_allow_all_picking" ON picking_lists;
```

---

## 📸 Capturas Útiles

Toma screenshots de:
1. Console de Usuario A mostrando logs
2. Console de Usuario B
3. Network → WS mostrando WebSocket conectado

Esto ayudará a diagnosticar si algo falla.
