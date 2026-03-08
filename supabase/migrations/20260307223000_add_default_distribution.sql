-- Migration: Add default distribution logic for inventory
-- Purpose: Automatically assign a "TOWER" distribution to items that don't have one specified.

CREATE OR REPLACE FUNCTION public.set_default_inventory_distribution()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo aplicamos si la distribución está vacía y hay cantidad > 0
    IF (NEW.distribution IS NULL OR NEW.distribution = '[]'::jsonb) AND NEW.quantity > 0 THEN
        NEW.distribution := jsonb_build_array(
            jsonb_build_object(
                'type', 'TOWER',
                'count', 1,
                'units_each', NEW.quantity,
                'label', 'Auto-generated tower'
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger que se ejecuta antes de insertar o cuando cambia la cantidad/distribución
DROP TRIGGER IF EXISTS tr_inventory_default_distribution ON public.inventory;
CREATE TRIGGER tr_inventory_default_distribution
BEFORE INSERT OR UPDATE OF quantity, distribution ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.set_default_inventory_distribution();

-- Aplicar retroactivamente a la data existente (en caso de que ya haya algo)
UPDATE public.inventory
SET distribution = jsonb_build_array(
    jsonb_build_object(
        'type', 'TOWER',
        'count', 1,
        'units_each', quantity,
        'label', 'Auto-generated tower'
    )
)
WHERE (distribution IS NULL OR distribution = '[]'::jsonb)
  AND quantity > 0;
