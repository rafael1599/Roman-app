-- Forzamos la recarga total del cache de la API
NOTIFY pgrst, 'reload schema';
-- Y verificamos que la función exista para PostgREST
SELECT has_function_privilege('anon', 'delete_inventory_item(integer, text, uuid)', 'execute');
