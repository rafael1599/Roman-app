# Plan: Arreglo de Doble Toque en Búsqueda

Este plan aborda el problema donde el usuario debe tocar dos veces un resultado de búsqueda para interactuar con él (el primer toque solo cierra el teclado y resetea el layout).

## Problema
En `SearchInput.tsx`, el evento `onBlur` ejecuta `setIsSearching(false)` de manera inmediata. Esto provoca un cambio instantáneo en el layout (los encabezados vuelven a aparecer y los márgenes cambian) justo antes de que el evento `onClick` del resultado se procese. Como el elemento se mueve de posición, el clic se pierde.

## Solución
Introducir un pequeño retraso (delay) al salir del estado de búsqueda.

### Pasos Técnicos
1. **Modificar `SearchInput.tsx`**:
    - Cambiar `onBlur={() => setIsSearching(false)}` por una función que use `setTimeout`.
    - Usar un retraso de **200ms**. Este tiempo es suficiente para que el navegador procese el clic en el elemento antes de que el layout cambie, pero lo suficientemente corto como para que no se sienta lento.

2. **Verificación**:
    - Al tocar un resultado, la acción (seleccionar SKU o pedido) debe ejecutarse al primer toque.
    - El teclado debe cerrarse y el layout debe restaurarse suavemente tras el breve retraso.

## Código a modificar
Archivo: `src/components/ui/SearchInput.tsx`
```tsx
// Antes
onBlur={() => setIsSearching(false)}

// Después
onBlur={() => setTimeout(() => setIsSearching(false), 200)}
```
