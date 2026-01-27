# Limpiar Cola de Mutaciones Corruptas

Para eliminar las mutaciones con IDs inválidos que están en IndexedDB:

1. Abre DevTools (F12)
2. Ve a la pestaña "Application" → "IndexedDB" → "REACT_QUERY_OFFLINE_CACHE"  
3. Abre "PersistedClient" o "mutations"
4. Elimina todas las entradas (Delete All)
5. Recarga la página (F5)

O ejecuta esto en la consola del navegador:

```javascript
// Limpiar toda la caché de mutaciones
indexedDB.deleteDatabase('REACT_QUERY_OFFLINE_CACHE');
location.reload();
```

Esto eliminará las mutaciones corruptas encoladas y permitirá que el sistema funcione correctamente con los nuevos guards.
