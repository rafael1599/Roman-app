-- =============================================================================
-- adjust_distribution: Decrements distribution JSONB when units are deducted.
-- Order: PALLET → LINE → TOWER → OTHER → Sueltas
-- Within same type: smallest units_each first.
-- "Breaking" a group keeps the residual as same type with reduced units_each.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.adjust_distribution(
    p_item_id INTEGER,
    p_qty_to_deduct INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_distribution JSONB;
    v_new_distribution JSONB := '[]'::JSONB;
    v_pending INTEGER;
    v_type TEXT;
    v_types TEXT[] := ARRAY['PALLET', 'LINE', 'TOWER', 'OTHER'];
    v_entries JSONB;
    v_entry JSONB;
    v_count INTEGER;
    v_units_each INTEGER;
    v_full_remove INTEGER;
    v_actual_remove INTEGER;
    v_residual INTEGER;
    v_result JSONB := '[]'::JSONB;
BEGIN
    IF p_qty_to_deduct <= 0 THEN
        RETURN NULL;
    END IF;

    -- Get current distribution
    SELECT distribution INTO v_distribution
    FROM inventory WHERE id = p_item_id;

    IF v_distribution IS NULL OR jsonb_array_length(v_distribution) = 0 THEN
        RETURN v_distribution;
    END IF;

    v_pending := p_qty_to_deduct;

    -- Process each type in order: PALLET → LINE → TOWER → OTHER
    FOREACH v_type IN ARRAY v_types
    LOOP
        -- Collect entries of this type, sorted by units_each ASC (smallest first)
        FOR v_entry IN
            SELECT e.value
            FROM jsonb_array_elements(v_distribution) AS e(value)
            WHERE e.value->>'type' = v_type
            ORDER BY (e.value->>'units_each')::INTEGER ASC
        LOOP
            v_count := (v_entry->>'count')::INTEGER;
            v_units_each := (v_entry->>'units_each')::INTEGER;

            IF v_pending <= 0 OR v_count <= 0 OR v_units_each <= 0 THEN
                -- No more to deduct, keep entry as-is
                v_result := v_result || jsonb_build_array(v_entry);
                CONTINUE;
            END IF;

            -- How many full groups can we remove?
            v_full_remove := LEAST(floor(v_pending::NUMERIC / v_units_each)::INTEGER, v_count);
            v_count := v_count - v_full_remove;
            v_pending := v_pending - (v_full_remove * v_units_each);

            -- If still pending and groups remain, break one
            IF v_pending > 0 AND v_count > 0 THEN
                v_count := v_count - 1;
                v_residual := v_units_each - v_pending;
                v_pending := 0;

                -- Add the residual as a new entry (same type, reduced units_each)
                IF v_residual > 0 THEN
                    v_result := v_result || jsonb_build_array(
                        jsonb_build_object(
                            'type', v_type,
                            'count', 1,
                            'units_each', v_residual
                        )
                    );
                END IF;
            END IF;

            -- Keep remaining intact groups
            IF v_count > 0 THEN
                IF v_entry ? 'label' THEN
                    v_result := v_result || jsonb_build_array(
                        jsonb_build_object(
                            'type', v_type,
                            'count', v_count,
                            'units_each', v_units_each,
                            'label', v_entry->>'label'
                        )
                    );
                ELSE
                    v_result := v_result || jsonb_build_array(
                        jsonb_build_object(
                            'type', v_type,
                            'count', v_count,
                            'units_each', v_units_each
                        )
                    );
                END IF;
            END IF;
        END LOOP;

        -- Collect entries NOT of this type (they pass through to be processed in their turn)
        -- (Already handled by the FOREACH loop processing each type)
    END LOOP;

    -- Update the inventory item
    UPDATE inventory
    SET distribution = v_result,
        updated_at = NOW()
    WHERE id = p_item_id;

    RETURN v_result;
END;
$$;

ALTER FUNCTION public.adjust_distribution(INTEGER, INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.adjust_distribution(INTEGER, INTEGER) TO anon, authenticated, service_role;


-- =============================================================================
-- Modify adjust_inventory_quantity to call adjust_distribution on deductions
-- =============================================================================

CREATE OR REPLACE FUNCTION public.adjust_inventory_quantity(
    p_sku text,
    p_warehouse text,
    p_location text,
    p_delta integer,
    p_performed_by text,
    p_user_id uuid,
    p_user_role text DEFAULT 'staff'::text,
    p_list_id uuid DEFAULT NULL::uuid,
    p_order_number text DEFAULT NULL::text,
    p_merge_note text DEFAULT NULL::text,
    p_skip_log boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_item_id INTEGER;
    v_location_id UUID;
    v_location_name TEXT;
    v_prev_qty INTEGER;
    v_new_qty INTEGER;
    v_actual_delta INTEGER;
    v_snapshot JSONB;
BEGIN
    v_location_id := public.resolve_location(p_warehouse, p_location, p_user_role);
    SELECT location INTO v_location_name FROM locations WHERE id = v_location_id;

    IF v_location_id IS NOT NULL AND v_location_name IS NULL THEN
        v_location_name := UPPER(TRIM(p_location));
    END IF;

    v_actual_delta := p_delta;

    SELECT id, quantity, row_to_json(inventory.*)::jsonb INTO v_item_id, v_prev_qty, v_snapshot
    FROM inventory
    WHERE sku = p_sku
      AND warehouse = p_warehouse
      AND UPPER(TRIM(COALESCE(location, ''))) = UPPER(TRIM(COALESCE(v_location_name, '')))
    FOR UPDATE;

    IF v_item_id IS NULL THEN
        v_prev_qty := 0;
        IF p_delta < 0 THEN
            v_actual_delta := 0;
            v_new_qty := 0;
        ELSE
            v_new_qty := p_delta;
        END IF;

        INSERT INTO inventory (sku, warehouse, location, location_id, quantity, is_active, item_name)
        VALUES (p_sku, p_warehouse, v_location_name, v_location_id, v_new_qty, (v_new_qty > 0), p_merge_note)
        RETURNING id INTO v_item_id;
    ELSE
        v_new_qty := v_prev_qty + p_delta;
        IF v_new_qty < 0 THEN
            v_new_qty := 0;
            v_actual_delta := -v_prev_qty;
        END IF;

        UPDATE inventory SET
            quantity    = v_new_qty,
            location_id = v_location_id,
            location    = v_location_name,
            is_active   = CASE WHEN v_new_qty > 0 THEN true ELSE is_active END,
            updated_at  = NOW(),
            item_name = CASE
                WHEN p_merge_note IS NOT NULL AND LENGTH(TRIM(p_merge_note)) > 0 THEN
                    CASE
                        WHEN item_name IS NULL OR LENGTH(TRIM(item_name)) = 0 THEN p_merge_note
                        WHEN item_name != p_merge_note AND item_name NOT LIKE '%' || p_merge_note || '%' THEN item_name || ' | ' || p_merge_note
                        ELSE item_name
                    END
                ELSE item_name
            END
        WHERE id = v_item_id;

        -- NEW: Adjust distribution when deducting
        IF v_actual_delta < 0 THEN
            PERFORM public.adjust_distribution(v_item_id, (-v_actual_delta));
        END IF;
    END IF;

    IF NOT p_skip_log AND v_actual_delta != 0 THEN
        PERFORM public.upsert_inventory_log(
            p_sku, p_warehouse, v_location_name, p_warehouse, v_location_name,
            v_actual_delta, v_prev_qty, v_new_qty, (CASE WHEN v_actual_delta > 0 THEN 'ADD' ELSE 'DEDUCT' END),
            v_item_id, v_location_id, v_location_id, p_performed_by, p_user_id, p_list_id, p_order_number, v_snapshot
        );
    END IF;

    RETURN (SELECT row_to_json(i)::jsonb FROM inventory i WHERE id = v_item_id);
END;
$function$;
