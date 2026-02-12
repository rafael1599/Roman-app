-- Update auto_cancel_stale_orders to include logic for 'ready_to_double_check' orders > 24 hours
-- These orders must have their inventory released before cancellation.

-- ERROR: 42P13: cannot change return type of existing function
-- So we must drop it first.
DROP FUNCTION IF EXISTS public.auto_cancel_stale_orders();

CREATE OR REPLACE FUNCTION public.auto_cancel_stale_orders()
 RETURNS TABLE(id uuid, order_number text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_stale_building RECORD;
    v_expired_verification RECORD;
    v_item JSONB;
    v_sku TEXT;
    v_warehouse TEXT;
    v_location TEXT;
    v_qty INTEGER;
BEGIN
    -- 1. Handle existing logic: 'building' orders (No inventory to release)
    -- Just cancel them if inactive for > 15 mins
    RETURN QUERY
    WITH cancelled_building AS (
        UPDATE picking_lists pl
        SET status = 'cancelled', updated_at = NOW()
        FROM user_presence up
        WHERE pl.user_id = up.user_id
          AND pl.status = 'building'
          AND pl.last_activity_at < NOW() - INTERVAL '15 minutes'
          AND (up.last_seen_at IS NULL OR up.last_seen_at < NOW() - INTERVAL '2 minutes')
        RETURNING pl.id, pl.order_number, 'cancelled_building'::text as status
    )
    SELECT * FROM cancelled_building;

    -- 2. Handle NEW logic: 'ready_to_double_check'/'double_checking' orders > 24 hours
    -- THESE HAVE DEDUCTED INVENTORY. Must release via adjust_inventory_quantity.
    
    FOR v_expired_verification IN 
        SELECT * FROM picking_lists 
        WHERE status IN ('ready_to_double_check', 'double_checking') 
        AND updated_at < NOW() - INTERVAL '24 hours'
        FOR UPDATE -- Lock rows
    LOOP
        -- Restore Inventory
        IF v_expired_verification.items IS NOT NULL THEN
            FOR v_item IN SELECT * FROM jsonb_array_elements(v_expired_verification.items)
            LOOP
                v_sku := v_item->>'sku';
                v_warehouse := v_item->>'warehouse';
                v_location := v_item->>'location';
                v_qty := (v_item->>'pickingQty')::integer; 
                
                -- Fallback to 'qty' if pickingQty is missing, but prioritize pickingQty as that's what was deducted
                IF v_qty IS NULL THEN
                    v_qty := (v_item->>'qty')::integer;
                END IF;
                
                IF v_qty IS NOT NULL AND v_qty > 0 THEN
                    -- Add back (p_delta is positive)
                    -- We catch potential errors here to ensure one bad item doesn't crash the whole batch, 
                    -- though ideally we want it to fail if it can't restore. 
                    BEGIN
                        PERFORM public.adjust_inventory_quantity(
                            v_sku, 
                            v_warehouse, 
                            v_location, 
                            v_qty, 
                            'System Auto-Cancel', 
                            NULL, -- user_id
                            'system', -- role
                            v_expired_verification.id, 
                            v_expired_verification.order_number,
                            'Auto-cancel verification timeout'
                        );
                    EXCEPTION WHEN OTHERS THEN
                        -- Log error but continue cancelling? Or abort? 
                        -- For now, let's propagate error to be safe, so we don't have cancelled orders with missing inventory.
                        RAISE NOTICE 'Error restoring inventory for order % SKU %: %', v_expired_verification.order_number, v_sku, SQLERRM;
                        RAISE; 
                    END;
                END IF;
            END LOOP;
        END IF;

        -- Mark as Cancelled
        UPDATE picking_lists 
        SET status = 'cancelled', 
            updated_at = NOW(),
            notes = COALESCE(notes, '') || ' [System: Auto-cancelled due to 24h verification timeout]'
        WHERE picking_lists.id = v_expired_verification.id;
        
        -- Return this row
        id := v_expired_verification.id;
        order_number := v_expired_verification.order_number;
        status := 'cancelled_verification_timeout';
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$function$;
