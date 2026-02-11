-- Create RPC for auto-cancelling stale orders
CREATE OR REPLACE FUNCTION auto_cancel_stale_orders()
RETURNS TABLE (id UUID, order_number TEXT) AS $$
DECLARE
    v_cancelled_orders RECORD;
BEGIN
    RETURN QUERY
    WITH stale_orders AS (
        SELECT pl.id
        FROM picking_lists pl
        LEFT JOIN user_presence up ON pl.user_id = up.user_id
        WHERE pl.status IN ('building', 'needs_correction')
          AND pl.last_activity_at < NOW() - INTERVAL '15 minutes'
          AND (up.last_seen_at IS NULL OR up.last_seen_at < NOW() - INTERVAL '2 minutes')
    )
    UPDATE picking_lists pl
    SET status = 'cancelled'
    FROM stale_orders s
    WHERE pl.id = s.id
    RETURNING pl.id, pl.order_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
