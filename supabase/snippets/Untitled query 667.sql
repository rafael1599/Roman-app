-- 1. Crear la nueva columna
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Migrar los datos: 'active' -> true, cualquier otro -> false
UPDATE public.inventory 
SET is_active = (status = 'active') 
WHERE is_active IS NULL;

-- 3. Eliminar la columna vieja (ya no la necesitamos)
ALTER TABLE public.inventory DROP COLUMN IF EXISTS status;

-- 4. Opcional: Agregar un índice para que las búsquedas de activos sean instantáneas
CREATE INDEX IF NOT EXISTS idx_inventory_is_active ON public.inventory(is_active) WHERE is_active = true;